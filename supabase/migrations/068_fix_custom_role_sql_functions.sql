-- ============================================================================
-- Migration 068: Dynamic permissions for remaining database RPCs and functions
-- Eliminates hardcoded role code restrictions in payroll, financial summaries,
-- and classroom recording management to support custom administrator and educator roles.
-- ============================================================================

-- 1. pw_payroll_directory: Allow any role with workspace.payroll/finance permission or built-in payroll/hr/owner roles
create or replace function public.pw_payroll_directory()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.pw_role();
  v_has_payroll_perm boolean := public.pw_has_permission(auth.uid(), 'workspace.payroll');
  v_has_finance_perm boolean := public.pw_has_permission(auth.uid(), 'workspace.finance');
begin
  if (r not in ('super_admin', 'owner', 'finance', 'hr', 'qc') and not v_has_payroll_perm and not v_has_finance_perm) or r is null then
    return jsonb_build_object('staff', '[]'::jsonb, 'billingStudents', '[]'::jsonb, 'courses', '[]'::jsonb, 'bankConfiguredIds', '[]'::jsonb, 'salaryEndDates', '{}'::jsonb);
  end if;
  return jsonb_build_object(
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'role', role, 'status', status, 'salaryEndDate', salary_end_date) order by name)
      from public.pw_profiles
      where role not in ('parent', 'student', 'general_manager')
    ), '[]'::jsonb),
    'billingStudents', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.payload->>'name') order by s.payload->>'name')
      from public.pw_students s
      where s.payload->>'status' = 'active'
    ), '[]'::jsonb),
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object('student_id', c.student_id, 'student_name', s.payload->>'name', 'start_date', c.start_date, 'effective_from', c.effective_from, 'weekly_frequency', c.weekly_frequency) order by c.effective_from desc)
      from public.pw_billing_contracts c
      left join public.pw_students s on s.id = c.student_id
    ), '[]'::jsonb),
    'bankConfiguredIds', case when r in ('super_admin', 'owner', 'finance') or v_has_payroll_perm then coalesce((
      select jsonb_agg(staff_id)
      from public.pw_staff_bank_details
      where account_number_hash is not null
    ), '[]'::jsonb) else '[]'::jsonb end,
    'salaryEndDates', coalesce((
      select jsonb_object_agg(id::text, salary_end_date::text)
      from public.pw_profiles
      where salary_end_date is not null
    ), '{}'::jsonb)
  );
end $$;

revoke all on function public.pw_payroll_directory() from public, anon;
grant execute on function public.pw_payroll_directory() to authenticated;

