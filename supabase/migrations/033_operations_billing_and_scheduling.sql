create table public.pw_billing_contracts(
 id uuid primary key default gen_random_uuid(),student_id text not null references public.pw_students,
 amount numeric(12,2) not null check(amount>0),currency text not null check(currency in('GBP','USD','EUR','CAD','NGN')),
 terms text not null check(terms in('upfront','after_service')),anchor date not null,next_period integer not null default 0 check(next_period>=0),
 active boolean not null default true,created_by uuid not null references public.pw_profiles,created_at timestamptz not null default now());
create unique index pw_one_active_contract on public.pw_billing_contracts(student_id) where active;
create table public.pw_contract_invoices(contract_id uuid references public.pw_billing_contracts,period integer not null,payment_id text unique references public.pw_payments,primary key(contract_id,period));
create table public.pw_fx_rates(id uuid primary key default gen_random_uuid(),currency text not null check(currency in('GBP','USD','EUR','CAD')),date date not null,rate numeric(20,6) not null check(rate>0),notes text not null,approved_by uuid references public.pw_profiles,created_at timestamptz not null default now(),unique(currency,date));
create table public.pw_finance_rules(singleton boolean primary key default true check(singleton),tax_percent numeric not null default 0 check(tax_percent between 0 and 100),finance_profit boolean not null default false);
insert into public.pw_finance_rules(singleton) values(true);
create table public.pw_availability(id uuid primary key default gen_random_uuid(),staff_id uuid not null references public.pw_profiles,weekday integer not null check(weekday between 0 and 6),from_time time not null,to_time time not null,check(to_time>from_time),unique(staff_id,weekday,from_time,to_time));
create table public.pw_recurring_series(id uuid primary key default gen_random_uuid(),student_id text references public.pw_students,weekday integer not null,local_time time not null,zone text not null,minutes integer not null,starts_on date not null,weeks integer not null,created_by uuid references public.pw_profiles,created_at timestamptz default now());
create table public.pw_student_pauses(id uuid primary key default gen_random_uuid(),student_id text references public.pw_students,resume_on date,reason text not null,active boolean not null default true,last_error text,created_by uuid references public.pw_profiles,created_at timestamptz default now());
create unique index pw_one_active_pause on public.pw_student_pauses(student_id) where active;
create table public.pw_paused_lessons(pause_id uuid references public.pw_student_pauses,lesson_id text references public.pw_lessons,original_payload jsonb not null,primary key(pause_id,lesson_id));
create table public.pw_operations_events(id uuid primary key default gen_random_uuid(),action text not null,subject text,actor uuid references public.pw_profiles,notes text not null,created_at timestamptz not null default now());
create trigger pw_operations_immutable before update or delete on public.pw_operations_events for each row execute function public.pw_protect_lesson_event();
do $rls$
declare t text;
begin
 foreach t in array array['pw_billing_contracts','pw_contract_invoices','pw_fx_rates','pw_finance_rules','pw_availability','pw_recurring_series','pw_student_pauses','pw_paused_lessons','pw_operations_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $rls$;
create policy pw_contract_read on public.pw_billing_contracts for select to authenticated using(public.pw_active() and(public.pw_role() in('super_admin','finance') or(public.pw_role() in('parent','student') and public.pw_portal_allowed() and public.pw_can_student(student_id))));
create policy pw_contract_invoice_read on public.pw_contract_invoices for select to authenticated using(exists(select 1 from public.pw_billing_contracts c where c.id=contract_id));
create policy pw_fx_read on public.pw_fx_rates for select to authenticated using(public.pw_active() and public.pw_role() in('super_admin','finance'));
create policy pw_finance_rules_read on public.pw_finance_rules for select to authenticated using(public.pw_active() and public.pw_role()='super_admin');
create policy pw_availability_read on public.pw_availability for select to authenticated using(public.pw_active() and(public.pw_role() in('super_admin','head_admin','admin','qc') or staff_id=auth.uid()));
create policy pw_series_read on public.pw_recurring_series for select to authenticated using(public.pw_active() and public.pw_can_student(student_id));
create policy pw_pause_read on public.pw_student_pauses for select to authenticated using(public.pw_active() and public.pw_can_student(student_id));
create policy pw_paused_lesson_read on public.pw_paused_lessons for select to authenticated using(exists(select 1 from public.pw_student_pauses p where p.id=pause_id));
create policy pw_ops_events_read on public.pw_operations_events for select to authenticated using(public.pw_active() and(public.pw_role()='super_admin' or actor=auth.uid()));

create function public.pw_emit_contract_invoices(p_id uuid) returns integer language plpgsql security definer set search_path='' as $$
declare c public.pw_billing_contracts;s public.pw_students;due date;pid text;n integer:=0;parent_name text;
begin
 select * into c from public.pw_billing_contracts where id=p_id and active for update;
 if c.id is null then return 0;end if;
 select * into s from public.pw_students where id=c.student_id;
 if s.payload->>'status'<>'active' then return 0;end if;
 select name into parent_name from public.pw_profiles where id=s.parent_id;
 loop
  due:=(c.anchor+make_interval(months=>c.next_period+case when c.terms='after_service' then 1 else 0 end))::date;
  exit when due>current_date or n>=24;
  pid:='contract_'||replace(c.id::text,'-','')||'_'||c.next_period;
  insert into public.pw_payments(id,parent_id,student_id,payload) values(pid,s.parent_id,s.id,jsonb_build_object('id',pid,'parentName',parent_name,'studentName',s.payload->>'name','amount',c.amount,'currency',c.currency,'dueDate',due,'status','due','terms',c.terms,'referralDiscount',0));
  insert into public.pw_contract_invoices values(c.id,c.next_period,pid);
  c.next_period:=c.next_period+1;n:=n+1;
 end loop;
 update public.pw_billing_contracts set next_period=c.next_period where id=c.id;
 return n;
end $$;
revoke all on function public.pw_emit_contract_invoices(uuid) from public,anon,authenticated;

create function public.pw_resume_pause(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.pw_student_pauses;x record;
begin
 select * into p from public.pw_student_pauses where id=p_id and active for update;
 if p.id is null then return;end if;
 update public.pw_students set payload=jsonb_set(payload,'{status}','"active"') where id=p.student_id;
 for x in select * from public.pw_paused_lessons where pause_id=p.id loop
  if (x.original_payload->>'startsAt')::timestamptz>now() then
   update public.pw_lessons set payload=x.original_payload where id=x.lesson_id and verified_at is null and payload->>'status'='cancelled';
  end if;
 end loop;
 update public.pw_student_pauses set active=false,last_error=null where id=p.id;
end $$;
revoke all on function public.pw_resume_pause(uuid) from public,anon,authenticated;

create function public.pw_check_availability() returns trigger language plpgsql security definer set search_path='' as $$
declare uid uuid;t timestamptz;local_time timestamp;tz text;minutes integer;
begin
 if new.payload->>'status' not in('scheduled','rescheduled') then return new;end if;
 t:=(new.payload->>'startsAt')::timestamptz;minutes:=coalesce((new.payload->>'durationMinutes')::integer,60);
 foreach uid in array array[new.teacher_id,new.admin_id] loop
  if uid is null or not exists(select 1 from public.pw_availability where staff_id=uid) then continue;end if;
  select timezone into tz from public.pw_profiles where id=uid;
  local_time:=t at time zone tz;
  if not exists(select 1 from public.pw_availability a where a.staff_id=uid and a.weekday=extract(dow from local_time)::integer and local_time::time>=a.from_time and (local_time+make_interval(mins=>minutes))::date=local_time::date and (local_time+make_interval(mins=>minutes))::time<=a.to_time) then
   raise exception 'Class is outside declared staff availability' using errcode='23514';
  end if;
 end loop;
 return new;
end $$;
create trigger pw_availability_guard before insert or update on public.pw_lessons for each row execute function public.pw_check_availability();

create function public.pw_operations_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r text:=public.pw_role();s public.pw_students;staff public.pw_profiles;x record;uid uuid;cid uuid;pid text;dd date;at_time timestamptz;notes text:=btrim(coalesce(p_data->>'notes',''));d integer;i integer;
begin
 if not coalesce(public.pw_active(),false) then raise exception 'Active staff required' using errcode='42501';end if;
 if p_action not in('generate','finance_settings') and length(notes)<5 then raise exception 'Written reason required' using errcode='22023';end if;
 if p_action in('contract','generate','contract_stop','expense','fx') then
  if r not in('super_admin','finance') then raise exception 'Finance or Owner required' using errcode='42501';end if;
 elsif p_action='finance_settings' then
  if r<>'super_admin' then raise exception 'Owner required' using errcode='42501';end if;
 elsif p_action in('availability','availability_remove') then
  if r not in('super_admin','teacher','admin','head_admin','qc') then raise exception 'Scheduling staff required' using errcode='42501';end if;
 elsif p_action in('recurrence','pause','resume','reassign') then
  if r not in('super_admin','head_admin','admin') then raise exception 'Scheduling administrator required' using errcode='42501';end if;
 else raise exception 'Unknown operations action' using errcode='22023';
 end if;
 if p_action in('contract','recurrence','pause','reassign') then
  select * into s from public.pw_students where id=p_data->>'studentId' for update;
  if s.id is null or(p_action<>'contract' and not coalesce(public.pw_can_student(s.id),false)) then raise exception 'Child is not in your portfolio' using errcode='42501';end if;
 end if;
 if p_action='contract' then
  if s.parent_id is null then raise exception 'Linked parent required' using errcode='23514';end if;
  insert into public.pw_billing_contracts(student_id,amount,currency,terms,anchor,created_by) values(s.id,(p_data->>'amount')::numeric,p_data->>'currency',p_data->>'terms',(p_data->>'anchor')::date,auth.uid()) returning id into cid;
  perform public.pw_emit_contract_invoices(cid);
 elsif p_action='generate' then
  cid:=(p_data->>'id')::uuid;perform public.pw_emit_contract_invoices(cid);
 elsif p_action='contract_stop' then
  update public.pw_billing_contracts set active=false where id=(p_data->>'id')::uuid and active;
 elsif p_action='fx' then
  insert into public.pw_fx_rates(currency,date,rate,notes,approved_by) values(p_data->>'currency',(p_data->>'date')::date,(p_data->>'rate')::numeric,notes,auth.uid()) returning id into cid;
 elsif p_action='finance_settings' then
  update public.pw_finance_rules set tax_percent=(p_data->>'taxPercent')::numeric,finance_profit=(p_data->>'financeProfit')::boolean;
 elsif p_action='expense' then
  pid:='expense_'||gen_random_uuid()::text;
  insert into public.pw_expenses(id,payload) values(pid,(p_data-'action'-'notes')||jsonb_build_object('id',pid));
 elsif p_action='availability' then
  uid:=(p_data->>'staffId')::uuid;
  select * into staff from public.pw_profiles where id=uid and status in('active','on_leave') and role in('teacher','qc','admin','head_admin');
  if staff.id is null or(r<>'super_admin' and uid<>auth.uid()) then raise exception 'Only your own availability may be changed' using errcode='42501';end if;
  insert into public.pw_availability(staff_id,weekday,from_time,to_time) values(uid,(p_data->>'weekday')::integer,(p_data->>'from')::time,(p_data->>'to')::time) returning id into cid;
 elsif p_action='availability_remove' then
  delete from public.pw_availability where id=(p_data->>'id')::uuid and(r='super_admin' or staff_id=auth.uid());
 elsif p_action='recurrence' then
  if s.payload->>'status'<>'active' or s.teacher_id is null or s.admin_id is null then raise exception 'Active child and assigned teacher/admin required' using errcode='23514';end if;
  if(p_data->>'startsOn')::date<current_date or(p_data->>'weeks')::integer not between 1 and 26 or not exists(select 1 from pg_timezone_names where name=p_data->>'zone') then raise exception 'Invalid recurrence dates or timezone' using errcode='22023';end if;
  if not exists(select 1 from public.pw_profiles where id=s.teacher_id and status='active') or not exists(select 1 from public.pw_profiles where id=s.admin_id and status='active') then raise exception 'Assigned staff must be active' using errcode='23514';end if;
  insert into public.pw_recurring_series(student_id,weekday,local_time,zone,minutes,starts_on,weeks,created_by) values(s.id,(p_data->>'weekday')::integer,(p_data->>'time')::time,p_data->>'zone',(p_data->>'duration')::integer,(p_data->>'startsOn')::date,(p_data->>'weeks')::integer,auth.uid()) returning id into cid;
  dd:=(p_data->>'startsOn')::date;d:=((p_data->>'weekday')::integer-extract(dow from dd)::integer+7)%7;dd:=dd+d;
  for i in 0..(p_data->>'weeks')::integer-1 loop
   at_time:=((dd+i*7)+(p_data->>'time')::time) at time zone(p_data->>'zone');
   pid:='series_'||replace(cid::text,'-','')||'_'||i;
   insert into public.pw_lessons(id,student_id,teacher_id,admin_id,payload) values(pid,s.id,s.teacher_id,s.admin_id,
    jsonb_build_object('id',pid,'studentId',s.id,'studentName',s.payload->>'name','teacherName',(select name from public.pw_profiles where id=s.teacher_id),'adminName',(select name from public.pw_profiles where id=s.admin_id),'title',s.payload->>'instrument'||' lesson','instrument',s.payload->>'instrument','startsAt',at_time,'studentTimezone',s.payload->>'timezone','status','scheduled','kind','standard','notes','','nextTopics','','durationMinutes',(p_data->>'duration')::integer,'durationReason',notes));
  end loop;
 elsif p_action='pause' then
  if s.payload->>'status'<>'active' or(p_data->>'resumeOn')::date<=current_date then raise exception 'Active child and future resume date required' using errcode='23514';end if;
  insert into public.pw_student_pauses(student_id,resume_on,reason,created_by) values(s.id,(p_data->>'resumeOn')::date,notes,auth.uid()) returning id into cid;
  for x in select * from public.pw_lessons where student_id=s.id and verified_at is null and payload->>'status' in('scheduled','rescheduled') and(payload->>'startsAt')::timestamptz>now() loop
   insert into public.pw_paused_lessons values(cid,x.id,x.payload);
   update public.pw_lessons set payload=payload||jsonb_build_object('status','cancelled','notes',coalesce(payload->>'notes','')||E'\nPaused: '||notes) where id=x.id;
  end loop;
  update public.pw_students set payload=jsonb_set(payload,'{status}','"paused"') where id=s.id;
 elsif p_action='resume' then
  select * into s from public.pw_students where id=(select student_id from public.pw_student_pauses where id=(p_data->>'id')::uuid);
  if not coalesce(public.pw_can_student(s.id),false) then raise exception 'Pause is outside your portfolio' using errcode='42501';end if;
  perform public.pw_resume_pause((p_data->>'id')::uuid);
 elsif p_action='reassign' then
  if r not in('super_admin','head_admin') then raise exception 'Management assigns permanent staff' using errcode='42501';end if;
  if not exists(select 1 from public.pw_profiles where id=(p_data->>'teacherId')::uuid and role in('teacher','qc') and status='active') or not exists(select 1 from public.pw_profiles where id=(p_data->>'adminId')::uuid and role in('admin','head_admin') and status='active') then raise exception 'Compatible active staff required' using errcode='23514';end if;
  update public.pw_students set teacher_id=(p_data->>'teacherId')::uuid,admin_id=(p_data->>'adminId')::uuid,payload=payload||jsonb_build_object('teacherName',(select name from public.pw_profiles where id=(p_data->>'teacherId')::uuid),'adminName',(select name from public.pw_profiles where id=(p_data->>'adminId')::uuid)) where id=s.id;
  update public.pw_lessons set teacher_id=(p_data->>'teacherId')::uuid,admin_id=(p_data->>'adminId')::uuid,payload=payload||jsonb_build_object('teacherName',(select name from public.pw_profiles where id=(p_data->>'teacherId')::uuid),'adminName',(select name from public.pw_profiles where id=(p_data->>'adminId')::uuid)) where student_id=s.id and verified_at is null and payload->>'status' in('scheduled','rescheduled') and(payload->>'startsAt')::timestamptz>now();
 end if;
 insert into public.pw_operations_events(action,subject,actor,notes) values(p_action,coalesce(cid::text,pid,p_data->>'studentId',p_data->>'id',p_data->>'staffId'),auth.uid(),coalesce(nullif(notes,''),'Owner updated financial rules'));
 return jsonb_build_object('ok',true,'id',cid);
end $$;
revoke all on function public.pw_operations_action(text,jsonb) from public,anon;
grant execute on function public.pw_operations_action(text,jsonb) to authenticated;

create function public.pw_reconcile_operations() returns jsonb language plpgsql security definer set search_path='' as $$
declare x record;n integer:=0;failures integer:=0;
begin
 for x in select id from public.pw_billing_contracts where active loop
  begin n:=n+public.pw_emit_contract_invoices(x.id);exception when others then failures:=failures+1;end;
 end loop;
 for x in select id from public.pw_student_pauses where active and resume_on<=current_date loop
  begin perform public.pw_resume_pause(x.id);exception when others then update public.pw_student_pauses set last_error='Automatic resume blocked by calendar or roster validation; administrator review required' where id=x.id;failures:=failures+1;end;
 end loop;
 return jsonb_build_object('generated',n,'blocked',failures);
end $$;
revoke all on function public.pw_reconcile_operations() from public,anon,authenticated;
grant execute on function public.pw_reconcile_operations() to service_role;
