-- Salary records are separate from the old manual payroll form. Browser roles
-- can read authorized records, but every write goes through checked functions.
create table public.pw_salary_rates(
 id uuid primary key default gen_random_uuid(), staff_id uuid not null references public.pw_profiles(id),
 effective_from date not null, terms jsonb not null,
 status text not null default 'pending' check(status in('pending','approved','rejected')),
 reason text not null, proposed_by uuid not null default auth.uid(),
 decided_by uuid, decision_reason text, decided_at timestamptz, created_at timestamptz not null default now()
);
create unique index pw_one_approved_salary_rate on public.pw_salary_rates(staff_id,effective_from) where status='approved';
create table public.pw_course_terms(
 id uuid primary key default gen_random_uuid(), student_id text not null references public.pw_students(id),
 start_date date not null, effective_from date not null, weekly_frequency integer not null check(weekly_frequency between 1 and 3),
 confirmed_by uuid not null default auth.uid(), created_at timestamptz not null default now(),
 unique(student_id,effective_from), check(effective_from>=start_date)
);
create table public.pw_salary_banks(
 staff_id uuid not null references public.pw_profiles(id), bank_name text not null, account_name text not null,
 account_number text not null, routing_code text not null default '', currency text not null,
 recorded_by uuid not null default auth.uid(), updated_at timestamptz not null default now(), primary key(staff_id,currency)
);
create table public.pw_salary_batches(
 id uuid primary key default gen_random_uuid(), pay_date date not null unique,
 status text not null default 'draft' check(status in('draft','submitted','approved','paid')),
 snapshot jsonb not null, revision integer not null default 1,
 prepared_by uuid not null default auth.uid(), submitted_by uuid, submitted_at timestamptz,
 approved_by uuid, approved_at timestamptz, approval_mode text, policy_revision integer,
 created_at timestamptz not null default now(), check(extract(day from pay_date)=28)
);
create table public.pw_salary_statements(
 id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.pw_salary_batches(id),
 staff_id uuid not null references public.pw_profiles(id), staff_name text not null, role text not null,
 currency text not null, net numeric(18,2) not null, items jsonb not null, adjustments jsonb not null default '[]',
 paid_at timestamptz, transfer_reference text, paid_by uuid, unique(batch_id,staff_id,currency)
);
create table public.pw_salary_claims(
 source_key text primary key, statement_id uuid not null references public.pw_salary_statements(id),
 staff_id uuid not null, amount numeric(18,2) not null, currency text not null, meta jsonb not null,
 created_at timestamptz not null default now()
);

create function public.pw_salary_self(p_staff uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_staff=auth.uid() and exists(select 1 from public.pw_profiles where id=auth.uid()
  and status in('active','on_leave') and role not in('parent','student','general_manager'));
$$;
do $$ declare t text; begin
 foreach t in array array['salary_rates','course_terms','salary_banks','salary_batches','salary_statements','salary_claims'] loop
  execute format('alter table public.pw_%I enable row level security',t);
  execute format('revoke all on public.pw_%I from anon,authenticated',t);
  execute format('grant select on public.pw_%I to authenticated',t);
 end loop;
end $$;
create policy pw_salary_rate_read on public.pw_salary_rates for select to authenticated using(
 public.pw_role() in('super_admin','finance') or public.pw_salary_self(staff_id)
 or (public.pw_role() in('hr','qc') and proposed_by=auth.uid() and status='pending'));
create policy pw_course_term_read on public.pw_course_terms for select to authenticated using(public.pw_role() in('super_admin','finance'));
create policy pw_salary_bank_read on public.pw_salary_banks for select to authenticated using(public.pw_role() in('super_admin','finance') or public.pw_salary_self(staff_id));
create policy pw_salary_statement_read on public.pw_salary_statements for select to authenticated using(public.pw_role() in('super_admin','finance') or public.pw_salary_self(staff_id));
create policy pw_salary_batch_read on public.pw_salary_batches for select to authenticated using(public.pw_role() in('super_admin','finance')
 or exists(select 1 from public.pw_salary_statements s where s.batch_id=public.pw_salary_batches.id and public.pw_salary_self(s.staff_id)));
-- The calculation snapshot includes all staff. Never expose that column even
-- when a teacher is authorized to read their batch's nonsensitive header.
revoke select on public.pw_salary_batches from authenticated;
grant select(id,pay_date,status,revision,prepared_by,submitted_by,submitted_at,approved_by,approved_at,approval_mode,policy_revision,created_at)
 on public.pw_salary_batches to authenticated;
create policy pw_salary_claim_read on public.pw_salary_claims for select to authenticated using(public.pw_role() in('super_admin','finance') or public.pw_salary_self(staff_id));

create function public.pw_salary_audit(p_entity text,p_id text,p_action text,p_subject uuid default null)
returns void language sql security definer set search_path='' as $$
 insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,subject_id,action)
 select auth.uid(),name,role,p_entity,p_id,p_subject,p_action from public.pw_profiles where id=auth.uid();
