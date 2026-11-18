-- Migration 067: Dynamic Settings, Catalogs, RLS & Role Access Hardening
-- Resolves all disconnects between dynamic roles/catalogs and legacy table constraints / RLS:
-- 1. pw_active() & pw_role() enforce r.enabled = true
-- 2. Drop obsolete constraints on pw_settings (pw_standard_lesson_lengths, pw_document_schedule_bounds)
-- 3. Relax pw_student_state on pw_students to support dynamic catalog ranks
-- 4. Relax pw_hiring_cases.desired_role check and add FK to pw_roles
-- 5. Update pw_lesson_duration() trigger and pw_operations_action to allow 1–180 minute durations
-- 6. Wire pw_can_student, pw_manage_student, and table RLS policies to evaluate pw_has_permission()
-- 7. Harden pw_provision_applicant against target hijacking and self-demotion
-- 8. Harden pw_save_settings with timezone and email regex validation
-- 9. Protect pw_role_action and pw_catalog_action against malformed JSON types

-- ============================================================================
-- 1. Active Role Enforcement in Core Session Functions
-- ============================================================================
create or replace function public.pw_active() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.pw_profiles p
    join public.pw_roles r on r.code = p.role
    where p.id = auth.uid() and p.status = 'active' and r.enabled = true
  );
$$;

create or replace function public.pw_role() returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.pw_profiles p
  join public.pw_roles r on r.code = p.role
  where p.id = auth.uid() and p.status in ('active','on_leave') and r.enabled = true;
$$;

revoke all on function public.pw_active() from public, anon;
grant execute on function public.pw_active() to authenticated, service_role;

revoke all on function public.pw_role() from public, anon;
grant execute on function public.pw_role() to authenticated, service_role;

-- ============================================================================
-- 2. Align Table Constraints on pw_settings & pw_students
-- ============================================================================
alter table public.pw_settings drop constraint if exists pw_standard_lesson_lengths;
alter table public.pw_settings drop constraint if exists pw_document_schedule_bounds;

alter table public.pw_settings add constraint pw_standard_lesson_lengths check (
  (settings->>'standardMinutes')::integer between 1 and 180
  and (settings->>'trialMinutes')::integer between 1 and 180
  and (settings->>'coverMinutes')::integer between 1 and 180
);

alter table public.pw_settings add constraint pw_document_schedule_bounds check (
  (settings->>'adminConcurrentClasses')::integer between 1 and 20
  and (settings->>'rescheduleNoticeHours')::integer >= 0
);

-- Dynamic student ranks: allow any 1-80 char rank string
alter table public.pw_students drop constraint if exists pw_student_state;
alter table public.pw_students add constraint pw_student_state check (
  coalesce(payload->>'status' in ('active','paused','inactive'), false)
  and length(trim(coalesce(payload->>'rank', ''))) between 1 and 80
  and jsonb_typeof(payload->'consent') = 'boolean'
);

-- ============================================================================
-- 3. Dynamic Hiring Cases Role Link
-- ============================================================================
alter table public.pw_hiring_cases drop constraint if exists pw_hiring_cases_desired_role_check;
alter table public.pw_hiring_cases drop constraint if exists pw_hiring_cases_desired_role_fkey;
alter table public.pw_hiring_cases
  add constraint pw_hiring_cases_desired_role_fkey
  foreign key (desired_role) references public.pw_roles(code);

-- ============================================================================
-- 4. Dynamic Lesson Duration Trigger & Recurrence Limits
-- ============================================================================
create or replace function public.pw_lesson_duration() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rule text;
  duration integer;
  r text := public.pw_role();
