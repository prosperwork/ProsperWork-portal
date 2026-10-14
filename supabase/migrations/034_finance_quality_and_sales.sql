create function public.pw_financial_summary() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;converted jsonb;rules public.pw_finance_rules;profit_allowed boolean;
begin
 if not coalesce(public.pw_active() and public.pw_role() in('super_admin','finance'),false) then return '[]';end if;
 select * into rules from public.pw_finance_rules;profit_allowed:=public.pw_role()='super_admin' or rules.finance_profit;
 with entries as(
  select payload->>'currency' currency,(payload->>'amount')::numeric amount,'income' kind,verified_at::date date from public.pw_payments where verified_at is not null and payload->>'status'='paid'
  union all select payload->>'currency',(payload->>'amount')::numeric,'expenses',(payload->>'date')::date from public.pw_expenses
  union all select currency,net,'payroll',paid_at::date from public.pw_salary_statements where paid_at is not null
 ),totals as(select currency,coalesce(sum(amount) filter(where kind='income'),0) income,coalesce(sum(amount) filter(where kind='expenses'),0) expenses,coalesce(sum(amount) filter(where kind='payroll'),0) payroll from entries group by currency)
 select coalesce(jsonb_agg(jsonb_build_object('currency',currency,'income',income,'expenses',expenses,'payroll',payroll)||case when profit_allowed then jsonb_build_object('estimatedTax',greatest(0,income-expenses-payroll)*rules.tax_percent/100,'profit',income-expenses-payroll-greatest(0,income-expenses-payroll)*rules.tax_percent/100) else '{}'::jsonb end),'[]') into result from totals;
 with entries as(
  select payload->>'currency' currency,(payload->>'amount')::numeric amount,'income' kind,verified_at::date date from public.pw_payments where verified_at is not null and payload->>'status'='paid'
  union all select payload->>'currency',(payload->>'amount')::numeric,'expenses',(payload->>'date')::date from public.pw_expenses
  union all select currency,net,'payroll',paid_at::date from public.pw_salary_statements where paid_at is not null
 ),converted_entries as(select e.*,case when currency='NGN' then 1 else(select rate from public.pw_fx_rates where currency=e.currency and date<=e.date order by date desc limit 1) end rate from entries e),
 totals as(select count(*) filter(where rate is null) missing,coalesce(sum(amount*rate) filter(where kind='income'),0) income,coalesce(sum(amount*rate) filter(where kind='expenses'),0) expenses,coalesce(sum(amount*rate) filter(where kind='payroll'),0) payroll from converted_entries)
 select jsonb_build_object('currency','NGN (dated conversion)','missingRates',missing,'income',case when missing=0 then income else null end,'expenses',case when missing=0 then expenses else null end,'payroll',case when missing=0 then payroll else null end)||case when profit_allowed then jsonb_build_object('estimatedTax',case when missing=0 then greatest(0,income-expenses-payroll)*rules.tax_percent/100 else null end,'profit',case when missing=0 then income-expenses-payroll-greatest(0,income-expenses-payroll)*rules.tax_percent/100 else null end) else '{}'::jsonb end into converted from totals;
 return result||jsonb_build_array(converted);
end $$;
revoke all on function public.pw_financial_summary() from public,anon;
grant execute on function public.pw_financial_summary() to authenticated;

