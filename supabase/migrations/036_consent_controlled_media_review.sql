create table public.pw_media_reviews(id uuid primary key default gen_random_uuid(),student_id text not null references public.pw_students,file_id uuid unique not null references public.pw_files,submitted_by uuid not null references public.pw_profiles,status text not null default 'pending' check(status in('pending','approved','rejected','published','withdrawn')),notes text not null,reviewed_by uuid references public.pw_profiles,reviewed_at timestamptz,published_url text,created_at timestamptz default now());
alter table public.pw_media_reviews enable row level security;
revoke all on public.pw_media_reviews from anon,authenticated;
grant select on public.pw_media_reviews to authenticated;
create policy pw_media_read on public.pw_media_reviews for select to authenticated using(public.pw_active() and public.pw_portal_allowed() and(
 public.pw_role()='super_admin' or submitted_by=auth.uid() or(public.pw_role() in('admin','head_admin','qc') and public.pw_can_student(student_id)) or
 (public.pw_role()='social_media' and(status='withdrawn' or(status in('approved','published') and exists(select 1 from public.pw_students s where s.id=student_id and coalesce((s.payload->>'consent')::boolean,false)))))));
create function public.pw_media_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r text:=public.pw_role();s public.pw_students;f public.pw_files;m public.pw_media_reviews;sid text;uid uuid;notes text:=btrim(coalesce(p_data->>'notes',''));
begin
 if not coalesce(public.pw_active() and public.pw_portal_allowed(),false) or length(notes)<5 then raise exception 'Active account and reason required' using errcode='42501';end if;
 if p_action='media_submit' then
  if r not in('super_admin','teacher','qc','admin','head_admin','parent','student') then raise exception 'Portfolio participant required' using errcode='42501';end if;
  select * into f from public.pw_files where id=(p_data->>'fileId')::uuid and complete and category in('homework','practice');
  if f.id is null or not public.pw_file_allowed(f.category,f.target_id,false) then raise exception 'Actual accessible private media required' using errcode='42501';end if;
  if f.category='homework' then select student_id into sid from public.pw_homework where id=f.target_id;
  else select student_id into sid from public.pw_practice where id=f.target_id::uuid;end if;
  select * into s from public.pw_students where id=sid;
  if s.id is null or not public.pw_can_student(s.id) or not coalesce((s.payload->>'consent')::boolean,false) then raise exception 'Guardian social permission is absent' using errcode='23514';end if;
  insert into public.pw_media_reviews(student_id,file_id,submitted_by,notes) values(s.id,f.id,auth.uid(),notes) returning id into uid;
 else
  select * into m from public.pw_media_reviews where id=(p_data->>'id')::uuid for update;
  select * into s from public.pw_students where id=m.student_id;
  if m.id is null then raise exception 'Media record not found' using errcode='42501';end if;
  if p_action='media_review' then
   if not(r='super_admin' or(r in('qc','admin','head_admin') and public.pw_can_student(s.id))) or m.submitted_by=auth.uid() or m.status<>'pending' then raise exception 'Independent safety review required' using errcode='42501';end if;
   if not coalesce((p_data->>'safetyChecked')::boolean,false) then raise exception 'Record the child-safety check' using errcode='23514';end if;
   if(p_data->>'approve')::boolean and not coalesce((s.payload->>'consent')::boolean,false) then raise exception 'Current guardian permission required' using errcode='23514';end if;
   update public.pw_media_reviews set status=case when(p_data->>'approve')::boolean then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),notes=notes||E'\nSafety review: '||btrim(p_data->>'notes') where id=m.id;
  elsif p_action='media_publish' then
   if r not in('super_admin','social_media') or m.status<>'approved' or not coalesce((s.payload->>'consent')::boolean,false) or(p_data->>'url')!~'^https://[^ /]+' then raise exception 'Approved consented media and actual HTTPS publication URL required' using errcode='23514';end if;
   update public.pw_media_reviews set status='published',published_url=p_data->>'url',notes=notes||E'\nPublication: '||btrim(p_data->>'notes') where id=m.id;
  elsif p_action='media_withdraw' then
   if not(r='super_admin' or(r in('parent','student','admin','head_admin','qc') and public.pw_can_student(s.id))) then raise exception 'Guardian or assigned reviewer required' using errcode='42501';end if;
   update public.pw_media_reviews set status='withdrawn',notes=notes||E'\nWithdrawal: '||btrim(p_data->>'notes') where id=m.id;
  else raise exception 'Unknown media action' using errcode='22023';end if;
  uid:=m.id;
 end if;
 insert into public.pw_operations_events(action,subject,actor,notes) values(p_action,uid::text,auth.uid(),notes);
 return jsonb_build_object('ok',true,'id',uid);
end $$;
revoke all on function public.pw_media_action(text,jsonb) from public,anon;
grant execute on function public.pw_media_action(text,jsonb) to authenticated;
create function public.pw_media_guardian_withdrawal() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if coalesce((old.payload->>'consent')::boolean,false) and not coalesce((new.payload->>'consent')::boolean,false) then
  update public.pw_media_reviews set status='withdrawn',notes=notes||E'\nGuardian withdrew social permission; remove any existing external publication.' where student_id=new.id and status in('pending','approved','published');
 end if;
 return new;
end $$;
create trigger pw_media_withdrawal after update on public.pw_students for each row execute function public.pw_media_guardian_withdrawal();