$$;
revoke all on function public.pw_salary_audit(text,text,text,uuid) from public,anon,authenticated;

create function public.pw_propose_salary_rate(p_staff uuid,p_date date,p_terms jsonb,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare r text:=public.pw_role(); target public.pw_profiles; k text; v numeric; result uuid;
begin
 select * into target from public.pw_profiles where id=p_staff;
 if r not in('super_admin','finance','hr','qc') or r is null or target.id is null or target.role in('parent','student','general_manager')
  or (r='qc' and (target.role<>'teacher' or target.qc_id is distinct from auth.uid()))
  or (r in('hr','qc') and exists(select 1 from public.pw_salary_rates where staff_id=p_staff and status='approved'))
 then raise exception 'Salary proposal not permitted' using errcode='42501'; end if;
 if length(trim(p_reason))<5 or length(p_reason)>2000 or p_date<'2000-01-01' or p_date>'2100-12-31'
  or jsonb_typeof(p_terms)<>'object' or (select count(*) from jsonb_object_keys(p_terms))<>9
  or not(p_terms ?& array['monthlyStudentRate','trialRate','coverRate','baseSalary','adminExtraParentRate','adminQuota','advanceEligible','currency','managementFirstPeriod'])
  or p_terms->>'currency' not in('GBP','USD','EUR','CAD','NGN')
  or jsonb_typeof(p_terms->'advanceEligible')<>'boolean'
  or p_terms->>'managementFirstPeriod' not in('full_month','manual_adjustment')
 then raise exception 'Invalid agreed salary terms' using errcode='22023'; end if;
 foreach k in array array['monthlyStudentRate','trialRate','coverRate','baseSalary','adminExtraParentRate','adminQuota'] loop
  if jsonb_typeof(p_terms->k)<>'number' then raise exception 'Invalid amount' using errcode='22023'; end if;
  v:=(p_terms->>k)::numeric;
  if v<0 or v>1000000000 or round(v,2)<>v or (k='adminQuota' and (v<>trunc(v) or v>1000))
  then raise exception 'Invalid amount' using errcode='22023'; end if;
 end loop;
 if exists(select 1 from public.pw_salary_rates where staff_id=p_staff and status='approved')
  and p_date < (clock_timestamp() at time zone 'Africa/Lagos')::date
 then raise exception 'Pay changes require approval before they take effect' using errcode='PW101'; end if;
 insert into public.pw_salary_rates(staff_id,effective_from,terms,reason) values(p_staff,p_date,p_terms,trim(p_reason)) returning id into result;
 perform public.pw_salary_audit('salary_rate',result::text,'Agreed salary terms proposed for owner approval',p_staff);
 return result;
end $$;

create function public.pw_decide_salary_rate(p_id uuid,p_decision text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare row public.pw_salary_rates;
begin
 if public.pw_role() is distinct from 'super_admin' then raise exception 'Owner approval required' using errcode='42501'; end if;
 select * into row from public.pw_salary_rates where id=p_id for update;
 if row.id is null or row.status<>'pending' then raise exception 'Proposal no longer pending' using errcode='40001'; end if;
 if p_decision not in('approve','reject') or length(trim(p_reason))<5 or length(p_reason)>2000 then raise exception 'Written decision required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('salary-rate:'||row.staff_id::text,0));
 if p_decision='approve' and exists(select 1 from public.pw_salary_rates where staff_id=row.staff_id and status='approved')
  and row.effective_from<(clock_timestamp() at time zone 'Africa/Lagos')::date
 then raise exception 'Pay changes must be approved before taking effect' using errcode='PW101'; end if;
 update public.pw_salary_rates set status=case p_decision when 'approve' then 'approved' else 'rejected' end,
  decided_by=auth.uid(),decision_reason=trim(p_reason),decided_at=clock_timestamp() where id=p_id;
 perform public.pw_salary_audit('salary_rate',p_id::text,'Salary rate '||p_decision||': '||trim(p_reason),row.staff_id);
end $$;

create function public.pw_confirm_course(p_student text,p_start date,p_effective date,p_frequency integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if public.pw_role() not in('super_admin','finance') or public.pw_role() is null then raise exception 'Finance access required' using errcode='42501'; end if;
 if p_frequency not between 1 and 3 or p_effective<p_start or p_start<'2000-01-01' or p_effective>'2100-12-31'
 then raise exception 'Exact start date and weekly frequency required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('salary-course:'||p_student,0));
 if exists(select 1 from public.pw_course_terms where student_id=p_student) and
  (extract(day from p_effective)<>28 or p_effective<(clock_timestamp() at time zone 'Africa/Lagos')::date
   or p_start<>(select start_date from public.pw_course_terms where student_id=p_student order by effective_from limit 1))
 then raise exception 'Future frequency changes start on the 28th and retain the original enrollment date' using errcode='PW102'; end if;
 insert into public.pw_course_terms(student_id,start_date,effective_from,weekly_frequency) values(p_student,p_start,p_effective,p_frequency);
 perform public.pw_salary_audit('course_terms',p_student,'Confirmed exact course start date and weekly frequency');
end $$;

create function public.pw_record_salary_bank(p_staff uuid,p_bank text,p_name text,p_number text,p_routing text,p_currency text) returns void
language plpgsql security definer set search_path='' as $$
declare r text:=public.pw_role();
begin
 if r is null or not(r in('super_admin','finance','hr') or p_staff=auth.uid()
  or (r='qc' and exists(select 1 from public.pw_profiles where id=p_staff and role='teacher' and qc_id=auth.uid())))
  or not exists(select 1 from public.pw_profiles where id=p_staff and role not in('parent','student','general_manager'))
  or (r in('hr','qc') and exists(select 1 from public.pw_salary_banks where staff_id=p_staff))
 then raise exception 'Private bank onboarding not permitted' using errcode='42501'; end if;
 if length(trim(p_bank)) not between 2 and 120 or length(trim(p_name)) not between 2 and 120
  or length(trim(p_number)) not between 5 and 64 or length(p_routing)>32 or p_currency not in('GBP','USD','EUR','CAD','NGN')
 then raise exception 'Valid bank details required' using errcode='22023'; end if;
 insert into public.pw_salary_banks(staff_id,bank_name,account_name,account_number,routing_code,currency)
 values(p_staff,trim(p_bank),trim(p_name),trim(p_number),trim(p_routing),p_currency)
 on conflict(staff_id,currency) do update set bank_name=excluded.bank_name,account_name=excluded.account_name,
  account_number=excluded.account_number,routing_code=excluded.routing_code,currency=excluded.currency,recorded_by=auth.uid(),updated_at=clock_timestamp();
 perform public.pw_salary_audit('salary_bank',p_staff::text,'Private bank instructions recorded; account data omitted from audit',p_staff);
end $$;

-- This helper is never granted to a browser role. Only checked preview/write
-- functions call it. Decimal amounts are rounded cumulatively per course.
create function public.pw_calculate_salary(p_date date,p_staff uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg jsonb; period_from timestamptz; period_to timestamptz; staff record; event record; rate record; term record; prior record;
 results jsonb:='[]'; issues jsonb:='[]'; entries jsonb; counters jsonb; raw_totals jsonb; group_key text; raw_key text;
 earning_date date; earning_cycle date; anchor date; parts integer; used integer; amount numeric; previous_raw numeric; new_raw numeric;
 advance_ok boolean; current_rate record; total numeric; cur text; previous_count integer; is_forecast boolean;
begin
 if p_date is null or extract(day from p_date)<>28 or p_date<'2000-01-28' or p_date>'2100-12-28' then raise exception 'Choose a 28th pay date' using errcode='22023'; end if;
 select settings into cfg from public.pw_settings where singleton;
 if cfg->>'payrollWeekAnchor'='not_configured' or cfg->>'advanceEligibility'='not_configured'
 then raise exception 'Owner must configure payroll rules before calculating salaries' using errcode='PW103'; end if;
 period_to:=p_date::timestamp at time zone 'Africa/Lagos';
 period_from:=(p_date-interval '1 month')::timestamp at time zone 'Africa/Lagos';
 for staff in select p.id,p.name,p.role,p.status from public.pw_profiles p
  where p.role not in('parent','student','general_manager') and (p_staff is null or p.id=p_staff)
  and (exists(select 1 from public.pw_salary_rates sr where sr.staff_id=p.id and sr.status='approved' and sr.effective_from<=p_date)
   or exists(select 1 from public.pw_attendance a where a.teacher_id=p.id and a.starts_at>=period_from and a.starts_at<period_to)
   or exists(select 1 from public.pw_salary_claims c where c.staff_id=p.id and c.source_key like 'advance:%'))
  order by p.id
 loop
  entries:='[]'; counters:='{}'; raw_totals:='{}';
  select * into current_rate from public.pw_salary_rates where staff_id=staff.id and status='approved' and effective_from<=p_date order by effective_from desc limit 1;
  advance_ok:=false;
  if current_rate.id is not null then
   if cfg->>'advanceEligibility'='owner_selected' then advance_ok:=(current_rate.terms->>'advanceEligible')::boolean;
   elsif cfg->>'advanceEligibility'='previous_period_verified' then
    advance_ok:=exists(select 1 from public.pw_attendance where teacher_id=staff.id and starts_at>=period_from and starts_at<period_to)
     and not exists(select 1 from public.pw_lessons l where l.teacher_id=staff.id and l.starts_at>=period_from and l.starts_at<period_to
      and l.payload->>'status'<>'cancelled' and not exists(select 1 from public.pw_attendance a where a.lesson_id=l.id and a.teacher_id=staff.id));
   end if;
  end if;
  for event in
   select a.lesson_id,a.student_id,a.student_name,a.starts_at,a.kind,false as forecast
   from public.pw_attendance a where a.teacher_id=staff.id
    and ((a.starts_at>=period_from and a.starts_at<period_to) or (a.starts_at<period_from and a.verified_at>=period_from and a.verified_at<period_to))
    and not exists(select 1 from public.pw_salary_claims c where c.source_key='salary:'||a.lesson_id)
    and not exists(select 1 from public.pw_salary_claims c where c.source_key='advance:'||a.lesson_id and c.staff_id=staff.id and a.kind='standard'
     and (c.meta->>'startsAt')::timestamptz=a.starts_at
     and not exists(select 1 from public.pw_salary_claims x where x.source_key='reconcile:'||a.lesson_id and x.amount>0))
   union all
   select l.id,l.student_id,s.payload->>'name',l.starts_at,'standard',true
   from public.pw_lessons l join public.pw_students s on s.id=l.student_id join public.pw_profiles parent on parent.id=s.parent_id
   where advance_ok and l.teacher_id=staff.id and l.payload->>'kind'='standard' and l.payload->>'status' in('scheduled','teacher_done','completed')
    and s.payload->>'status'='active' and parent.status='active' and staff.status='active'
    and (l.starts_at>=clock_timestamp() or exists(select 1 from public.pw_attendance a where a.lesson_id=l.id and a.teacher_id=staff.id and a.kind='standard'))
    and l.starts_at>=period_to and l.starts_at<(date_trunc('month',p_date::timestamp)+interval '1 month') at time zone 'Africa/Lagos'
    and not exists(select 1 from public.pw_salary_claims c where c.source_key='advance:'||l.id or c.source_key='salary:'||l.id)
   order by starts_at,lesson_id
  loop
   earning_date:=(event.starts_at at time zone 'Africa/Lagos')::date; is_forecast:=event.forecast;
   select * into rate from public.pw_salary_rates where staff_id=staff.id and status='approved' and effective_from<=earning_date order by effective_from desc limit 1;
   if rate.id is null then
    issues:=issues||jsonb_build_array(jsonb_build_object('staffId',staff.id,'staffName',staff.name,'message','Approved rate missing for '||earning_date)); continue;
   end if;
   cur:=rate.terms->>'currency';
   if event.kind='standard' then
    select * into term from public.pw_course_terms where student_id=event.student_id and effective_from<=earning_date order by effective_from desc limit 1;
    if term.id is null then issues:=issues||jsonb_build_array(jsonb_build_object('staffId',staff.id,'staffName',staff.name,'message','Confirm exact start date and frequency for '||event.student_name)); continue; end if;
    earning_cycle:=case when is_forecast then p_date when extract(day from earning_date)>=28
      then (date_trunc('month',earning_date::timestamp)+interval '1 month'+interval '27 days')::date
      else (date_trunc('month',earning_date::timestamp)+interval '27 days')::date end;
    anchor:=case cfg->>'payrollWeekAnchor' when 'calendar_month' then date_trunc('month',earning_cycle::timestamp)::date else (earning_cycle-interval '1 month')::date end;
    parts:=greatest(1,4-least(3,greatest(0,(term.start_date-anchor)/7)));
    group_key:=term.id::text||':'||earning_cycle::text;
    if counters->group_key is null then
     select count(*) into previous_count from public.pw_salary_claims c where c.staff_id=staff.id and c.meta->>'groupKey'=group_key
      and (c.source_key like 'salary:%' or c.source_key like 'advance:%');
     counters:=counters||jsonb_build_object(group_key,previous_count);
    end if;
    used:=(counters->>group_key)::integer;
    if used>=parts*term.weekly_frequency then continue; end if;
    counters:=counters||jsonb_build_object(group_key,used+1);
    raw_key:=group_key||':'||cur; previous_raw:=coalesce((raw_totals->>raw_key)::numeric,0);
    new_raw:=previous_raw+(rate.terms->>'monthlyStudentRate')::numeric/4;
    amount:=round(new_raw,2)-round(previous_raw,2); raw_totals:=raw_totals||jsonb_build_object(raw_key,new_raw);
    entries:=entries||jsonb_build_array(jsonb_build_object('kind',case when is_forecast then 'advance' else 'standard' end,
     'sourceKey',case when is_forecast then 'advance:' else 'salary:' end||event.lesson_id,'amount',amount,'currency',cur,
     'data',jsonb_build_object('studentId',event.student_id,'studentName',event.student_name,'lessonId',event.lesson_id,'startsAt',event.starts_at,
      'startDate',term.start_date,'weekTier',5-parts,'weeklyFrequency',term.weekly_frequency,'rateId',rate.id,'groupKey',group_key,'earningPeriod',earning_cycle)));
   else
    amount:=(rate.terms->>case event.kind when 'trial' then 'trialRate' else 'coverRate' end)::numeric;
    entries:=entries||jsonb_build_array(jsonb_build_object('kind',event.kind,'sourceKey','salary:'||event.lesson_id,'amount',amount,'currency',cur,
     'data',jsonb_build_object('studentId',event.student_id,'studentName',event.student_name,'lessonId',event.lesson_id,'startsAt',event.starts_at,'rateId',rate.id)));
   end if;
  end loop;
  -- Reconcile only earlier approved advances, at the original amount/currency.
  -- Unverified past classes are not earned; a late verification is payable later.
  for prior in select c.*,b.pay_date from public.pw_salary_claims c join public.pw_salary_statements st on st.id=c.statement_id
   join public.pw_salary_batches b on b.id=st.batch_id where c.staff_id=staff.id and c.source_key like 'advance:%'
   and b.pay_date<p_date and not exists(select 1 from public.pw_salary_claims x where x.source_key='reconcile:'||(c.meta->>'lessonId'))
  loop
   amount:=prior.amount;
   if exists(select 1 from public.pw_attendance a where a.lesson_id=prior.meta->>'lessonId' and a.teacher_id=staff.id and a.kind='standard'
    and a.starts_at=(prior.meta->>'startsAt')::timestamptz) then amount:=0; end if;
   entries:=entries||jsonb_build_array(jsonb_build_object('kind',case when amount=0 then 'advance_settled' else 'advance_deduction' end,
    'sourceKey','reconcile:'||(prior.meta->>'lessonId'),'amount',amount,'currency',prior.currency,
    'data',prior.meta||jsonb_build_object('reason',case when amount=0 then 'Previously prepaid class verified; not paid twice' else 'Previously prepaid class has no matching verified attendance' end)));
  end loop;
  for prior in select st.* from public.pw_salary_statements st join public.pw_salary_batches b on b.id=st.batch_id
   where st.staff_id=staff.id and st.net<0 and b.status in('approved','paid') and b.pay_date<p_date
    and not exists(select 1 from public.pw_salary_claims c where c.source_key='carry:'||st.id::text)
  loop
   entries:=entries||jsonb_build_array(jsonb_build_object('kind','carry_deduction','sourceKey','carry:'||prior.id::text,'amount',-prior.net,'currency',prior.currency,
    'data',jsonb_build_object('reason','Unpaid negative balance carried forward, without currency conversion')));
  end loop;
  if current_rate.id is not null then
   cur:=current_rate.terms->>'currency'; amount:=(current_rate.terms->>'baseSalary')::numeric;
   if current_rate.effective_from>(p_date-interval '1 month')::date and current_rate.terms->>'managementFirstPeriod'='manual_adjustment' then amount:=0; end if;
   entries:=entries||jsonb_build_array(jsonb_build_object('kind','base','sourceKey','base:'||staff.id::text||':'||p_date::text,'amount',amount,'currency',cur,
    'data',jsonb_build_object('rateId',current_rate.id,'reason','Agreed monthly staff salary')));
   if staff.role='admin' then
    select count(distinct s.parent_id) into used from public.pw_students s join public.pw_profiles p on p.id=s.parent_id
     where s.admin_id=staff.id and s.payload->>'status'='active' and p.status='active';
    amount:=greatest(0,used-(current_rate.terms->>'adminQuota')::integer)*(current_rate.terms->>'adminExtraParentRate')::numeric;
    entries:=entries||jsonb_build_array(jsonb_build_object('kind','admin_extra','sourceKey','admin:'||staff.id::text||':'||p_date::text,'amount',amount,'currency',cur,
     'data',jsonb_build_object('activeParents',used,'quota',(current_rate.terms->>'adminQuota')::integer,'rateId',current_rate.id)));
   end if;
  end if;
  for cur in select distinct x->>'currency' from jsonb_array_elements(entries) x loop
   select coalesce(sum((x->>'amount')::numeric*case when x->>'kind' in('advance_deduction','carry_deduction') then -1 else 1 end),0)
    into total from jsonb_array_elements(entries) x where x->>'currency'=cur;
   results:=results||jsonb_build_array(jsonb_build_object('staffId',staff.id,'staffName',staff.name,'role',staff.role,'currency',cur,'net',total,
    'items',(select jsonb_agg(x) from jsonb_array_elements(entries) x where x->>'currency'=cur)));
  end loop;
 end loop;
 return jsonb_build_object('payDate',p_date,'from',period_from,'to',period_to,'statements',results,'issues',issues);
end $$;
revoke all on function public.pw_calculate_salary(date,uuid) from public,anon,authenticated;

create function public.pw_preview_salary(p_date date) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if public.pw_role() in('super_admin','finance') then return public.pw_calculate_salary(p_date,null);
 elsif public.pw_salary_self(auth.uid()) then return public.pw_calculate_salary(p_date,auth.uid());
 else raise exception 'Salary access required' using errcode='42501'; end if;
end $$;

create function public.pw_generate_salary(p_date date) returns uuid language plpgsql security definer set search_path='' as $$
declare calc jsonb; row public.pw_salary_batches; st jsonb; saved jsonb;
begin
 if public.pw_role() is distinct from 'finance' then raise exception 'Finance prepares payroll; owner checks it' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('salary-batch:'||p_date::text,0));
 select * into row from public.pw_salary_batches where pay_date=p_date for update;
 if row.id is not null and row.status<>'draft' then raise exception 'Submitted or approved salaries cannot be regenerated' using errcode='40001'; end if;
 calc:=public.pw_calculate_salary(p_date);
 if jsonb_array_length(calc->'issues')>0 then raise exception 'Resolve missing rates or course terms before generation' using errcode='PW104'; end if;
 if jsonb_array_length(calc->'statements')=0 then raise exception 'No approved staff pay or qualifying attendance' using errcode='PW104'; end if;
 if row.id is null then insert into public.pw_salary_batches(pay_date,snapshot) values(p_date,calc) returning * into row;
 else
  select jsonb_agg(jsonb_build_object('staffId',staff_id,'currency',currency,'adjustments',adjustments)) into saved from public.pw_salary_statements where batch_id=row.id;
  update public.pw_salary_batches set snapshot=calc,revision=revision+1 where id=row.id;
  delete from public.pw_salary_statements where batch_id=row.id;
 end if;
 for st in select value from jsonb_array_elements(calc->'statements') loop
  insert into public.pw_salary_statements(batch_id,staff_id,staff_name,role,currency,net,items,adjustments)
  values(row.id,(st->>'staffId')::uuid,st->>'staffName',st->>'role',st->>'currency',(st->>'net')::numeric,st->'items',
   coalesce((select x->'adjustments' from jsonb_array_elements(coalesce(saved,'[]')) x where x->>'staffId'=st->>'staffId' and x->>'currency'=st->>'currency'),'[]'));
 end loop;
 -- Retain explicit adjustments even if the underlying currency/roster changes.
 for st in select value from jsonb_array_elements(coalesce(saved,'[]')) loop
  if jsonb_array_length(st->'adjustments')>0 and not exists(select 1 from public.pw_salary_statements where batch_id=row.id and staff_id=(st->>'staffId')::uuid and currency=st->>'currency') then
   insert into public.pw_salary_statements(batch_id,staff_id,staff_name,role,currency,net,items,adjustments)
   select row.id,p.id,p.name,p.role,st->>'currency',0,'[]',st->'adjustments' from public.pw_profiles p where p.id=(st->>'staffId')::uuid;
  end if;
 end loop;
 update public.pw_salary_statements s set net=net+coalesce((select sum((x->>'amount')::numeric*case when x->>'kind'='bonus' then 1 else -1 end) from jsonb_array_elements(s.adjustments) x),0) where batch_id=row.id;
 perform public.pw_salary_audit('salary_batch',row.id::text,'Verified-attendance payroll generated; draft adjustments retained');
 return row.id;
end $$;

create function public.pw_adjust_salary(p_statement uuid,p_kind text,p_amount numeric,p_reason text,p_remove uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare st public.pw_salary_statements; b public.pw_salary_batches; new_adjustments jsonb; item jsonb;
begin
 if public.pw_role() not in('super_admin','finance') or public.pw_role() is null then raise exception 'Finance adjustment access required' using errcode='42501'; end if;
 select * into st from public.pw_salary_statements where id=p_statement;
 select * into b from public.pw_salary_batches where id=st.batch_id for update;
 if b.id is null or b.status<>'draft' then raise exception 'Only draft salaries can be adjusted' using errcode='40001'; end if;
 select * into st from public.pw_salary_statements where id=p_statement for update;
 if length(trim(p_reason))<5 or length(p_reason)>2000 then raise exception 'Written adjustment reason required' using errcode='22023'; end if;
 if p_remove is not null then
  select x into item from jsonb_array_elements(st.adjustments) x where x->>'id'=p_remove::text;
  if item is null then raise exception 'Adjustment not found' using errcode='40001'; end if;
  new_adjustments:=coalesce((select jsonb_agg(x) from jsonb_array_elements(st.adjustments) x where x->>'id'<>p_remove::text),'[]');
  p_amount:=-(item->>'amount')::numeric*case when item->>'kind'='bonus' then 1 else -1 end;
 else
  if p_kind not in('bonus','deduction','loan_deduction') or p_amount<=0 or p_amount>1000000000 or round(p_amount,2)<>p_amount
  then raise exception 'Valid bonus or deduction required' using errcode='22023'; end if;
  new_adjustments:=st.adjustments||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'kind',p_kind,'amount',p_amount,'reason',trim(p_reason),'actorId',auth.uid(),'at',clock_timestamp()));
  p_amount:=p_amount*case when p_kind='bonus' then 1 else -1 end;
 end if;
 update public.pw_salary_statements set adjustments=new_adjustments,net=net+p_amount where id=st.id;
 update public.pw_salary_batches set revision=revision+1 where id=b.id;
 perform public.pw_salary_audit('salary_statement',st.id::text,case when p_remove is null then 'Salary adjustment: ' else 'Salary adjustment reversed: ' end||trim(p_reason),st.staff_id);
end $$;

create function public.pw_salary_transition(p_id uuid,p_decision text,p_reason text default '') returns void
language plpgsql security definer set search_path='' as $$
declare b public.pw_salary_batches; fresh jsonb; policy public.pw_settings; st record; item jsonb; auto boolean:=false; owner_id uuid;
begin
 select * into b from public.pw_salary_batches where id=p_id for update;
 if b.id is null then raise exception 'Batch not found' using errcode='40001'; end if;
 if p_decision='reject' then
  if public.pw_role() is distinct from 'super_admin' then raise exception 'Owner rejection required' using errcode='42501'; end if;
  if b.status<>'submitted' or length(trim(p_reason))<5 or length(p_reason)>2000 then raise exception 'Submitted batch and written reason required' using errcode='22023'; end if;
  update public.pw_salary_batches set status='draft',revision=revision+1 where id=b.id;
  perform public.pw_salary_audit('salary_batch',b.id::text,'Owner returned payroll for correction: '||trim(p_reason)); return;
 elsif p_decision='submit' then
  if public.pw_role() is distinct from 'finance' then raise exception 'Finance submission required' using errcode='42501'; end if;
  if b.status<>'draft' then raise exception 'Only draft payroll can be submitted' using errcode='40001'; end if;
  if (clock_timestamp() at time zone 'Africa/Lagos')::date<b.pay_date then raise exception 'Payroll submission opens on the 28th' using errcode='PW105'; end if;
  select * into policy from public.pw_settings where singleton;
  auto:=(policy.settings->>'vacationAutoApprove')::boolean and exists(select 1 from public.pw_profiles where id=policy.updated_by and role='super_admin' and status='active');
  owner_id:=policy.updated_by;
 elsif p_decision='approve' then
  if public.pw_role() is distinct from 'super_admin' or b.prepared_by=auth.uid() then raise exception 'Independent owner approval required' using errcode='42501'; end if;
  if b.status<>'submitted' then raise exception 'Only submitted payroll can be approved' using errcode='40001'; end if;
  owner_id:=auth.uid();
 else raise exception 'Invalid payroll decision' using errcode='22023'; end if;
 fresh:=public.pw_calculate_salary(b.pay_date);
 if fresh is distinct from b.snapshot then raise exception 'Attendance, rates or portfolio changed; return and regenerate this payroll' using errcode='PW106'; end if;
 if p_decision='submit' then
  update public.pw_salary_batches set status='submitted',submitted_by=auth.uid(),submitted_at=clock_timestamp(),revision=revision+1 where id=b.id;
  perform public.pw_salary_audit('salary_batch',b.id::text,'Finance submitted payroll for owner approval');
 end if;
 if p_decision='approve' or auto then
  for st in select * from public.pw_salary_statements where batch_id=b.id loop
   for item in select value from jsonb_array_elements(st.items) loop
    if item->>'sourceKey' like 'salary:%' or item->>'sourceKey' like 'advance:%' or item->>'sourceKey' like 'reconcile:%' or item->>'sourceKey' like 'carry:%' then
     -- Zero forecast amounts are not paid advances and must not suppress later pay.
     if item->>'kind'='advance' and (item->>'amount')::numeric=0 then continue; end if;
     insert into public.pw_salary_claims(source_key,statement_id,staff_id,amount,currency,meta)
     values(item->>'sourceKey',st.id,st.staff_id,(item->>'amount')::numeric,st.currency,item->'data');
    end if;
   end loop;
  end loop;
  update public.pw_salary_batches set status='approved',approved_by=owner_id,approved_at=clock_timestamp(),
   approval_mode=case when auto then 'owner_vacation_delegation' else 'owner_review' end,policy_revision=case when auto then policy.revision else null end,revision=revision+1 where id=b.id;
  perform public.pw_salary_audit('salary_batch',b.id::text,case when auto then 'Payroll approved under explicit owner vacation delegation' else 'Owner approved verified-attendance payroll' end);
 end if;
end $$;

create function public.pw_mark_salary_paid(p_statement uuid,p_reference text,p_confirmed boolean) returns void
language plpgsql security definer set search_path='' as $$
declare st public.pw_salary_statements; b public.pw_salary_batches;
begin
 if public.pw_role() not in('super_admin','finance') or public.pw_role() is null then raise exception 'Disbursement recording not permitted' using errcode='42501'; end if;
 select * into st from public.pw_salary_statements where id=p_statement;
 select * into b from public.pw_salary_batches where id=st.batch_id for update;
 select * into st from public.pw_salary_statements where id=p_statement for update;
 if b.status not in('approved','paid') or st.paid_at is not null or st.net<=0 then raise exception 'Approved positive unpaid salary required' using errcode='40001'; end if;
 if p_confirmed is distinct from true or length(trim(p_reference))<5 or length(p_reference)>160 then raise exception 'Confirm actual completed bank transfer and reference' using errcode='22023'; end if;
 if not exists(select 1 from public.pw_salary_banks where staff_id=st.staff_id and currency=st.currency) then raise exception 'Matching private bank instructions required' using errcode='PW107'; end if;
 update public.pw_salary_statements set paid_at=clock_timestamp(),paid_by=auth.uid(),transfer_reference=trim(p_reference) where id=st.id;
 if not exists(select 1 from public.pw_salary_statements where batch_id=b.id and net>0 and paid_at is null)
 then update public.pw_salary_batches set status='paid',revision=revision+1 where id=b.id; end if;
 perform public.pw_salary_audit('salary_statement',st.id::text,'Finance recorded an already completed bank transfer; no bank transfer initiated by application',st.staff_id);
end $$;

create function public.pw_payroll_directory() returns jsonb language plpgsql security definer set search_path='' as $$
declare r text:=public.pw_role();
begin
 if r not in('super_admin','finance','hr','qc') or r is null then return jsonb_build_object('staff','[]','billingStudents','[]','courses','[]','bankConfiguredIds','[]'); end if;
 return jsonb_build_object(
  'staff',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role,'status',status) order by name) from public.pw_profiles
   where role not in('parent','student','general_manager') and (r<>'qc' or (role='teacher' and qc_id=auth.uid()))),'[]'),
  'billingStudents',case when r in('super_admin','finance') then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',payload->>'name') order by payload->>'name') from public.pw_students),'[]') else '[]'::jsonb end,
  'courses',case when r in('super_admin','finance') then coalesce((select jsonb_agg(jsonb_build_object('student_id',t.student_id,'student_name',s.payload->>'name','start_date',t.start_date,'effective_from',t.effective_from,'weekly_frequency',t.weekly_frequency))
   from public.pw_course_terms t join public.pw_students s on s.id=t.student_id),'[]') else '[]'::jsonb end,
  'bankConfiguredIds',case when r in('super_admin','finance') then coalesce((select jsonb_agg(staff_id) from public.pw_salary_banks),'[]') else '[]'::jsonb end);
end $$;
do $$ declare name text; begin
 for name in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in('pw_salary_self','pw_propose_salary_rate','pw_decide_salary_rate','pw_confirm_course','pw_record_salary_bank','pw_preview_salary','pw_generate_salary','pw_adjust_salary','pw_salary_transition','pw_mark_salary_paid','pw_payroll_directory') loop
  execute 'revoke all on function '||name||' from public,anon';
  execute 'grant execute on function '||name||' to authenticated';
 end loop;
end $$;