-- 2. pw_end_salary_action: Allow finance/owner or roles with workspace.payroll/finance permissions
create or replace function public.pw_end_salary_action(p_staff uuid, p_end date, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.pw_profiles;
  v_target public.pw_profiles;
  v_has_payroll_perm boolean := public.pw_has_permission(auth.uid(), 'workspace.payroll');
  v_has_finance_perm boolean := public.pw_has_permission(auth.uid(), 'workspace.finance');
begin
  select * into v_actor from public.pw_profiles
  where id = auth.uid() and status = 'active';

  if v_actor.id is null or (v_actor.role not in ('super_admin', 'owner', 'finance') and not v_has_payroll_perm and not v_has_finance_perm) then
    raise exception 'Finance or owner access required.' using errcode = '42501';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A written reason of at least 5 characters is required.' using errcode = '22023';
  end if;

  select * into v_target from public.pw_profiles where id = p_staff;
  if v_target.id is null or v_target.role in ('super_admin', 'owner', 'parent', 'student') then
    raise exception 'Select a valid non-owner staff account.' using errcode = '22023';
  end if;

  update public.pw_profiles
  set salary_end_date = p_end
  where id = p_staff;

  insert into public.pw_audit (
    action, entity_type, entity_id, actor_id, actor_name, changed_fields
  ) values (
    'update_salary_end_date',
    'pw_profiles',
    p_staff::text,
    auth.uid(),
    coalesce(v_actor.name, 'Finance'),
    array['salary_end_date', p_reason]
  );

  return jsonb_build_object(
    'ok', true,
    'staffId', p_staff,
    'salaryEndDate', p_end
  );
end $$;

revoke all on function public.pw_end_salary_action(uuid, date, text) from public, anon;
grant execute on function public.pw_end_salary_action(uuid, date, text) to authenticated;

-- 3. pw_operations_financial_summary: Allow roles with workspace.finance or workspace.operations permission
create or replace function public.pw_operations_financial_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  rules public.pw_finance_rules;
  profit_allowed boolean;
  v_has_finance_perm boolean := public.pw_has_permission(auth.uid(), 'workspace.finance');
  v_has_ops_perm boolean := public.pw_has_permission(auth.uid(), 'workspace.operations');
begin
  if not (
    public.pw_active() and (
      public.pw_role() in ('super_admin', 'owner', 'finance')
      or v_has_finance_perm
      or v_has_ops_perm
    )
  ) then
    return '[]'::jsonb;
  end if;

  select * into rules from public.pw_finance_rules;
  profit_allowed := public.pw_role() in ('super_admin', 'owner') or coalesce(rules.finance_profit, false);

  with entries as (
    select
      payload->>'currency' as currency,
      greatest(0, (payload->>'amount')::numeric - coalesce((payload->>'referralDiscount')::numeric, 0)) as amount,
      'income' as kind,
      (verified_at at time zone 'Africa/Lagos')::date as date
    from public.pw_payments
    where verified_at is not null and payload->>'status' = 'paid'
    union all
    select
      payload->>'currency',
      (payload->>'amount')::numeric,
      'expenses',
      (created_at at time zone 'Africa/Lagos')::date
    from public.pw_expenses
  ),
  aggregated as (
    select
      currency,
      kind,
      to_char(date, 'YYYY-MM') as month,
      sum(amount) as total
    from entries
    where currency is not null
    group by currency, kind, to_char(date, 'YYYY-MM')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'currency', currency,
    'kind', kind,
    'month', month,
    'total', total
  )), '[]'::jsonb) into result
  from aggregated;

  return result;
end $$;

revoke all on function public.pw_operations_financial_summary() from public, anon;
grant execute on function public.pw_operations_financial_summary() to authenticated;

-- 4. Classroom recording egress metadata: Allow any non-family active staff member
create or replace function public.pw_classroom_egress_info(p_lesson text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.pw_classrooms;
  r text := public.pw_role();
begin
  if not public.pw_active() or r in ('parent', 'student') then
    raise exception 'Unauthorized recording access.' using errcode = '42501';
  end if;

  -- Enforce lesson membership / portfolio access
  perform public.pw_classroom_access(p_lesson, false);

  select * into v_room
  from public.pw_classrooms
  where lesson_id = p_lesson
  order by created_at desc
  limit 1;

  return jsonb_build_object(
    'roomName', v_room.room_name,
    'activeEgressId', v_room.active_egress_id,
    'egressStartedAt', v_room.egress_started_at
  );
end $$;

create or replace function public.pw_set_lesson_egress(p_lesson text, p_egress_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r text := public.pw_role();
begin
  if not public.pw_active() or r in ('parent', 'student') then
    raise exception 'Unauthorized recording metadata update.' using errcode = '42501';
  end if;

  perform public.pw_classroom_access(p_lesson, false);

  update public.pw_classrooms
  set active_egress_id = p_egress_id,
      egress_started_at = case when p_egress_id is null then null else now() end
  where lesson_id = p_lesson;
end $$;

revoke all on function public.pw_classroom_egress_info(text) from public, anon;
grant execute on function public.pw_classroom_egress_info(text) to authenticated;
revoke all on function public.pw_set_lesson_egress(text, text) from public, anon;
grant execute on function public.pw_set_lesson_egress(text, text) to authenticated;

-- 5. Notify schema reload
notify pgrst, 'reload schema';
