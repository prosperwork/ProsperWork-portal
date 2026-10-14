create table public.pw_hiring_cases(
 id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 2 and 120),
 email text not null check(length(email) between 3 and 254),desired_role text not null check(desired_role in('teacher','admin','head_admin','qc','hr','finance','sales_marketing','social_media')),
 reviewer_id uuid not null references public.pw_profiles,staff_id uuid unique references public.pw_profiles,
 created_by uuid not null references public.pw_profiles,created_at timestamptz not null default now(),
 stage text not null default 'applied' check(stage in('applied','interview','selected','ready','activated','rejected')),
 interview_at timestamptz,start_date date,guidelines_file uuid references public.pw_files,agreement_file uuid references public.pw_files,
 accepted_at timestamptz,accepted_by uuid references public.pw_profiles,signed_name text,
 finalized_by uuid references public.pw_profiles,finalized_at timestamptz,activated_by uuid references public.pw_profiles,activated_at timestamptz
);
create unique index pw_hiring_open_email on public.pw_hiring_cases(lower(email)) where stage not in('activated','rejected');
create table public.pw_hiring_reviews(
 id uuid primary key default gen_random_uuid(),case_id uuid not null references public.pw_hiring_cases,
 kind text not null check(kind in('hr_interview','department_interview','audition','training')),reviewer_id uuid not null references public.pw_profiles,
 score integer not null check(score between 0 and 100),passed boolean not null,notes text not null check(length(notes) between 5 and 2000),created_at timestamptz not null default now(),
 unique(case_id,kind)
);
create table public.pw_hiring_events(
 id bigint generated always as identity primary key,case_id uuid not null references public.pw_hiring_cases,
 actor_id uuid not null references public.pw_profiles,action text not null,notes text not null,created_at timestamptz not null default now()
);
create function public.pw_hiring_manager(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.pw_active() and exists(select 1 from public.pw_hiring_cases c where c.id=p_id and(public.pw_role() in('super_admin','hr') or c.reviewer_id=auth.uid()))
$$;
create function public.pw_hiring_subject(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.pw_session_allowed() and exists(select 1 from public.pw_hiring_cases c join public.pw_profiles s on s.id=c.staff_id
 where c.id=p_id and s.id=auth.uid() and s.role=c.desired_role and s.status in('applicant','active','on_leave') and c.stage not in('applied','interview'))
$$;
alter table public.pw_hiring_cases enable row level security;
alter table public.pw_hiring_reviews enable row level security;
alter table public.pw_hiring_events enable row level security;
revoke all on public.pw_hiring_cases,public.pw_hiring_reviews,public.pw_hiring_events from anon,authenticated;
grant select on public.pw_hiring_cases,public.pw_hiring_reviews,public.pw_hiring_events to authenticated;
create policy hiring_case_read on public.pw_hiring_cases for select to authenticated using(public.pw_session_allowed() and(public.pw_hiring_manager(id) or public.pw_hiring_subject(id)));
create policy hiring_review_read on public.pw_hiring_reviews for select to authenticated using(public.pw_session_allowed() and public.pw_hiring_manager(case_id));
create policy hiring_event_read on public.pw_hiring_events for select to authenticated using(public.pw_session_allowed() and public.pw_hiring_manager(case_id));
create trigger hiring_review_permanent before update or delete on public.pw_hiring_reviews for each row execute function public.pw_protect_lesson_event();
create trigger hiring_event_permanent before update or delete on public.pw_hiring_events for each row execute function public.pw_protect_lesson_event();
create function public.pw_hiring_file_allowed(p_category text,p_target text,p_write boolean) returns boolean language sql stable security definer set search_path='' as $$
 select public.pw_session_allowed() and exists(select 1 from public.pw_hiring_cases c where c.id::text=p_target and
 case when p_write then public.pw_active() and c.stage not in('ready','activated','rejected') and
  case when p_category='hiring_agreement' then public.pw_role() in('super_admin','hr') else public.pw_hiring_manager(c.id) end
 else (public.pw_hiring_subject(c.id) and (p_category='hiring_guidelines' or p_category='hiring_agreement'))
  or (public.pw_hiring_manager(c.id) and(p_category<>'hiring_agreement' or public.pw_role()='super_admin' or(c.stage not in('ready','activated') and public.pw_role()='hr')))
  or (public.pw_active() and public.pw_role()='finance' and c.stage in('ready','activated') and p_category='hiring_agreement') end)
$$;
alter table public.pw_files drop constraint pw_files_category_check;
alter table public.pw_files add constraint pw_files_category_check check(category in('receipt','homework','curriculum','policy','avatar','practice','hiring_evidence','hiring_guidelines','hiring_agreement'));
do $migration$
declare definition text;pol record;
begin
 select pg_get_functiondef('public.pw_file_allowed(text,text,boolean)'::regprocedure) into definition;
 if position('select coalesce(' in definition)=0 then raise exception 'Unexpected file authorization body';end if;
 definition:=replace(definition,'select coalesce(','select (p_category in(''hiring_evidence'',''hiring_guidelines'',''hiring_agreement'') and public.pw_hiring_file_allowed(p_category,p_target,p_write)) or coalesce(');
 execute definition;
 for pol in select policyname,qual,with_check from pg_policies where schemaname='public' and tablename='pw_files' and permissive='RESTRICTIVE' and qual like '%pw_portal_allowed%' loop
  execute format('alter policy %I on public.pw_files using ((%s) or (category in(''hiring_evidence'',''hiring_guidelines'',''hiring_agreement'') and public.pw_hiring_file_allowed(category,target_id,false)))',pol.policyname,pol.qual);
 end loop;
end $migration$;
create function public.pw_finish_hiring_file(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare f public.pw_files;
begin
 select * into f from public.pw_files where id=p_id for update;
 if f.id is null or f.complete or f.uploader_id<>auth.uid() or f.category not in('hiring_evidence','hiring_guidelines','hiring_agreement') or not public.pw_hiring_file_allowed(f.category,f.target_id,true)
 then raise exception 'Authorized hiring upload required' using errcode='42501';end if;
 if f.category in('hiring_guidelines','hiring_agreement') and f.mime<>'application/pdf' then raise exception 'Actual PDF required' using errcode='22023';end if;
 if not exists(select 1 from storage.objects where bucket_id='pw-private' and name=f.path) then raise exception 'Upload missing' using errcode='22023';end if;
 update public.pw_files set complete=true where id=p_id;
end $$;
create function public.pw_hiring_action(p_action text,p_id uuid default null,p_data jsonb default '{}') returns uuid
language plpgsql security definer set search_path='' as $$
declare r text:=public.pw_role();c public.pw_hiring_cases;s public.pw_profiles;reviewer public.pw_profiles;
 result uuid;p_kind text;p_notes text:=trim(coalesce(p_data->>'notes',''));fid uuid;rate public.pw_salary_rates;
begin
 if not public.pw_session_allowed() or auth.uid() is null then raise exception 'Signed-in session required' using errcode='42501';end if;
 if p_action='create' then
  if not public.pw_active() or r not in('super_admin','hr') or r is null then raise exception 'HR creation required' using errcode='42501';end if;
  select * into reviewer from public.pw_profiles where id=(p_data->>'reviewerId')::uuid and status='active';
  if reviewer.id is null or reviewer.id=auth.uid() or reviewer.role<>(case p_data->>'role' when 'teacher' then 'qc' when 'admin' then 'head_admin' when 'head_admin' then 'super_admin' when 'qc' then 'super_admin' when 'hr' then 'super_admin' else p_data->>'role' end)
  then raise exception 'Choose an independent, active departmental interviewer' using errcode='23514';end if;
  if length(trim(p_data->>'name')) not between 2 and 120 or p_data->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_data->>'email')>254 or length(p_notes) not between 5 and 2000
  then raise exception 'Applicant contact details and reason required' using errcode='22023';end if;
  insert into public.pw_hiring_cases(name,email,desired_role,reviewer_id,created_by) values(trim(p_data->>'name'),lower(trim(p_data->>'email')),p_data->>'role',reviewer.id,auth.uid()) returning id into result;
 else
  select * into c from public.pw_hiring_cases where id=p_id for update;
  if c.id is null or not(public.pw_hiring_manager(c.id) or(p_action='accept' and public.pw_hiring_subject(c.id))) then raise exception 'Hiring case not accessible' using errcode='42501';end if;
  if c.stage in('activated','rejected') then raise exception 'Closed hiring case is permanent' using errcode='40001';end if;
  result:=c.id;
  if p_action<>'accept' and length(p_notes) not between 5 and 2000 then raise exception 'Written evidence or reason required' using errcode='22023';end if;
  if p_action='schedule' then
   if r not in('super_admin','hr') or c.stage not in('applied','interview') then raise exception 'HR schedules the joint interview' using errcode='42501';end if;
   if (p_data->>'at')::timestamptz>clock_timestamp()+interval '1 year' or (p_data->>'at')::timestamptz<clock_timestamp()-interval '2 years' then raise exception 'Invalid interview date' using errcode='22023';end if;
   update public.pw_hiring_cases set stage='interview',interview_at=(p_data->>'at')::timestamptz where id=c.id;
  elsif p_action='review' then
   p_kind:=p_data->>'kind';
   if p_kind='hr_interview' and r not in('super_admin','hr') or p_kind<>'hr_interview' and c.reviewer_id<>auth.uid() then raise exception 'Assigned interviewer required' using errcode='42501';end if;
   if p_kind='training' and c.stage<>'selected' or p_kind<>'training' and(c.stage<>'interview' or c.interview_at>clock_timestamp())
    or p_kind='audition' and c.desired_role<>'teacher' then raise exception 'Complete interviews before training' using errcode='23514';end if;
   if p_kind='hr_interview' and exists(select 1 from public.pw_hiring_reviews where case_id=c.id and kind='department_interview' and reviewer_id=auth.uid())
    or p_kind='department_interview' and exists(select 1 from public.pw_hiring_reviews where case_id=c.id and kind='hr_interview' and reviewer_id=auth.uid())
    then raise exception 'Joint interviews need two distinct people' using errcode='42501';end if;
   insert into public.pw_hiring_reviews(case_id,kind,reviewer_id,score,passed,notes) values(c.id,p_kind,auth.uid(),(p_data->>'score')::integer,(p_data->>'passed')::boolean,p_notes);
  elsif p_action='select' then
   if r not in('super_admin','hr') then raise exception 'HR selection required' using errcode='42501';end if;
   if c.stage<>'interview' or not exists(select 1 from public.pw_hiring_reviews where case_id=c.id and kind='hr_interview' and passed)
    or not exists(select 1 from public.pw_hiring_reviews where case_id=c.id and kind='department_interview' and passed)
    or(c.desired_role='teacher' and not exists(select 1 from public.pw_hiring_reviews where case_id=c.id and kind='audition' and passed))
    then raise exception 'Joint passing interview and teacher audition required' using errcode='23514';end if;
   update public.pw_hiring_cases set stage='selected' where id=c.id;
  elsif p_action='bind' then
   if r<>'super_admin' then raise exception 'Owner links provisioned identities' using errcode='42501';end if;
   select * into s from public.pw_profiles where id=(p_data->>'staffId')::uuid;
   if c.stage<>'selected' or c.staff_id is not null or s.id is null or s.status<>'applicant' or s.role<>c.desired_role or lower(s.email)<>c.email then raise exception 'Matching owner-provisioned applicant account required' using errcode='23514';end if;
   update public.pw_hiring_cases set staff_id=s.id where id=c.id;
   if c.desired_role='teacher' then update public.pw_profiles set qc_id=c.reviewer_id where id=s.id;end if;
   if c.desired_role='admin' then update public.pw_profiles set head_admin_id=c.reviewer_id where id=s.id;end if;
  elsif p_action='document' then
   if c.stage<>'selected' then raise exception 'Applicant must be selected first' using errcode='23514';end if;
   fid:=(p_data->>'fileId')::uuid;
   if not exists(select 1 from public.pw_files where id=fid and target_id=c.id::text and category='hiring_'||(p_data->>'kind') and complete and mime='application/pdf')
    then raise exception 'Completed case-scoped PDF required' using errcode='23514';end if;
   if p_data->>'kind'='agreement' then
    if r<>'super_admin' then raise exception 'Owner must approve the actual staff agreement' using errcode='42501';end if;
    update public.pw_hiring_cases set agreement_file=fid,accepted_at=null,accepted_by=null,signed_name=null where id=c.id;
   elsif p_data->>'kind'='guidelines' then
    update public.pw_hiring_cases set guidelines_file=fid,accepted_at=null,accepted_by=null,signed_name=null where id=c.id;
   else raise exception 'Unknown document' using errcode='22023';end if;
  elsif p_action='accept' then
   if not public.pw_hiring_subject(c.id) or c.staff_id<>auth.uid() or c.stage<>'selected' or c.agreement_file is null or c.guidelines_file is null or (p_data->>'agreed')::boolean is distinct from true
    or lower(trim(p_data->>'signedName'))<>lower(c.name) or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null)
    then raise exception 'The verified applicant must accept their own current PDFs' using errcode='42501';end if;
   update public.pw_hiring_cases set accepted_at=clock_timestamp(),accepted_by=auth.uid(),signed_name=trim(p_data->>'signedName') where id=c.id;
   p_notes:='Applicant accepted the current staff agreement and guidelines';
  elsif p_action='handoff' then
   if c.desired_role='teacher' and c.reviewer_id<>auth.uid() or c.desired_role<>'teacher' and r not in('super_admin','hr') then raise exception 'QC finalizes teachers; HR finalizes other staff' using errcode='42501';end if;
   if c.stage<>'selected' or c.staff_id is null or c.accepted_at is null or not exists(select 1 from public.pw_hiring_reviews where case_id=c.id and kind='training' and passed) then raise exception 'Training, linked identity and applicant acceptance required' using errcode='23514';end if;
   select * into rate from public.pw_salary_rates where staff_id=c.staff_id and status='approved' and effective_from<=(p_data->>'startDate')::date order by effective_from desc,decided_at desc limit 1;
   if rate.id is null or not exists(select 1 from public.pw_salary_banks where staff_id=c.staff_id and currency=rate.terms->>'currency') then raise exception 'Owner-approved initial pay and matching private bank instructions required' using errcode='23514';end if;
   if (p_data->>'startDate')::date not between '2000-01-01'::date and '2100-12-31'::date then raise exception 'Actual staff start date required' using errcode='22023';end if;
   update public.pw_hiring_cases set stage='ready',start_date=(p_data->>'startDate')::date,finalized_by=auth.uid(),finalized_at=clock_timestamp() where id=c.id;
  elsif p_action='activate' then
   if r<>'super_admin' then raise exception 'Owner activation required' using errcode='42501';end if;
   if c.stage<>'ready' or not exists(select 1 from public.pw_profiles where id=c.staff_id and status='applicant' and role=c.desired_role) then raise exception 'Completed onboarding for an applicant account required' using errcode='23514';end if;
   update public.pw_profiles set status='active' where id=c.staff_id;
   update public.pw_hiring_cases set stage='activated',activated_by=auth.uid(),activated_at=clock_timestamp() where id=c.id;
  elsif p_action='reject' then
   if r not in('super_admin','hr') or c.stage='ready' then raise exception 'HR rejection required before finalized handoff' using errcode='42501';end if;
   update public.pw_hiring_cases set stage='rejected' where id=c.id;
  else raise exception 'Unknown hiring action' using errcode='22023';end if;
 end if;
 insert into public.pw_hiring_events(case_id,actor_id,action,notes) values(result,auth.uid(),p_action,p_notes);
 return result;
end $$;
create function public.pw_hiring_directory() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role,'status',status,'timezone',timezone,'email',case when public.pw_role()='super_admin' then email else null end) order by name),'[]')
 from public.pw_profiles where public.pw_active() and public.pw_role() in('super_admin','hr','qc','head_admin','finance','sales_marketing','social_media')
 and role not in('parent','student','general_manager') and(status='active' or(public.pw_role()='super_admin' and status='applicant'))
$$;
create function public.pw_hiring_handoffs() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'staff_id',c.staff_id,'name',c.name,'role',c.desired_role,'stage',c.stage,'start_date',c.start_date,'timezone',s.timezone,'finalized_at',c.finalized_at)),'[]')
 from public.pw_hiring_cases c join public.pw_profiles s on s.id=c.staff_id where c.stage in('ready','activated')
 and public.pw_active() and public.pw_role() in('super_admin','finance','head_admin','admin')
$$;
revoke all on function public.pw_hiring_manager(uuid),public.pw_hiring_subject(uuid),public.pw_hiring_file_allowed(text,text,boolean),public.pw_finish_hiring_file(uuid),public.pw_hiring_action(text,uuid,jsonb),public.pw_hiring_directory(),public.pw_hiring_handoffs() from public,anon;
grant execute on function public.pw_hiring_manager(uuid),public.pw_hiring_subject(uuid),public.pw_hiring_file_allowed(text,text,boolean),public.pw_finish_hiring_file(uuid),public.pw_hiring_action(text,uuid,jsonb),public.pw_hiring_directory(),public.pw_hiring_handoffs() to authenticated;