create table public.pw_quality_observations(id uuid primary key default gen_random_uuid(),staff_id uuid not null references public.pw_profiles,reviewer_id uuid not null references public.pw_profiles,kind text not null check(kind in('observation','coaching')),score integer not null check(score between 0 and 100),notes text not null check(length(notes) between 5 and 2000),created_at timestamptz default now());
alter table public.pw_quality_observations enable row level security;
revoke all on public.pw_quality_observations from anon,authenticated;
grant select on public.pw_quality_observations to authenticated;
create policy pw_quality_read on public.pw_quality_observations for select to authenticated using(public.pw_active() and(public.pw_role()='super_admin' or staff_id=auth.uid() or(public.pw_role()='qc' and exists(select 1 from public.pw_profiles t where t.id=staff_id and t.qc_id=auth.uid()))));
create trigger pw_quality_immutable before update or delete on public.pw_quality_observations for each row execute function public.pw_protect_lesson_event();
create function public.pw_quality_snapshot() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('staffId',t.id,'name',t.name,
  'activeStudents',(select count(*) from public.pw_students where teacher_id=t.id and payload->>'status'='active'),
  'verifiedLessons',(select count(*) from public.pw_lessons where teacher_id=t.id and verified_at>=now()-interval '30 days'),
  'missedLessons',(select count(*) from public.pw_lessons where teacher_id=t.id and(payload->>'startsAt')::timestamptz>=now()-interval '30 days' and(payload->>'startsAt')::timestamptz<=now() and payload->>'status'='missed'),
  'emptyBoards',(select count(*) from public.pw_lessons l left join public.pw_lesson_boards b on b.lesson_id=l.id where l.teacher_id=t.id and l.verified_at>=now()-interval '30 days' and(b.lesson_id is null or(b.notes='' and b.next_topics='' and jsonb_array_length(b.completed_topics)=0))),
  'score',(select round(avg(score),1) from public.pw_quality_observations where staff_id=t.id and created_at>=now()-interval '30 days')
 )),'[]') from public.pw_profiles t where public.pw_active() and t.role in('teacher','qc') and(public.pw_role()='super_admin' or t.id=auth.uid() or(public.pw_role()='qc' and t.qc_id=auth.uid()));
$$;
revoke all on function public.pw_quality_snapshot() from public,anon;
grant execute on function public.pw_quality_snapshot() to authenticated;

alter table public.pw_leads add column trial_student_id text references public.pw_students,add column trial_lesson_id text unique references public.pw_lessons,add column trial_verified_at timestamptz,add column converted_at timestamptz;
create function public.pw_lead_clock_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then new.payload:=new.payload||jsonb_build_object('arrivedAt',now());new.payload:=new.payload-'firstResponseAt';
 else
  new.payload:=new.payload||jsonb_build_object('arrivedAt',old.payload->>'arrivedAt');
  new.payload:=new.payload-'firstResponseAt';
  if old.payload ? 'firstResponseAt' then new.payload:=new.payload||jsonb_build_object('firstResponseAt',old.payload->>'firstResponseAt');
  elsif public.pw_role() in('sales_marketing','super_admin') and new.payload->>'status' in('contacted','callback') and old.payload->>'status'='new' then new.payload:=new.payload||jsonb_build_object('firstResponseAt',clock_timestamp());end if;
 end if;
 if new.payload->>'status'='converted' and new.converted_at is null then raise exception 'Use verified permanent conversion, not a status shortcut' using errcode='23514';end if;
 return new;
end $$;
create trigger pw_lead_real_clocks before insert or update on public.pw_leads for each row execute function public.pw_lead_clock_guard();
create function public.pw_trial_verified() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.verified_at is not null and old.verified_at is null then
  update public.pw_leads set trial_verified_at=new.verified_at,payload=payload||jsonb_build_object('status','trial_verified') where trial_lesson_id=new.id and converted_at is null;
 end if;
 return new;
end $$;
create trigger pw_verified_trial after update on public.pw_lessons for each row execute function public.pw_trial_verified();

