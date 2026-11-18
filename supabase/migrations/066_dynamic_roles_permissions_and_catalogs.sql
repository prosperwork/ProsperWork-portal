-- Migration 066: Dynamic DB-Driven Roles, Permissions, Catalogs & Academy Config
-- Replaces rigid hardcoded role lists, instruments, student ranks, lesson durations,
-- complaint/expense categories, lead sources, and academy routing emails with
-- Super Admin editable database tables & audited RPCs.

-- ============================================================================
-- 1. Dynamic Roles & Permissions Registry (public.pw_roles)
-- ============================================================================
create table if not exists public.pw_roles (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null check (length(trim(label)) between 2 and 80),
  department text not null default 'General' check (length(trim(department)) between 2 and 80),
  is_system boolean not null default false,
  is_staff boolean not null default true,
  invitable boolean not null default true,
  enabled boolean not null default true,
  permissions text[] not null default '{}',
  updated_by uuid references public.pw_profiles(id),
  updated_at timestamptz not null default now()
);

alter table public.pw_roles enable row level security;
revoke all on public.pw_roles from anon, authenticated;
grant select on public.pw_roles to authenticated;

drop policy if exists pw_roles_read on public.pw_roles;
create policy pw_roles_read on public.pw_roles
  for select to authenticated
  using (public.pw_active());

insert into public.pw_roles (code, label, department, is_system, is_staff, invitable, enabled, permissions)
values
  ('super_admin', 'Super Admin (Owner)', 'Executive', true, true, false, true, array[
    'workspace.overview','workspace.schedule','workspace.students','workspace.family','workspace.complaints',
    'workspace.leads','workspace.finance','workspace.payroll','workspace.people','workspace.curriculum',
    'workspace.learning','workspace.homework','workspace.reports','workspace.settings','workspace.workflows',
    'workspace.operations','workspace.management','workspace.accounts','workspace.documents','workspace.policies',
    'workspace.leave','workspace.hiring','workspace.communications','workspace.studio','workspace.manual',
    'complaints.manage','complaints.create','classroom.record','classroom.grant_tools','admissions.approve',
    'accounts.view','accounts.manage','hiring.invite','email.compose_staff','email.compose_family',
    'email.compose_lead','ai.birthday','reports.learning','operations.view','payroll.view'
  ]),
  ('general_manager', 'General Manager', 'Executive', true, true, true, true, array[
    'workspace.overview','workspace.schedule','workspace.students','workspace.complaints','workspace.leads',
    'workspace.finance','workspace.people','workspace.curriculum','workspace.learning','workspace.homework',
    'workspace.reports','workspace.workflows','workspace.operations','workspace.management','workspace.accounts',
    'workspace.documents','workspace.policies','workspace.leave','workspace.hiring','workspace.manual',
    'complaints.manage','complaints.create','admissions.approve','accounts.view','hiring.invite',
    'email.compose_staff','email.compose_family','email.compose_lead','ai.birthday','operations.view'
  ]),
  ('head_admin', 'Head Admin', 'Administration', true, true, true, true, array[
    'workspace.overview','workspace.schedule','workspace.students','workspace.complaints','workspace.leads',
    'workspace.payroll','workspace.people','workspace.curriculum','workspace.learning','workspace.homework',
    'workspace.reports','workspace.workflows','workspace.operations','workspace.management','workspace.accounts',
    'workspace.documents','workspace.policies','workspace.leave','workspace.hiring','workspace.studio','workspace.manual',
    'complaints.manage','complaints.create','classroom.record','classroom.grant_tools','admissions.approve',
    'accounts.view','email.compose_staff','email.compose_family','email.compose_lead','ai.birthday',
    'reports.learning','operations.view','payroll.view'
  ]),
  ('admin', 'Admin', 'Administration', true, true, true, true, array[
    'workspace.overview','workspace.schedule','workspace.students','workspace.complaints','workspace.leads',
    'workspace.payroll','workspace.learning','workspace.homework','workspace.workflows','workspace.operations',
    'workspace.management','workspace.documents','workspace.policies','workspace.leave','workspace.hiring',
    'workspace.studio','workspace.manual',
    'complaints.manage','complaints.create','classroom.record','classroom.grant_tools','admissions.approve',
    'email.compose_family','email.compose_lead','ai.birthday','reports.learning','operations.view','payroll.view'
  ]),
  ('hr', 'Human Resources', 'People & HR', true, true, true, true, array[
    'workspace.overview','workspace.payroll','workspace.people','workspace.reports','workspace.management',
    'workspace.accounts','workspace.policies','workspace.leave','workspace.hiring','workspace.manual',
    'accounts.view','hiring.invite','email.compose_staff','operations.view','payroll.view'
  ]),
  ('qc', 'Quality Control', 'Academic Quality', true, true, true, true, array[
    'workspace.overview','workspace.schedule','workspace.students','workspace.complaints','workspace.payroll',
    'workspace.people','workspace.curriculum','workspace.learning','workspace.homework','workspace.reports',
    'workspace.workflows','workspace.operations','workspace.management','workspace.leave','workspace.hiring',
    'workspace.studio','workspace.manual',
    'complaints.manage','complaints.create','classroom.record','ai.birthday','reports.learning',
    'operations.view','payroll.view'
  ]),
  ('teacher', 'Instructor / Teacher', 'Music Education', true, true, true, true, array[
    'workspace.overview','workspace.schedule','workspace.students','workspace.payroll','workspace.curriculum',
    'workspace.learning','workspace.homework','workspace.workflows','workspace.operations','workspace.leave',
    'workspace.studio','workspace.manual',
    'classroom.record','ai.birthday','reports.learning','operations.view','payroll.view'
  ]),
  ('finance', 'Finance & Accounts', 'Finance', true, true, true, true, array[
    'workspace.overview','workspace.finance','workspace.payroll','workspace.reports','workspace.operations',
    'workspace.documents','workspace.leave','workspace.manual',
    'operations.view','payroll.view'
  ]),
  ('sales_marketing', 'Admissions & Marketing', 'Growth & Admissions', true, true, true, true, array[
    'workspace.overview','workspace.students','workspace.leads','workspace.payroll','workspace.operations',
    'workspace.management','workspace.leave','workspace.communications','workspace.manual',
    'email.compose_lead','operations.view','payroll.view'
  ]),
  ('social_media', 'Social Media & Content', 'Growth & Admissions', true, true, true, true, array[
    'workspace.overview','workspace.payroll','workspace.curriculum','workspace.operations','workspace.leave',
    'workspace.manual',
    'operations.view','payroll.view'
  ]),
  ('parent', 'Parent / Guardian', 'Families', true, false, true, true, array[
    'workspace.family','workspace.schedule','workspace.learning','workspace.homework','workspace.documents',
    'workspace.studio','workspace.complaints',
    'complaints.create','ai.birthday','reports.learning'
  ]),
  ('student', 'Student', 'Families', true, false, true, true, array[
    'workspace.schedule','workspace.learning','workspace.homework','workspace.studio',
    'ai.birthday','reports.learning'
  ])