begin
  if tg_op = 'UPDATE' then
    if new.duration_minutes is distinct from old.duration_minutes
      or (old.payload ? 'durationMinutes' and not (new.payload ? 'durationMinutes'))
      or (new.payload ? 'durationMinutes' and (new.payload->>'durationMinutes')::integer <> old.duration_minutes)
      or new.payload->>'durationReason' is distinct from old.payload->>'durationReason'
    then
      raise exception 'Duration agreement is immutable; cancel and schedule a replacement' using errcode = '42501';
    end if;
  else
    rule := case new.payload->>'kind'
      when 'trial' then 'trialMinutes'
      when 'cover' then 'coverMinutes'
      else 'standardMinutes'
    end;
    select (settings->>rule)::integer into duration from public.pw_settings where singleton;
    if new.payload ? 'durationMinutes' then
      if r not in ('super_admin','head_admin','admin') and not public.pw_has_permission('workspace.schedule') then
        raise exception 'Staff must approve a duration agreement' using errcode = '42501';
      end if;
      if jsonb_typeof(new.payload->'durationMinutes') <> 'number' or (new.payload->>'durationMinutes')::numeric <> trunc((new.payload->>'durationMinutes')::numeric) then
        raise exception 'Whole-minute duration required' using errcode = '22023';
      end if;
      duration := (new.payload->>'durationMinutes')::integer;
    end if;
    if duration not between 1 and 180 or duration is null then
      raise exception 'Class duration must be 1–180 minutes' using errcode = '22023';
    end if;
    if duration > 60 and length(trim(coalesce(new.payload->>'durationReason',''))) < 5 then
      raise exception 'Record the family request/agreement for an extended class' using errcode = '22023';
    end if;
    new.duration_minutes := duration;
    new.payload := new.payload || jsonb_build_object('durationMinutes', duration);
  end if;
  return new;
end $$;

-- Update recurrence bounds check in pw_operations_action
do $do$
declare
  definition text;
begin
  select pg_get_functiondef('public.pw_operations_action(text,jsonb)'::regprocedure) into definition;
  if definition is not null and definition ~ 'duration.*?between 45 and 180' then
    definition := regexp_replace(definition, 'duration.*?' || quote_literal('')::text || '\)::integer not between 45 and 180', 'duration'')::integer not between 1 and 180', 'g');
    execute definition;
  end if;
end $do$;