create function public.pw_quality_sales_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r text:=public.pw_role();t public.pw_profiles;l public.pw_leads;s public.pw_students;pid text;uid uuid;notes text:=btrim(coalesce(p_data->>'notes',''));
begin
 if not coalesce(public.pw_active(),false) or length(notes)<5 then raise exception 'Active account and reason required' using errcode='42501';end if;
 if p_action='observe' then
  select * into t from public.pw_profiles where id=(p_data->>'staffId')::uuid and role in('teacher','qc');
  if t.id is null or not(r='super_admin' or(r='qc' and t.qc_id=auth.uid() and t.id<>auth.uid())) then raise exception 'Independent assigned supervisor required' using errcode='42501';end if;
  insert into public.pw_quality_observations(staff_id,reviewer_id,kind,score,notes) values(t.id,auth.uid(),p_data->>'kind',(p_data->>'score')::integer,notes) returning id into uid;
 else
  select * into l from public.pw_leads where id=p_data->>'id' for update;
  if l.id is null or r not in('super_admin','head_admin','sales_marketing') or(r='sales_marketing' and l.owner_id is distinct from auth.uid()) then raise exception 'Lead is outside your portfolio' using errcode='42501';end if;
  if p_action='lead_assign' then
   if r not in('super_admin','head_admin') then raise exception 'Management assigns leads' using errcode='42501';end if;
   select * into t from public.pw_profiles where id=(p_data->>'staffId')::uuid and role='sales_marketing' and status='active';
   if t.id is null then raise exception 'Active Sales rep required' using errcode='23514';end if;
   update public.pw_leads set owner_id=t.id,payload=payload||jsonb_build_object('owner',t.name) where id=l.id;
  elsif p_action='trial' then
   if r not in('super_admin','head_admin') or l.trial_lesson_id is not null then raise exception 'Head Admin assigns one verified trial' using errcode='42501';end if;
   select * into s from public.pw_students where id=p_data->>'studentId';
   if s.id is null or not public.pw_can_student(s.id) or s.payload->>'status'<>'active' or s.parent_id is null or lower((select email from public.pw_profiles where id=s.parent_id))<>lower(l.payload->>'email') then raise exception 'Trial child must be linked to this lead parent' using errcode='23514';end if;
   if(p_data->>'at')::timestamptz<=now() or not exists(select 1 from public.pw_profiles where id=(p_data->>'teacherId')::uuid and role in('teacher','qc') and status='active') or not exists(select 1 from public.pw_profiles where id=(p_data->>'adminId')::uuid and role in('admin','head_admin') and status='active') then raise exception 'Future trial and active compatible staff required' using errcode='23514';end if;
   pid:='trial_'||gen_random_uuid()::text;
   insert into public.pw_lessons(id,student_id,teacher_id,admin_id,payload) values(pid,s.id,(p_data->>'teacherId')::uuid,(p_data->>'adminId')::uuid,jsonb_build_object('id',pid,'studentId',s.id,'studentName',s.payload->>'name','teacherName',(select name from public.pw_profiles where id=(p_data->>'teacherId')::uuid),'adminName',(select name from public.pw_profiles where id=(p_data->>'adminId')::uuid),'title','Verified introductory trial','instrument',s.payload->>'instrument','startsAt',p_data->>'at','studentTimezone',s.payload->>'timezone','status','scheduled','kind','trial','notes',notes,'nextTopics','','durationMinutes',60));
   update public.pw_leads set trial_student_id=s.id,trial_lesson_id=pid,payload=payload||jsonb_build_object('status','trial_booked','teacherName',(select name from public.pw_profiles where id=(p_data->>'teacherId')::uuid),'adminName',(select name from public.pw_profiles where id=(p_data->>'adminId')::uuid)) where id=l.id;
  elsif p_action='convert' then
   if r not in('super_admin','sales_marketing') or l.trial_verified_at is null or l.converted_at is not null then raise exception 'Verified trial and Sales conversion required' using errcode='23514';end if;
   select * into s from public.pw_students where id=l.trial_student_id;
   if s.teacher_id is null or s.admin_id is null or not exists(select 1 from public.pw_payments where student_id=s.id and verified_at is not null and payload->>'status'='paid') or not exists(select 1 from public.pw_billing_contracts where student_id=s.id and active) then raise exception 'Permanent staff, first verified payment and Finance billing handover required' using errcode='23514';end if;
   update public.pw_leads set converted_at=clock_timestamp(),payload=payload||jsonb_build_object('status','converted') where id=l.id;
  else raise exception 'Unknown action' using errcode='22023';end if;
 end if;
 insert into public.pw_operations_events(action,subject,actor,notes) values(p_action,coalesce(uid::text,p_data->>'id',p_data->>'staffId'),auth.uid(),notes);
 return jsonb_build_object('ok',true,'id',uid);
end $$;
revoke all on function public.pw_quality_sales_action(text,jsonb) from public,anon;
grant execute on function public.pw_quality_sales_action(text,jsonb) to authenticated;