on conflict (code) do nothing;

-- Replace hardcoded role CHECK on pw_profiles with FK to pw_roles(code)
alter table public.pw_profiles drop constraint if exists pw_profiles_role_check;
alter table public.pw_profiles drop constraint if exists pw_profiles_role_fkey;
alter table public.pw_profiles
  add constraint pw_profiles_role_fkey foreign key (role) references public.pw_roles(code);

-- Update pw_set_account & pw_provision_applicant to validate against active pw_roles
create or replace function public.pw_set_account(
  actor uuid, target uuid, new_status text, new_role text default null, new_timezone text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare owner public.pw_profiles;
begin
  select * into owner from public.pw_profiles where id = actor and role = 'super_admin' and status = 'active';
  if owner.id is null then raise exception 'Active owner required' using errcode = '42501'; end if;
  if new_status not in ('pending', 'active', 'on_leave', 'paused', 'restricted', 'applicant') then
    raise exception 'Invalid account state' using errcode = '23514';
  end if;
  if target = actor and new_status <> 'active' then
    raise exception 'Cannot deactivate yourself' using errcode = '42501';
  end if;
  if exists(select 1 from public.pw_profiles where id = target and role = 'super_admin') then
    raise exception 'Owner account needs safeguarded approval' using errcode = '42501';
  end if;
  if new_role = 'super_admin' then
    raise exception 'Owner promotion requires safeguarded approval' using errcode = '42501';
  end if;
  if new_role is not null and not exists(select 1 from public.pw_roles where code = new_role and enabled = true) then
    raise exception 'Selected role is disabled or does not exist' using errcode = '22023';
  end if;
  update public.pw_profiles
  set status = new_status,
      role = coalesce(new_role, role),
      timezone = coalesce(new_timezone, timezone)
  where id = target;
  if not found then raise exception 'Account missing' using errcode = '23514'; end if;
  insert into public.pw_audit(actor_id, actor_name, actor_role, entity_type, entity_id, subject_id, action, changed_fields)
  values(actor, owner.name, owner.role, 'pw_profiles', target::text, target, 'Account access changed', array['role', 'status', 'timezone']);
end $$;

revoke all on function public.pw_set_account(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.pw_set_account(uuid, uuid, text, text, text) to service_role;

create or replace function public.pw_provision_applicant(
  actor uuid, target uuid, new_role text, new_timezone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor public.pw_profiles;
begin
  select * into v_actor from public.pw_profiles p
  join public.pw_roles r on r.code = p.role and r.enabled = true
  where p.id = actor and p.status = 'active'
    and (p.role = 'super_admin' or 'hiring.invite' = any(r.permissions));
  if v_actor.id is null then
    raise exception 'Hiring invitation permission required.' using errcode = '42501';
  end if;
  if new_role in ('super_admin', 'general_manager') then
    raise exception 'Privileged executive roles require owner provisioning.' using errcode = '42501';
  end if;
  if not exists(select 1 from public.pw_roles where code = new_role and enabled = true and invitable = true) then
    raise exception 'Selected role is not enabled for invitations.' using errcode = '22023';
  end if;
  if exists(select 1 from public.pw_profiles where id = target and role = 'super_admin') then
    raise exception 'Owner accounts cannot be modified here.' using errcode = '42501';
  end if;
  update public.pw_profiles
  set status = 'applicant',
      role = new_role,
      timezone = coalesce(nullif(trim(new_timezone), ''), timezone)
  where id = target;
  if not found then raise exception 'Applicant profile missing.' using errcode = '23514'; end if;
  insert into public.pw_audit(actor_id, actor_name, actor_role, entity_type, entity_id, subject_id, action, changed_fields)
  values(actor, v_actor.name, v_actor.role, 'pw_profiles', target::text, target, 'Applicant account provisioned', array['role:' || new_role, 'status:applicant']);
end $$;

revoke all on function public.pw_provision_applicant(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.pw_provision_applicant(uuid, uuid, text, text) to service_role;

-- Permission helper callable by SQL policies & API routes
create or replace function public.pw_has_permission(p_perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.pw_active() and (
      public.pw_role() = 'super_admin'
      or exists (
        select 1 from public.pw_roles r
        where r.code = public.pw_role()
          and r.enabled = true
          and p_perm = any(r.permissions)
      )
    ),
    false
  );
$$;

revoke all on function public.pw_has_permission(text) from public, anon;
grant execute on function public.pw_has_permission(text) to authenticated;

-- Admin RPC for managing roles & permissions
create or replace function public.pw_role_action(p_action text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.pw_profiles;
  v_code text;
  v_label text;
  v_dept text;
  v_is_staff boolean;
  v_invitable boolean;
  v_enabled boolean;
  v_perms text[];
  v_existing public.pw_roles;
begin
  select * into v_actor from public.pw_profiles where id = auth.uid() and role = 'super_admin' and status = 'active';
  if v_actor.id is null then
    raise exception 'Super Admin access required to manage roles.' using errcode = '42501';
  end if;

  v_code := lower(trim(coalesce(p_data->>'code', '')));
  if v_code !~ '^[a-z][a-z0-9_]{1,40}$' then
    raise exception 'Role code must be 2-41 lowercase letters, numbers, or underscores.' using errcode = '22023';
  end if;

  if p_action = 'delete' then
    select * into v_existing from public.pw_roles where code = v_code;
    if v_existing.code is null then
      raise exception 'Role not found.' using errcode = '22023';
    end if;
    if v_existing.is_system then
      raise exception 'Built-in system roles cannot be deleted; edit their label or permissions instead.' using errcode = '42501';
    end if;
    if exists(select 1 from public.pw_profiles where role = v_code) then
      raise exception 'Reassign all accounts using this role before deleting it.' using errcode = '23503';
    end if;
    delete from public.pw_roles where code = v_code;
    insert into public.pw_audit(actor_id, actor_name, actor_role, entity_type, entity_id, action, changed_fields)
    values(v_actor.id, v_actor.name, v_actor.role, 'pw_roles', v_code, 'Role deleted', array['code:' || v_code]);
    return jsonb_build_object('ok', true, 'code', v_code);
  end if;

  if p_action <> 'upsert' then
    raise exception 'Unsupported role action.' using errcode = '22023';
  end if;

  v_label := trim(coalesce(p_data->>'label', ''));
  v_dept := trim(coalesce(nullif(p_data->>'department', ''), 'General'));
  if length(v_label) < 2 or length(v_label) > 80 then
    raise exception 'Role display label must be 2-80 characters.' using errcode = '22023';
  end if;
  if length(v_dept) < 2 or length(v_dept) > 80 then
    raise exception 'Department must be 2-80 characters.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct val), '{}') into v_perms
  from jsonb_array_elements_text(coalesce(p_data->'permissions', '[]'::jsonb)) val
  where val ~ '^[a-z0-9_.-]{2,64}$';

  v_is_staff := coalesce((p_data->>'isStaff')::boolean, true);
  v_invitable := coalesce((p_data->>'invitable')::boolean, true);
  v_enabled := coalesce((p_data->>'enabled')::boolean, true);

  -- Lockout protection for super_admin
  if v_code = 'super_admin' then
    v_enabled := true;
    v_is_staff := true;
    v_invitable := false;
    v_perms := array(select distinct unnest(v_perms || array['workspace.settings','workspace.accounts','accounts.view','accounts.manage']));
  end if;

  insert into public.pw_roles (code, label, department, is_system, is_staff, invitable, enabled, permissions, updated_by, updated_at)
  values (v_code, v_label, v_dept, false, v_is_staff, v_invitable, v_enabled, v_perms, v_actor.id, now())
  on conflict (code) do update
  set label = excluded.label,
      department = excluded.department,
      is_staff = case when public.pw_roles.code = 'super_admin' then true else excluded.is_staff end,
      invitable = case when public.pw_roles.code = 'super_admin' then false else excluded.invitable end,
      enabled = case when public.pw_roles.code = 'super_admin' then true else excluded.enabled end,
      permissions = excluded.permissions,
      updated_by = v_actor.id,
      updated_at = now();

  insert into public.pw_audit(actor_id, actor_name, actor_role, entity_type, entity_id, action, changed_fields)
  values(
    v_actor.id, v_actor.name, v_actor.role, 'pw_roles', v_code, 'Role permissions updated',
    array['label:' || v_label, 'department:' || v_dept, 'enabled:' || v_enabled::text, 'permissions:' || coalesce(array_length(v_perms, 1), 0)::text]
  );

  return jsonb_build_object('ok', true, 'code', v_code);
end $$;

revoke all on function public.pw_role_action(text, jsonb) from public, anon;
grant execute on function public.pw_role_action(text, jsonb) to authenticated;

-- ============================================================================
-- 2. Dynamic Admin Catalogs (Instruments, Ranks, Durations, Categories, Sources)
-- ============================================================================
create table if not exists public.pw_catalog_items (
  id uuid primary key default gen_random_uuid(),
  catalog text not null check (catalog in (
    'instruments', 'student_ranks', 'lesson_durations',
    'complaint_categories', 'expense_categories', 'lead_sources'
  )),
  code text not null check (length(trim(code)) between 1 and 80),
  label text not null check (length(trim(label)) between 1 and 120),
  sort_order integer not null default 100,
  enabled boolean not null default true,
  meta jsonb not null default '{}'::jsonb,
  updated_by uuid references public.pw_profiles(id),
  updated_at timestamptz not null default now(),
  unique (catalog, code)
);

alter table public.pw_catalog_items enable row level security;
revoke all on public.pw_catalog_items from anon, authenticated;
grant select on public.pw_catalog_items to authenticated;

drop policy if exists pw_catalog_items_read on public.pw_catalog_items;
create policy pw_catalog_items_read on public.pw_catalog_items
  for select to authenticated
  using (public.pw_active());

insert into public.pw_catalog_items (catalog, code, label, sort_order) values
  -- Instruments
  ('instruments', 'Piano', 'Piano', 10),
  ('instruments', 'Keyboard', 'Keyboard', 20),
  ('instruments', 'Violin', 'Violin', 30),
  ('instruments', 'Acoustic Guitar', 'Acoustic Guitar', 40),
  ('instruments', 'Electric Guitar', 'Electric Guitar', 50),
  ('instruments', 'Bass Guitar', 'Bass Guitar', 60),
  ('instruments', 'Drums', 'Drums', 70),
  ('instruments', 'Voice', 'Voice / Singing', 80),
  ('instruments', 'Saxophone', 'Saxophone', 90),
  ('instruments', 'Trumpet', 'Trumpet', 100),
  ('instruments', 'Flute', 'Flute', 110),
  ('instruments', 'Music Theory', 'Music Theory & Exam Prep', 120),
  -- Student Ranks
  ('student_ranks', 'Novice', 'Novice', 10),
  ('student_ranks', 'Beginner', 'Beginner', 20),
  ('student_ranks', 'Amateur', 'Amateur', 30),
  ('student_ranks', 'Master', 'Master', 40),
  -- Lesson Durations
  ('lesson_durations', '30 minutes', '30 minutes', 10),
  ('lesson_durations', '45 minutes', '45 minutes', 20),
  ('lesson_durations', '1 hour (Standard)', '1 hour (Standard)', 30),
  ('lesson_durations', '90 minutes', '90 minutes', 40),
  ('lesson_durations', '2 hours', '2 hours', 50),
  -- Complaint Categories
  ('complaint_categories', 'lesson_quality', 'Lesson Quality & Teaching', 10),
  ('complaint_categories', 'punctuality', 'Teacher Punctuality & Attendance', 20),
  ('complaint_categories', 'scheduling', 'Scheduling & Rescheduling', 30),
  ('complaint_categories', 'billing', 'Billing & Invoices', 40),
  ('complaint_categories', 'technical', 'Technical & Virtual Classroom', 50),
  ('complaint_categories', 'customer_service', 'Customer Service & Admin', 60),
  ('complaint_categories', 'other', 'General Concern / Other', 70),
  -- Expense Categories
  ('expense_categories', 'Equipment', 'Instruments & Equipment', 10),
  ('expense_categories', 'Software & Hosting', 'Software & Hosting', 20),
  ('expense_categories', 'Marketing', 'Marketing & Outreach', 30),
  ('expense_categories', 'Studio & Utilities', 'Studio & Utilities', 40),
  ('expense_categories', 'Admin & Legal', 'Admin & Legal', 50),
  ('expense_categories', 'Events & Recitals', 'Events & Recitals', 60),
  ('expense_categories', 'Other', 'Other', 70),
  -- Lead Sources
  ('lead_sources', 'Website', 'Website', 10),
  ('lead_sources', 'WhatsApp', 'WhatsApp', 20),
  ('lead_sources', 'Instagram', 'Instagram', 30),
  ('lead_sources', 'Facebook', 'Facebook', 40),
  ('lead_sources', 'Referral', 'Parent / Student Referral', 50),
  ('lead_sources', 'Walk-in', 'Walk-in / Event', 60),
  ('lead_sources', 'Other', 'Other', 70)
on conflict (catalog, code) do nothing;

-- Relax rigid category CHECK on pw_complaints so new admin-added categories work immediately
alter table public.pw_complaints drop constraint if exists pw_complaints_category_check;
alter table public.pw_complaints
  add constraint pw_complaints_category_check check (category ~ '^[a-z0-9_-]{2,64}$');

create or replace function public.pw_catalog_action(p_action text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.pw_profiles;
  v_catalog text;
  v_code text;
  v_label text;
  v_sort integer;
  v_enabled boolean;
begin
  select * into v_actor from public.pw_profiles where id = auth.uid() and role = 'super_admin' and status = 'active';
  if v_actor.id is null then
    raise exception 'Super Admin access required to manage academy catalogs.' using errcode = '42501';
  end if;

  v_catalog := trim(coalesce(p_data->>'catalog', ''));
  v_code := trim(coalesce(p_data->>'code', ''));
  if v_catalog not in ('instruments', 'student_ranks', 'lesson_durations', 'complaint_categories', 'expense_categories', 'lead_sources') then
    raise exception 'Invalid catalog type.' using errcode = '22023';
  end if;
  if length(v_code) < 1 or length(v_code) > 80 then
    raise exception 'Item code must be 1-80 characters.' using errcode = '22023';
  end if;
  if v_catalog = 'complaint_categories' and v_code !~ '^[a-z0-9_-]{2,64}$' then
    raise exception 'Complaint category code must use lowercase letters, numbers, underscores, or hyphens.' using errcode = '22023';
  end if;

  if p_action = 'delete' then
    delete from public.pw_catalog_items where catalog = v_catalog and code = v_code;
    insert into public.pw_audit(actor_id, actor_name, actor_role, entity_type, entity_id, action, changed_fields)
    values(v_actor.id, v_actor.name, v_actor.role, 'pw_catalog_items', v_catalog || ':' || v_code, 'Catalog item removed', array['catalog:' || v_catalog, 'code:' || v_code]);
    return jsonb_build_object('ok', true);
  end if;

  if p_action <> 'upsert' then
    raise exception 'Unsupported catalog action.' using errcode = '22023';
  end if;

  v_label := trim(coalesce(nullif(p_data->>'label', ''), v_code));
  v_sort := coalesce((p_data->>'sortOrder')::integer, 100);
  v_enabled := coalesce((p_data->>'enabled')::boolean, true);

  insert into public.pw_catalog_items (catalog, code, label, sort_order, enabled, updated_by, updated_at)
  values (v_catalog, v_code, v_label, v_sort, v_enabled, v_actor.id, now())
  on conflict (catalog, code) do update
  set label = excluded.label,
      sort_order = excluded.sort_order,
      enabled = excluded.enabled,
      updated_by = v_actor.id,
      updated_at = now();

  insert into public.pw_audit(actor_id, actor_name, actor_role, entity_type, entity_id, action, changed_fields)
  values(v_actor.id, v_actor.name, v_actor.role, 'pw_catalog_items', v_catalog || ':' || v_code, 'Catalog item updated', array['label:' || v_label, 'enabled:' || v_enabled::text]);

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.pw_catalog_action(text, jsonb) from public, anon;
grant execute on function public.pw_catalog_action(text, jsonb) to authenticated;

-- ============================================================================
-- 3. Expand pw_settings with Admin-Editable Operational Defaults & Routing Emails
-- ============================================================================
update public.pw_settings
set settings = jsonb_build_object(
  'inactivityTimeoutMinutes', 60,
  'defaultTimezone', 'Africa/Lagos',
  'emails', jsonb_build_object(
    'admissions', 'admissions@prosperworkmusic.com',
    'complaints', 'complaints@prosperworkmusic.com',
    'support', 'support@prosperworkmusic.com',
    'fees', 'fees@prosperworkmusic.com',
    'info', 'info@prosperworkmusic.com'
  )
) || settings
where singleton;

create or replace function public.pw_save_settings(p_revision integer, p_settings jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.pw_settings;
  field text;
  v numeric;
  v_timeout numeric;
  v_tz text;
  v_emails jsonb;
  v_merged jsonb;
begin
  if not coalesce(public.pw_role() = 'super_admin' and public.pw_active(), false) then
    raise exception 'Owner required' using errcode = '42501';
  end if;
  select * into current_row from public.pw_settings where singleton for update;
  if p_revision is distinct from current_row.revision then
    raise exception 'Settings changed' using errcode = '40001';
  end if;
  if jsonb_typeof(p_settings) is distinct from 'object' then
    raise exception 'Invalid settings' using errcode = '22023';
  end if;

  foreach field in array array['standardMinutes','trialMinutes','coverMinutes','rescheduleNoticeHours','adminConcurrentClasses','joinBeforeHours','joinAfterHours','adminParentQuota'] loop
    if jsonb_typeof(p_settings->field) is distinct from 'number' then
      raise exception 'Numeric rule required' using errcode = '22023';
    end if;
    v := (p_settings->>field)::numeric;
    if v <> trunc(v) or
      (field in ('standardMinutes','trialMinutes','coverMinutes') and v not between 1 and 180) or
      (field = 'rescheduleNoticeHours' and v not between 0 and 72) or
      (field = 'adminConcurrentClasses' and v not between 1 and 20) or
      (field = 'joinBeforeHours' and v not between 0 and 2) or
      (field = 'joinAfterHours' and v not between 5 and 6) or
      (field = 'adminParentQuota' and v not between 0 and 1000)
    then
      raise exception 'Rule out of range' using errcode = '22023';
    end if;
  end loop;

  if not coalesce(p_settings->>'payrollWeekAnchor' in ('not_configured','calendar_month','pay_cycle'), false)
    or not coalesce(p_settings->>'advanceEligibility' in ('not_configured','owner_selected','previous_period_verified','disabled'), false)
    or jsonb_typeof(p_settings->'vacationAutoApprove') is distinct from 'boolean'
  then
    raise exception 'Invalid payroll rules' using errcode = '22023';
  end if;

  v_timeout := coalesce((p_settings->>'inactivityTimeoutMinutes')::numeric, coalesce((current_row.settings->>'inactivityTimeoutMinutes')::numeric, 60));
  if v_timeout <> trunc(v_timeout) or v_timeout not between 15 and 480 then
    raise exception 'Inactivity timeout must be between 15 and 480 minutes.' using errcode = '22023';
  end if;

  v_tz := coalesce(nullif(trim(p_settings->>'defaultTimezone'), ''), coalesce(current_row.settings->>'defaultTimezone', 'Africa/Lagos'));
  if length(v_tz) > 100 then
    raise exception 'Invalid default timezone.' using errcode = '22023';
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

  v_merged := jsonb_build_object(
    'standardMinutes', (p_settings->>'standardMinutes')::integer,
    'trialMinutes', (p_settings->>'trialMinutes')::integer,
    'coverMinutes', (p_settings->>'coverMinutes')::integer,
    'rescheduleNoticeHours', (p_settings->>'rescheduleNoticeHours')::integer,
    'adminConcurrentClasses', (p_settings->>'adminConcurrentClasses')::integer,
    'joinBeforeHours', (p_settings->>'joinBeforeHours')::integer,
    'joinAfterHours', (p_settings->>'joinAfterHours')::integer,
    'payrollWeekAnchor', p_settings->>'payrollWeekAnchor',
    'advanceEligibility', p_settings->>'advanceEligibility',
    'vacationAutoApprove', (p_settings->>'vacationAutoApprove')::boolean,
    'adminParentQuota', (p_settings->>'adminParentQuota')::integer,
    'inactivityTimeoutMinutes', v_timeout::integer,
    'defaultTimezone', v_tz,
    'emails', v_emails
  );

  update public.pw_settings
  set settings = v_merged,
      revision = revision + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where singleton;

  update public.pw_rules set value = (v_merged->>'standardMinutes')::integer where key = 'lesson_minutes';
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

revoke all on function public.pw_save_settings(integer, jsonb) from public, anon;
grant execute on function public.pw_save_settings(integer, jsonb) to authenticated;

-- Safe non-sensitive operational config readable by any active authenticated user
create or replace function public.pw_public_academy_config()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.pw_active() then coalesce((
      select jsonb_build_object(
        'inactivityTimeoutMinutes', coalesce((settings->>'inactivityTimeoutMinutes')::integer, 60),
        'defaultTimezone', coalesce(settings->>'defaultTimezone', 'Africa/Lagos'),
        'emails', coalesce(settings->'emails', jsonb_build_object(
          'admissions', 'admissions@prosperworkmusic.com',
          'complaints', 'complaints@prosperworkmusic.com',
          'support', 'support@prosperworkmusic.com',
          'fees', 'fees@prosperworkmusic.com',
          'info', 'info@prosperworkmusic.com'
        ))
      )
      from public.pw_settings
      where singleton
    ), '{}'::jsonb)
    else '{}'::jsonb
  end;
$$;

revoke all on function public.pw_public_academy_config() from public, anon;
grant execute on function public.pw_public_academy_config() to authenticated;