-- ============================================================================
-- 5. Student Access Functions Wired to Dynamic Permissions
-- ============================================================================
create or replace function public.pw_can_student(target text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.pw_active() and (
    public.pw_role() in ('super_admin', 'general_manager')
    or public.pw_has_permission('workspace.students')
    or exists(
      select 1 from public.pw_students s
      left join public.pw_profiles a on a.id = s.admin_id
      left join public.pw_profiles t on t.id = s.teacher_id
      where s.id = target and (
        auth.uid() in (s.parent_id, s.student_user_id, s.teacher_id, s.admin_id)
        or (public.pw_role() = 'head_admin' and a.head_admin_id = auth.uid())
        or (public.pw_role() = 'qc' and t.qc_id = auth.uid())
      )
    )
    or exists(
      select 1 from public.pw_leave_covers c
      join public.pw_leaves v on v.id = c.leave_id
      join public.pw_students s on s.id = c.student_id
      where c.student_id = target and c.cover_id = auth.uid()
        and (case c.duty when 'teacher' then s.teacher_id else s.admin_id end) = c.original_id
        and v.state in ('approved','active') and clock_timestamp() >= v.starts_at and clock_timestamp() < v.ends_at
    )
    or exists(
      select 1 from public.pw_emergency_covers c
      join public.pw_lessons l on l.id = c.lesson_id
      where c.student_id = target and c.superseded_at is null
        and clock_timestamp() >= c.starts_at and clock_timestamp() < c.ends_at
        and auth.uid() in (c.teacher_id, c.admin_id)
        and l.teacher_id = c.teacher_id and l.admin_id = c.admin_id
    )
  );
$$;

create or replace function public.pw_manage_student(target text) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.pw_active() and (
    public.pw_role() in ('super_admin', 'general_manager')
    or public.pw_has_permission('workspace.students')
    or exists (
      select 1 from public.pw_students s
      join public.pw_profiles a on a.id = s.admin_id
      where s.id = target and (s.admin_id = auth.uid() or (public.pw_role() = 'head_admin' and a.head_admin_id = auth.uid()))
    )
  );
$$;

revoke all on function public.pw_can_student(text) from public, anon;
grant execute on function public.pw_can_student(text) to authenticated, service_role;

revoke all on function public.pw_manage_student(text) from public, anon;
grant execute on function public.pw_manage_student(text) to authenticated, service_role;

-- ============================================================================
-- 6. RLS Policies Updated to Honor Dynamic Permissions
-- ============================================================================
-- Students insert policy
drop policy if exists pw_student_insert on public.pw_students;
create policy pw_student_insert on public.pw_students
  for insert to authenticated
  with check (
    public.pw_active() and (
      public.pw_role() in ('super_admin', 'general_manager', 'head_admin')
      or public.pw_has_permission('workspace.students')
      or public.pw_has_permission('admissions.approve')
    )
  );

-- Leads policies
drop policy if exists pw_lead_read on public.pw_leads;
create policy pw_lead_read on public.pw_leads
  for select to authenticated
  using (
    public.pw_role() in ('super_admin', 'general_manager', 'head_admin', 'sales_marketing')
    or public.pw_has_permission('workspace.leads')
  );

drop policy if exists pw_lead_insert on public.pw_leads;
create policy pw_lead_insert on public.pw_leads
  for insert to authenticated
  with check (
    public.pw_active() and (
      public.pw_role() in ('super_admin', 'general_manager', 'head_admin', 'sales_marketing')
      or public.pw_has_permission('workspace.leads')
    )
  );

drop policy if exists pw_lead_update on public.pw_leads;
create policy pw_lead_update on public.pw_leads
  for update to authenticated
  using (
    public.pw_active() and (
      public.pw_role() in ('super_admin', 'general_manager', 'head_admin', 'sales_marketing')
      or public.pw_has_permission('workspace.leads')
    )
  );

-- Payments policies
drop policy if exists pw_payment_read on public.pw_payments;
create policy pw_payment_read on public.pw_payments
  for select to authenticated
  using (
    public.pw_role() in ('super_admin', 'general_manager', 'finance')
    or public.pw_has_permission('workspace.finance')
    or public.pw_can_student(student_id)
  );

drop policy if exists pw_payment_insert on public.pw_payments;
create policy pw_payment_insert on public.pw_payments
  for insert to authenticated
  with check (
    public.pw_active() and (
      public.pw_role() in ('super_admin', 'general_manager', 'finance')
      or public.pw_has_permission('workspace.finance')
    )
  );

drop policy if exists pw_payment_update on public.pw_payments;
create policy pw_payment_update on public.pw_payments
  for update to authenticated
  using (
    public.pw_active() and (
      public.pw_role() in ('super_admin', 'general_manager', 'finance')
      or public.pw_has_permission('workspace.finance')
      or public.pw_can_student(student_id)
    )
  );

-- Expenses policies
drop policy if exists pw_expense_read on public.pw_expenses;
create policy pw_expense_read on public.pw_expenses
  for select to authenticated
  using (
    public.pw_role() in ('super_admin', 'general_manager', 'finance')
    or public.pw_has_permission('workspace.finance')
  );

drop policy if exists pw_expense_insert on public.pw_expenses;
create policy pw_expense_insert on public.pw_expenses
  for insert to authenticated
  with check (
    public.pw_active() and (
      public.pw_role() in ('super_admin', 'finance')
      or public.pw_has_permission('workspace.finance')
    )
  );

drop policy if exists pw_expense_update on public.pw_expenses;
create policy pw_expense_update on public.pw_expenses
  for update to authenticated
  using (
    public.pw_active() and (
      public.pw_role() in ('super_admin', 'finance')
      or public.pw_has_permission('workspace.finance')
    )
  );

-- Payroll policies
drop policy if exists pw_payroll_read on public.pw_payroll;
create policy pw_payroll_read on public.pw_payroll
  for select to authenticated
  using (
    public.pw_role() in ('super_admin', 'general_manager', 'finance')
    or public.pw_has_permission('workspace.payroll')
    or public.pw_has_permission('payroll.view')
    or staff_id = auth.uid()
  );

drop policy if exists pw_payroll_insert on public.pw_payroll;
create policy pw_payroll_insert on public.pw_payroll
  for insert to authenticated
  with check (
    public.pw_active() and (
      public.pw_role() in ('super_admin', 'finance')
      or public.pw_has_permission('workspace.payroll')
    )
  );

drop policy if exists pw_payroll_update on public.pw_payroll;
create policy pw_payroll_update on public.pw_payroll
  for update to authenticated
  using (
    public.pw_active() and (
      public.pw_role() in ('super_admin', 'finance')
      or public.pw_has_permission('workspace.payroll')
    )
  );

-- Resources policies
drop policy if exists pw_resource_read on public.pw_resources;
create policy pw_resource_read on public.pw_resources
  for select to authenticated
  using (
    public.pw_active() and (
      public.pw_role() in ('super_admin', 'general_manager', 'qc', 'teacher', 'parent', 'student')
      or public.pw_has_permission('workspace.curriculum')
    )
  );

drop policy if exists pw_resource_write on public.pw_resources;
create policy pw_resource_write on public.pw_resources
  for insert to authenticated
  with check (
    public.pw_active() and (
      public.pw_role() in ('super_admin', 'qc', 'teacher')
      or public.pw_has_permission('workspace.curriculum')
    )
  );

-- Attendance read policy
drop policy if exists pw_attendance_read on public.pw_attendance;
create policy pw_attendance_read on public.pw_attendance
  for select to authenticated
  using (
    public.pw_role() in ('super_admin', 'general_manager', 'finance')
    or public.pw_has_permission('workspace.students')
    or teacher_id = auth.uid()
    or admin_id = auth.uid()
    or public.pw_can_student(student_id)
  );

-- Complaints management RLS update
drop policy if exists pw_complaints_update on public.pw_complaints;
create policy pw_complaints_update on public.pw_complaints
  for update to authenticated
  using (
    public.pw_active() and public.pw_portal_allowed() and (
      public.pw_role() in ('super_admin', 'general_manager', 'qc', 'head_admin')
      or public.pw_has_permission('complaints.manage')
      or public.pw_has_permission('workspace.complaints')
    )
  )
  with check (
    public.pw_active() and public.pw_portal_allowed() and (
      public.pw_role() in ('super_admin', 'general_manager', 'qc', 'head_admin')
      or public.pw_has_permission('complaints.manage')
      or public.pw_has_permission('workspace.complaints')
    )
  );

-- ============================================================================
-- 7. Educator Grading & Review Guard Hardening
-- ============================================================================
create or replace function public.pw_guard_rank() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.payload->>'rank' is distinct from old.payload->>'rank' then
    if public.pw_role() is null or (
      public.pw_role() not in ('super_admin', 'qc', 'teacher')
      and not public.pw_has_permission('workspace.curriculum')
      and not public.pw_has_permission('workspace.students')
    ) then
      raise exception 'Only assigned teachers, QC or educators with curriculum permission may grade rank' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- ============================================================================
-- 8. Hardened pw_provision_applicant (Pending Target & Privilege Checks)
-- ============================================================================
create or replace function public.pw_provision_applicant(
  actor uuid,
  target uuid,
  new_role text,
  new_timezone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.pw_profiles;
begin
  select * into v_actor from public.pw_profiles p
  join public.pw_roles r on r.code = p.role and r.enabled = true
  where p.id = actor and p.status = 'active'
    and (p.role = 'super_admin' or 'hiring.invite' = any(r.permissions));

  if v_actor.id is null then
    raise exception 'Hiring invitation permission required.' using errcode = '42501';
  end if;

  if target = actor then
    raise exception 'Cannot provision your own account.' using errcode = '42501';
  end if;

  if not exists(select 1 from public.pw_profiles where id = target and status = 'pending') then
    raise exception 'Only pending applicant profiles can be provisioned.' using errcode = '23514';
  end if;

  if exists(select 1 from public.pw_profiles where id = target and role = 'super_admin') then
    raise exception 'Owner accounts cannot be modified here.' using errcode = '42501';
  end if;

  if new_role in ('super_admin', 'general_manager') then
    raise exception 'Privileged executive roles require owner provisioning.' using errcode = '42501';
  end if;

  if not exists(select 1 from public.pw_roles where code = new_role and enabled = true and invitable = true) then
    raise exception 'Selected role is not enabled for invitations.' using errcode = '22023';
  end if;

  update public.pw_profiles
  set status = 'applicant',
      role = new_role,
      timezone = coalesce(nullif(trim(new_timezone), ''), timezone)
  where id = target;

  if not found then
    raise exception 'Applicant profile missing.' using errcode = '23514';
  end if;

  insert into public.pw_audit(
    actor_id, actor_name, actor_role, entity_type, entity_id, subject_id, action, changed_fields
  )
  values(
    actor,
    v_actor.name,
    v_actor.role,
    'pw_profiles',
    target::text,
    target,
    'Applicant account provisioned',
    array['role:' || new_role, 'status:applicant']
  );
end $$;

-- ============================================================================
-- 9. Hardened pw_save_settings (Timezone and Email Validation)
-- ============================================================================
create or replace function public.pw_save_settings(
  p_revision integer,
  p_settings jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.pw_settings%rowtype;
  v_merged jsonb;
  v_inactivity integer;
  v_tz text;
  v_emails jsonb;
  field text;
begin
  if not public.pw_active() or public.pw_role() <> 'super_admin' then
    raise exception 'Academy owner privileges required.' using errcode = '42501';
  end if;

  select * into current_row from public.pw_settings where singleton for update;
  if not found then
    raise exception 'Academy settings record not initialized.' using errcode = '23514';
  end if;

  if p_revision is not null and current_row.revision <> p_revision then
    raise exception 'Settings modified by another session. Refresh and try again.' using errcode = '40001';
  end if;

  if jsonb_typeof(p_settings) is distinct from 'object' then
    raise exception 'Settings must be a JSON object.' using errcode = '22023';
  end if;

  v_inactivity := coalesce((p_settings->>'inactivityTimeoutMinutes')::integer, (current_row.settings->>'inactivityTimeoutMinutes')::integer, 60);
  if v_inactivity not between 15 and 480 then
    raise exception 'Inactivity timeout must be between 15 and 480 minutes.' using errcode = '22023';
  end if;

  v_tz := coalesce(nullif(trim(p_settings->>'defaultTimezone'), ''), coalesce(current_row.settings->>'defaultTimezone', 'Africa/Lagos'));
  if length(v_tz) > 100 or not exists (select 1 from pg_timezone_names where name = v_tz) then
    raise exception 'Invalid default timezone: %', v_tz using errcode = '22023';
  end if;

  v_emails := coalesce(p_settings->'emails', current_row.settings->'emails', jsonb_build_object(
    'admissions', 'admissions@prosperworkmusic.com',
    'complaints', 'complaints@prosperworkmusic.com',
    'support', 'support@prosperworkmusic.com',
    'fees', 'fees@prosperworkmusic.com',
    'info', 'info@prosperworkmusic.com'
  ));
  if jsonb_typeof(v_emails) is distinct from 'object' then
    raise exception 'Invalid academy routing emails.' using errcode = '22023';
  end if;

  foreach field in array array['admissions', 'complaints', 'support', 'fees', 'info'] loop
    if coalesce(v_emails->>field, '') !~* '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' or length(v_emails->>field) > 254 then
      raise exception 'Invalid routing email for %', field using errcode = '22023';
    end if;
  end loop;

  v_merged := current_row.settings || p_settings || jsonb_build_object(
    'inactivityTimeoutMinutes', v_inactivity,
    'defaultTimezone', v_tz,
    'emails', v_emails
  );

  if not (
    (v_merged->>'standardMinutes')::integer between 1 and 180 and
    (v_merged->>'trialMinutes')::integer between 1 and 180 and
    (v_merged->>'coverMinutes')::integer between 1 and 180 and
    (v_merged->>'rescheduleNoticeHours')::integer between 0 and 72 and
    (v_merged->>'adminConcurrentClasses')::integer between 1 and 20 and
    (v_merged->>'joinBeforeHours')::integer between 0 and 2 and
    (v_merged->>'joinAfterHours')::integer between 5 and 6 and
    (v_merged->>'adminParentQuota')::integer between 0 and 1000 and
    (v_merged->>'payrollWeekAnchor') in ('not_configured', 'calendar_month', 'pay_cycle') and
    (v_merged->>'advanceEligibility') in ('not_configured', 'owner_selected', 'previous_period_verified', 'disabled') and
    jsonb_typeof(v_merged->'vacationAutoApprove') = 'boolean'
  ) then
    raise exception 'Settings values violate academy boundary rules.' using errcode = '22023';
  end if;

  update public.pw_settings
  set settings = v_merged,
      revision = current_row.revision + 1,
      updated_at = now()
  where singleton;

  update public.pw_rules set value = (v_merged->>'rescheduleNoticeHours')::integer where key = 'reschedule_notice_hours';
  update public.pw_rules set value = (v_merged->>'adminConcurrentClasses')::integer where key = 'admin_concurrent_classes';

  insert into public.pw_audit(actor_id, actor_name, actor_role, entity_type, entity_id, action, changed_fields)
  values(
    auth.uid(),
    (select name from public.pw_profiles where id = auth.uid()),
    public.pw_role(),
    'pw_settings',
    'academy',
    'Academy rules changed',
    array(select key from jsonb_each(v_merged) where value is distinct from current_row.settings->key)
  );

  return current_row.revision + 1;
end $$;

-- ============================================================================
-- 10. Robust JSON Type Guards on pw_role_action & pw_catalog_action
-- ============================================================================
create or replace function public.pw_role_action(
  p_action text,
  p_code text,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := lower(trim(p_code));
  v_perms text[];
  v_existing public.pw_roles%rowtype;
begin
  if not public.pw_active() or public.pw_role() <> 'super_admin' then
    raise exception 'Academy owner privileges required.' using errcode = '42501';
  end if;

  if v_code !~ '^[a-z][a-z0-9_]{1,40}$' then
    raise exception 'Role code must be lowercase alphanumeric with underscores (2–41 characters).' using errcode = '22023';
  end if;

  if p_data ? 'permissions' and jsonb_typeof(p_data->'permissions') <> 'array' then
    raise exception 'Permissions must be a JSON array.' using errcode = '22023';
  end if;

  select * into v_existing from public.pw_roles where code = v_code;

  if p_action = 'create' then
    if v_existing.code is not null then
      raise exception 'Role % already exists.', v_code using errcode = '23505';
    end if;

    select coalesce(array_agg(distinct val), '{}') into v_perms
    from jsonb_array_elements_text(coalesce(p_data->'permissions', '[]'::jsonb)) val;

    insert into public.pw_roles (
      code, label, department, is_system, is_staff, invitable, enabled, permissions, updated_by, updated_at
    )
    values (
      v_code,
      coalesce(nullif(trim(p_data->>'label'), ''), v_code),
      coalesce(nullif(trim(p_data->>'department'), ''), 'General'),
      false,
      coalesce((p_data->>'isStaff')::boolean, true),
      coalesce((p_data->>'invitable')::boolean, true),
      coalesce((p_data->>'enabled')::boolean, true),
      coalesce(v_perms, '{}'),
      auth.uid(),
      now()
    );

    insert into public.pw_audit(actor_id, actor_name, actor_role, entity_type, entity_id, subject_id, action, changed_fields)
    values(
      auth.uid(), (select name from public.pw_profiles where id = auth.uid()), public.pw_role(),
      'pw_roles', v_code, auth.uid(), 'Role created', array['code:' || v_code]
    );

    return jsonb_build_object('success', true, 'code', v_code);

  elsif p_action = 'update' then
    if v_existing.code is null then
      raise exception 'Role % does not exist.', v_code using errcode = '23514';
    end if;

    if p_data ? 'permissions' then
      select coalesce(array_agg(distinct val), '{}') into v_perms
      from jsonb_array_elements_text(p_data->'permissions') val;
    else
      v_perms := v_existing.permissions;
    end if;

    update public.pw_roles
    set label = coalesce(nullif(trim(p_data->>'label'), ''), label),
        department = coalesce(nullif(trim(p_data->>'department'), ''), department),
        is_staff = coalesce((p_data->>'isStaff')::boolean, is_staff),
        invitable = case when is_system then invitable else coalesce((p_data->>'invitable')::boolean, invitable) end,
        enabled = case when is_system then true else coalesce((p_data->>'enabled')::boolean, enabled) end,
        permissions = case when is_system and code = 'super_admin' then permissions else coalesce(v_perms, permissions) end,
        updated_by = auth.uid(),
        updated_at = now()
    where code = v_code;

    insert into public.pw_audit(actor_id, actor_name, actor_role, entity_type, entity_id, subject_id, action, changed_fields)
    values(
      auth.uid(), (select name from public.pw_profiles where id = auth.uid()), public.pw_role(),
      'pw_roles', v_code, auth.uid(), 'Role updated', array['code:' || v_code]
    );

    return jsonb_build_object('success', true, 'code', v_code);

  elsif p_action = 'delete' then
    if v_existing.code is null then
      raise exception 'Role % does not exist.', v_code using errcode = '23514';
    end if;
    if v_existing.is_system then
      raise exception 'System roles cannot be deleted.' using errcode = '42501';
    end if;
    if exists(select 1 from public.pw_profiles where role = v_code) then
      raise exception 'Cannot delete role % while active accounts are assigned to it.', v_code using errcode = '23503';
    end if;

    delete from public.pw_roles where code = v_code;

    insert into public.pw_audit(actor_id, actor_name, actor_role, entity_type, entity_id, subject_id, action, changed_fields)
    values(
      auth.uid(), (select name from public.pw_profiles where id = auth.uid()), public.pw_role(),
      'pw_roles', v_code, auth.uid(), 'Role deleted', array['code:' || v_code]
    );

    return jsonb_build_object('success', true, 'code', v_code);
  else
    raise exception 'Unknown role action %', p_action using errcode = '22023';
  end if;
end $$;

create or replace function public.pw_catalog_action(
  p_action text,
  p_catalog text,
  p_code text,
  p_data jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_catalog text := lower(trim(p_catalog));
  v_code text := trim(p_code);
  v_sort integer;
  v_enabled boolean;
  v_existing public.pw_catalog_items%rowtype;
begin
  if not public.pw_active() or public.pw_role() <> 'super_admin' then
    raise exception 'Academy owner privileges required.' using errcode = '42501';
  end if;

  if v_catalog not in ('instruments', 'student_ranks', 'lesson_durations', 'complaint_categories', 'expense_categories', 'lead_sources') then
    raise exception 'Unknown catalog %', v_catalog using errcode = '22023';
  end if;

  if length(v_code) < 1 or length(v_code) > 80 then
    raise exception 'Catalog code must be between 1 and 80 characters.' using errcode = '22023';
  end if;

  if p_data ? 'sortOrder' and p_data->>'sortOrder' !~ '^-?[0-9]+$' then
    raise exception 'sortOrder must be an integer.' using errcode = '22023';
  end if;

  select * into v_existing from public.pw_catalog_items where catalog = v_catalog and code = v_code;

  if p_action = 'create' then
    if v_existing.id is not null then
      raise exception 'Item % already exists in catalog %.', v_code, v_catalog using errcode = '23505';
    end if;

    v_sort := coalesce((p_data->>'sortOrder')::integer, 100);
    v_enabled := coalesce((p_data->>'enabled')::boolean, true);

    insert into public.pw_catalog_items (catalog, code, label, sort_order, enabled, meta, updated_by, updated_at)
    values (
      v_catalog,
      v_code,
      coalesce(nullif(trim(p_data->>'label'), ''), v_code),
      v_sort,
      v_enabled,
      coalesce(p_data->'meta', '{}'::jsonb),
      auth.uid(),
      now()
    );

    insert into public.pw_audit(actor_id, actor_name, actor_role, entity_type, entity_id, subject_id, action, changed_fields)
    values(
      auth.uid(), (select name from public.pw_profiles where id = auth.uid()), public.pw_role(),
      'pw_catalog_items', v_catalog || ':' || v_code, auth.uid(), 'Catalog item created', array[v_catalog || ':' || v_code]
    );

    return jsonb_build_object('success', true, 'catalog', v_catalog, 'code', v_code);

  elsif p_action = 'update' then
    if v_existing.id is null then
      raise exception 'Item % does not exist in catalog %.', v_code, v_catalog using errcode = '23514';
    end if;

    update public.pw_catalog_items
    set label = coalesce(nullif(trim(p_data->>'label'), ''), label),
        sort_order = coalesce((p_data->>'sortOrder')::integer, sort_order),
        enabled = coalesce((p_data->>'enabled')::boolean, enabled),
        meta = case when p_data ? 'meta' then coalesce(p_data->'meta', '{}'::jsonb) else meta end,
        updated_by = auth.uid(),
        updated_at = now()
    where catalog = v_catalog and code = v_code;

    insert into public.pw_audit(actor_id, actor_name, actor_role, entity_type, entity_id, subject_id, action, changed_fields)
    values(
      auth.uid(), (select name from public.pw_profiles where id = auth.uid()), public.pw_role(),
      'pw_catalog_items', v_catalog || ':' || v_code, auth.uid(), 'Catalog item updated', array[v_catalog || ':' || v_code]
    );

    return jsonb_build_object('success', true, 'catalog', v_catalog, 'code', v_code);

  elsif p_action = 'delete' then
    if v_existing.id is null then
      raise exception 'Item % does not exist in catalog %.', v_code, v_catalog using errcode = '23514';
    end if;

    delete from public.pw_catalog_items where catalog = v_catalog and code = v_code;

    insert into public.pw_audit(actor_id, actor_name, actor_role, entity_type, entity_id, subject_id, action, changed_fields)
    values(
      auth.uid(), (select name from public.pw_profiles where id = auth.uid()), public.pw_role(),
      'pw_catalog_items', v_catalog || ':' || v_code, auth.uid(), 'Catalog item deleted', array[v_catalog || ':' || v_code]
    );

    return jsonb_build_object('success', true, 'catalog', v_catalog, 'code', v_code);
  else
    raise exception 'Unknown catalog action %', p_action using errcode = '22023';
  end if;
end $$;

notify pgrst, 'reload schema';
