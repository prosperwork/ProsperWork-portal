-- Migration 063: Security, Data Integrity & Operational Reliability Hardening
-- 1. Unblock payroll on restricted/paused staff AND wire recurring salary_end_date proration + directory
-- 2. Implement pw_set_salary_end RPC
-- 3. Lock down pw_complaints and pw_complaint_messages with strict guard triggers (fixing DELETE return OLD & parent identity spoofing)
-- 4. Allow complaint email templates in pw_email_current so academy-cron does not cancel queued complaint emails
-- 5. Fix pw_purge_account (real column names, complete FK blockers/cleanups matching live schema)
-- 6. Dedicated egress columns on pw_classrooms + pw_classroom_egress_info / pw_set_lesson_egress RPCs (no pw_lessons.payload conflict)
-- 7. Add scoped pw_provision_applicant RPC for HR / General Manager hiring invites
-- 8. Harden pw_financial_summary (Africa/Lagos dates, 2dp rounding, non-negative net) and pw_payments discount check
-- 9. Fix live Supabase security advisors: mutable search_path on 2 trigger functions & revoke anon/public EXECUTE on non-public SECURITY DEFINER functions

-- ============================================================================
-- 1. Recurring salary_end_date + unblock restricted/paused payroll generation
-- ============================================================================
alter table public.pw_profiles
  add column if not exists salary_end_date date;

do $migration$
declare
  definition text;
  old_block text;
  new_block text;
  old_admin text;
  new_admin text;
begin
  select pg_get_functiondef('public.pw_calculate_salary(date,uuid)'::regprocedure) into definition;

  old_block := $old$    if staff.status in('restricted','paused') then
     if amount>0 then
      issues:=issues||jsonb_build_array(jsonb_build_object('staffId',staff.id,'staffName',staff.name,
       'message','Base salary withheld: staff status is '||staff.status||'. Verified lesson earnings are still included.'));
     end if;
     amount:=0;
    end if;$old$;

  new_block := $new$    if staff.status in('restricted','paused') then
     amount:=0;
    elsif staff.salary_end_date is not null then
     if staff.salary_end_date < period_from::date then
      amount:=0;
     elsif staff.salary_end_date < p_date then
      amount:=round(amount * ((staff.salary_end_date - period_from::date + 1)::numeric / greatest(1, (p_date - period_from::date + 1))::numeric), 2);
     end if;
    end if;$new$;

  if position(old_block in definition) = 0 then
    raise exception 'Unexpected pw_calculate_salary restricted/paused block in migration 063';
  end if;

  definition := replace(definition, old_block, new_block);
  definition := replace(
    definition,
    $old2$'reason','Agreed monthly staff salary'$old2$,
    $new2$'reason',case
      when staff.status in('restricted','paused') and coalesce((current_rate.terms->>'baseSalary')::numeric,0)>0 then 'Base salary withheld: staff status is '||staff.status||'. Verified lesson earnings are still included.'
      when staff.salary_end_date is not null and staff.salary_end_date < period_from::date then 'Base salary ended on '||staff.salary_end_date::text
      when staff.salary_end_date is not null and staff.salary_end_date < p_date then 'Prorated monthly salary through '||staff.salary_end_date::text
      else 'Agreed monthly staff salary' end$new2$
  );

  old_admin := $old3$if staff.role='admin' and staff.status not in('restricted','paused') then$old3$;
  new_admin := $new3$if staff.role='admin' and staff.status not in('restricted','paused') and (staff.salary_end_date is null or staff.salary_end_date >= period_from::date) then$new3$;
  if position(old_admin in definition) > 0 then
    definition := replace(definition, old_admin, new_admin);
  end if;

  execute definition;
end $migration$;

create or replace function public.pw_payroll_directory()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare r text := public.pw_role();
begin
  if r not in ('super_admin', 'finance', 'hr', 'qc') or r is null then
    return jsonb_build_object('staff', '[]'::jsonb, 'billingStudents', '[]'::jsonb, 'courses', '[]'::jsonb, 'bankConfiguredIds', '[]'::jsonb, 'salaryEndDates', '{}'::jsonb);
  end if;
  return jsonb_build_object(
    'staff', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'role', role, 'status', status, 'salaryEndDate', salary_end_date) order by name)
      from public.pw_profiles
      where role not in ('parent', 'student', 'general_manager')
        and (r <> 'qc' or (role = 'teacher' and qc_id = auth.uid()))
    ), '[]'::jsonb),
    'billingStudents', case when r in ('super_admin', 'finance') then coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', payload->>'name') order by payload->>'name')
      from public.pw_students
    ), '[]'::jsonb) else '[]'::jsonb end,
    'courses', case when r in ('super_admin', 'finance') then coalesce((
      select jsonb_agg(jsonb_build_object('student_id', t.student_id, 'student_name', s.payload->>'name', 'start_date', t.start_date, 'effective_from', t.effective_from, 'weekly_frequency', t.weekly_frequency))
      from public.pw_course_terms t join public.pw_students s on s.id = t.student_id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'bankConfiguredIds', case when r in ('super_admin', 'finance') then coalesce((
      select jsonb_agg(staff_id) from public.pw_salary_banks
    ), '[]'::jsonb) else '[]'::jsonb end,
    'salaryEndDates', case when r in ('super_admin', 'finance') then coalesce((
      select jsonb_object_agg(id::text, salary_end_date)
      from public.pw_profiles
      where salary_end_date is not null
    ), '{}'::jsonb) else '{}'::jsonb end
  );
end $$;

revoke all on function public.pw_payroll_directory() from public, anon;
grant execute on function public.pw_payroll_directory() to authenticated;

-- ============================================================================
-- 2. Recurring salary end date RPC (pw_set_salary_end)
-- ============================================================================
create or replace function public.pw_set_salary_end(p_staff uuid, p_end date, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.pw_profiles;
  v_target public.pw_profiles;
  v_unpaid_count int := 0;
begin
  select * into v_actor from public.pw_profiles
  where id = auth.uid() and status = 'active' and role in ('super_admin', 'finance');
  if v_actor.id is null then
    raise exception 'Finance or owner access required.' using errcode = '42501';
  end if;

  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'A written reason of at least 5 characters is required.' using errcode = '22023';
  end if;

  select * into v_target from public.pw_profiles where id = p_staff;
  if v_target.id is null or v_target.role in ('super_admin', 'parent', 'student') then
    raise exception 'Select a valid non-owner staff account.' using errcode = '22023';
  end if;

  update public.pw_profiles
  set salary_end_date = p_end
  where id = p_staff;

  if p_end is not null then
    select count(*) into v_unpaid_count
    from public.pw_salary_statements st
    join public.pw_salary_batches b on b.id = st.batch_id
    where st.staff_id = p_staff
      and st.paid_at is null
      and b.pay_date >= p_end;
  end if;

  insert into public.pw_audit(
    actor_id, actor_name, actor_role,
    entity_type, entity_id, subject_id,
    action, changed_fields
  ) values (
    v_actor.id, v_actor.name, v_actor.role,
    'pw_profiles', p_staff::text, p_staff,
    'salary_end_date_updated',
    array['salary_end_date:' || coalesce(p_end::text, 'cleared'), 'reason:' || left(trim(p_reason), 500)]
  );

  return jsonb_build_object('ok', true, 'salaryReviewNeeded', v_unpaid_count);
end $$;

revoke all on function public.pw_set_salary_end(uuid, date, text) from public, anon;
grant execute on function public.pw_set_salary_end(uuid, date, text) to authenticated;

-- ============================================================================
-- 3. Strict guard triggers on pw_complaints & pw_complaint_messages
-- ============================================================================
create or replace function public.pw_guard_complaints()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_profile public.pw_profiles;
  v_student_name text;
begin
  if auth.uid() is null then
    return new;
  end if;

  v_role := public.pw_role();
  if not public.pw_active() or not public.pw_portal_allowed() or v_role is null then
    raise exception 'Active portal session required.' using errcode = '42501';
  end if;

  select * into v_profile from public.pw_profiles where id = auth.uid();

  if tg_op = 'INSERT' then
    if v_role = 'parent' then
      if new.parent_id <> auth.uid() then
        raise exception 'Parents can only create complaints for their own account.' using errcode = '42501';
      end if;
      if new.student_id is not null and not public.pw_can_student(new.student_id) then
        raise exception 'Selected student is not linked to your account.' using errcode = '42501';
      end if;
      -- Enforce server-verified parent & student identity (prevent spoofing on direct PostgREST INSERT)
      new.parent_name := coalesce(nullif(trim(v_profile.name), ''), 'Guardian');
      new.parent_email := coalesce(nullif(trim(v_profile.email), ''), new.parent_email);
      if new.student_id is not null then
        select coalesce(payload->>'name', payload->>'childName') into v_student_name
        from public.pw_students where id = new.student_id;
        new.student_name := coalesce(v_student_name, new.student_name);
      end if;
    elsif v_role not in ('super_admin', 'general_manager', 'head_admin', 'admin') then
      raise exception 'Unauthorized complaint creation.' using errcode = '42501';
    end if;

    new.status := 'open';
    new.resolution_notes := null;
    new.resolved_by := null;
    new.resolved_by_name := null;
    new.resolved_at := null;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if v_role not in ('super_admin', 'general_manager', 'head_admin', 'admin', 'qc') then
      raise exception 'Administrative staff access required to update complaints.' using errcode = '42501';
    end if;

    if new.id <> old.id
      or new.ticket_number <> old.ticket_number
      or new.parent_id <> old.parent_id
      or new.parent_name <> old.parent_name
      or new.parent_email <> old.parent_email
      or new.student_id is distinct from old.student_id
      or new.student_name is distinct from old.student_name
      or new.category <> old.category
      or new.subject <> old.subject
      or new.message <> old.message
      or new.created_at <> old.created_at
    then
      raise exception 'Original complaint record fields are immutable.' using errcode = '42501';
    end if;

    if new.status = 'resolved' then
      new.resolved_by := auth.uid();
      new.resolved_by_name := coalesce(v_profile.name, 'Academy Administration');
      new.resolved_at := coalesce(old.resolved_at, now());
    else
      new.resolved_by := null;
      new.resolved_by_name := null;
      new.resolved_at := null;
    end if;
    new.updated_at := now();
    return new;
  end if;

  return new;
end $$;

drop trigger if exists pw_guard_complaints_trigger on public.pw_complaints;
create trigger pw_guard_complaints_trigger
  before insert or update on public.pw_complaints
  for each row execute function public.pw_guard_complaints();

create or replace function public.pw_guard_complaint_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_profile public.pw_profiles;
  v_complaint public.pw_complaints;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' or tg_op = 'DELETE' then
    raise exception 'Complaint conversation messages are immutable.' using errcode = '42501';
  end if;

  v_role := public.pw_role();
  if not public.pw_active() or not public.pw_portal_allowed() or v_role is null then
    raise exception 'Active portal session required.' using errcode = '42501';
  end if;

  select * into v_profile from public.pw_profiles where id = auth.uid();
  select * into v_complaint from public.pw_complaints where id = new.complaint_id;
  if v_complaint.id is null then
    raise exception 'Complaint ticket not found.' using errcode = '23503';
  end if;

  if v_role = 'parent' then
    if v_complaint.parent_id <> auth.uid() then
      raise exception 'You can only reply to your own inquiries.' using errcode = '42501';
    end if;
    if v_complaint.status = 'resolved' then
      raise exception 'Resolved complaints cannot receive further replies.' using errcode = '42501';
    end if;
  elsif v_role not in ('super_admin', 'general_manager', 'head_admin', 'admin', 'qc') then
    raise exception 'Unauthorized complaint reply.' using errcode = '42501';
  end if;

  new.sender_id := auth.uid();
  new.sender_role := v_role;
  new.sender_name := coalesce(nullif(trim(v_profile.name), ''), case when v_role = 'parent' then 'Parent' else 'Academy Administration' end);
  return new;
end $$;

drop trigger if exists pw_guard_complaint_messages_trigger on public.pw_complaint_messages;
create trigger pw_guard_complaint_messages_trigger
  before insert or update or delete on public.pw_complaint_messages
  for each row execute function public.pw_guard_complaint_messages();

-- ============================================================================
-- 4. Allow complaint templates in pw_email_current so cron does not cancel them
-- ============================================================================
create or replace function public.pw_email_current(p_job uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare e public.pw_emails;
begin
  select * into e from public.pw_emails where id = p_job;
  if e.id is null then return false; end if;

  if e.template in (
    'parent_complaint_acknowledgement',
    'parent_complaint_alert',
    'complaint_reply_alert',
    'parent_complaint_resolved'
  ) then
    return true;
  end if;

  if e.template <> 'academy_notice' then
    return public.pw_email_current_base(p_job);
  end if;

  if not exists(
    select 1 from public.pw_profiles p
    join auth.users u on u.id = p.id
    where p.id = e.recipient_id
      and (p.status = 'active' or (p.status = 'on_leave' and e.source_table = 'pw_leaves'))
      and u.email_confirmed_at is not null
  ) then
    return false;
  end if;

  return case e.source_table
    when 'pw_desk_items' then exists(
      select 1 from public.pw_desk_items d
      where d.id::text = e.source_id and d.status in ('open', 'in_progress') and e.recipient_id = d.assigned_to
    )
    when 'pw_announcements' then exists(
      select 1 from public.pw_announcements a
      join public.pw_profiles p on p.id = e.recipient_id
      where a.id::text = e.source_id and a.archived_at is null and a.expires_at > now() and a.roles ? p.role
    )
    when 'pw_emergency_covers' then exists(
      select 1 from public.pw_emergency_covers c
      where c.id::text = e.source_id and c.superseded_at is null
        and e.recipient_id in (c.teacher_id, c.admin_id) and c.ends_at > now()
    )
    when 'pw_leaves' then exists(
      select 1 from public.pw_leaves l
      join public.pw_profiles p on p.id = e.recipient_id
      where l.id::text = e.source_id and (
        l.staff_id = p.id or p.role in ('super_admin', 'hr')
        or (p.role = 'head_admin' and exists(select 1 from public.pw_profiles where id = l.staff_id and head_admin_id = p.id))
        or exists(select 1 from public.pw_leave_covers where leave_id = l.id and cover_id = p.id)
      )
    )
    else false
  end;
end $$;

revoke all on function public.pw_email_current(uuid) from public, anon, authenticated;
grant execute on function public.pw_email_current(uuid) to service_role;

-- ============================================================================
-- 5. Bulletproof pw_purge_account (verified against all 88 live FKs)
-- ============================================================================
create or replace function public.pw_purge_account(actor uuid, target uuid, reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner public.pw_profiles;
  v_target public.pw_profiles;
  v_blocking_reasons text[] := array[]::text[];
  v_cnt int := 0;
begin
  select * into v_owner from public.pw_profiles where id = actor and role = 'super_admin' and status = 'active';
  if v_owner.id is null then
    raise exception 'Super Admin access required for permanent deletion.' using errcode = '42501';
  end if;

  select * into v_target from public.pw_profiles where id = target;
  if v_target.id is null then
    raise exception 'Account not found.' using errcode = '23514';
  end if;

  if target = actor then
    raise exception 'You cannot delete your own Super Admin account.' using errcode = '42501';
  end if;
  if v_target.role = 'super_admin' then
    raise exception 'Owner accounts cannot be deleted through this workflow.' using errcode = '42501';
  end if;

  -- Check all immutable financial, salary, attendance, contract, complaint & audit records
  select count(*) into v_cnt from public.pw_payments where parent_id = target or verified_by = target;
  if v_cnt > 0 then v_blocking_reasons := array_append(v_blocking_reasons, format('%s payment record(s)', v_cnt)); end if;

  select count(*) into v_cnt from public.pw_payroll where staff_id = target or prepared_by = target or approved_by = target;
  if v_cnt > 0 then v_blocking_reasons := array_append(v_blocking_reasons, format('%s legacy payroll record(s)', v_cnt)); end if;

  select count(*) into v_cnt from public.pw_salary_statements where staff_id = target;
  if v_cnt > 0 then v_blocking_reasons := array_append(v_blocking_reasons, format('%s salary statement(s)', v_cnt)); end if;

  select count(*) into v_cnt from public.pw_salary_rates where staff_id = target or proposed_by = target or decided_by = target;
  if v_cnt > 0 then v_blocking_reasons := array_append(v_blocking_reasons, format('%s salary rate record(s)', v_cnt)); end if;

  select count(*) into v_cnt from public.pw_salary_parent_snapshots where staff_id = target;
  if v_cnt > 0 then v_blocking_reasons := array_append(v_blocking_reasons, format('%s salary parent snapshot(s)', v_cnt)); end if;

  select count(*) into v_cnt from public.pw_attendance where teacher_id = target or verified_by = target;
  if v_cnt > 0 then v_blocking_reasons := array_append(v_blocking_reasons, format('%s verified attendance record(s)', v_cnt)); end if;

  select count(*) into v_cnt from public.pw_lessons where (teacher_id = target or verified_by = target) and (verified_at is not null or teacher_done_at is not null);
  if v_cnt > 0 then v_blocking_reasons := array_append(v_blocking_reasons, format('%s completed/verified lesson(s)', v_cnt)); end if;

  if exists(
    select 1 from public.pw_lessons l
    join public.pw_students s on s.id = l.student_id
    where (s.parent_id = target or s.teacher_id = target or s.student_user_id = target)
      and (l.verified_at is not null or l.teacher_done_at is not null)
  ) then
    v_blocking_reasons := array_append(v_blocking_reasons, 'student record(s) with verified lesson history');
  end if;

  select count(*) into v_cnt
  from public.pw_billing_contracts bc
  left join public.pw_students s on s.id = bc.student_id
  where s.parent_id = target or bc.created_by = target;
  if v_cnt > 0 then v_blocking_reasons := array_append(v_blocking_reasons, format('%s billing contract(s)', v_cnt)); end if;

  select count(*) into v_cnt from public.pw_complaints where parent_id = target or resolved_by = target;
  if v_cnt > 0 then v_blocking_reasons := array_append(v_blocking_reasons, format('%s complaint ticket(s)', v_cnt)); end if;

  select count(*) into v_cnt from public.pw_complaint_messages where sender_id = target;
  if v_cnt > 0 then v_blocking_reasons := array_append(v_blocking_reasons, format('%s complaint message(s)', v_cnt)); end if;

  select count(*) into v_cnt from public.pw_operations_events where actor = target;
  if v_cnt > 0 then v_blocking_reasons := array_append(v_blocking_reasons, format('%s immutable operational audit event(s)', v_cnt)); end if;

  select count(*) into v_cnt from public.pw_files where uploader_id = target;
  if v_cnt > 0 then v_blocking_reasons := array_append(v_blocking_reasons, format('%s uploaded private file(s)', v_cnt)); end if;

  if exists(select 1 from public.pw_announcements where created_by = target)
    or exists(select 1 from public.pw_email_campaigns where created_by = target)
    or exists(select 1 from public.pw_emergency_covers where admin_id = target or created_by = target or teacher_id = target or original_admin = target or original_teacher = target)
    or exists(select 1 from public.pw_evaluations where educator_id = target)
    or exists(select 1 from public.pw_fx_rates where approved_by = target)
    or exists(select 1 from public.pw_hiring_cases where created_by = target or reviewer_id = target or accepted_by = target or activated_by = target or finalized_by = target)
    or exists(select 1 from public.pw_hiring_events where actor_id = target)
    or exists(select 1 from public.pw_hiring_reviews where reviewer_id = target)
    or exists(select 1 from public.pw_homework where teacher_id = target)
    or exists(select 1 from public.pw_homework_reviews where reviewer_id = target)
    or exists(select 1 from public.pw_leave_covers where cover_id = target or created_by = target or original_id = target)
    or exists(select 1 from public.pw_leave_lesson_history where original_id = target)
    or exists(select 1 from public.pw_media_reviews where submitted_by = target or reviewed_by = target)
    or exists(select 1 from public.pw_policy_versions where created_by = target)
    or exists(select 1 from public.pw_quality_observations where reviewer_id = target or staff_id = target)
    or exists(select 1 from public.pw_referral_credits where parent_id = target)
    or exists(select 1 from public.pw_referral_requests where parent_id = target)
    or exists(select 1 from public.pw_repertoire_events where educator_id = target)
    or exists(select 1 from public.pw_reschedules where requested_by = target)
    or exists(select 1 from public.pw_reschedule_counters where teacher_id = target or accepted_by = target)
    or exists(select 1 from public.pw_classroom_presence where user_id = target)
  then
    v_blocking_reasons := array_append(v_blocking_reasons, 'immutable academic, hiring, leave, policy, or quality records');
  end if;

  if array_length(v_blocking_reasons, 1) > 0 then
    return jsonb_build_object(
      'allowed', false,
      'reasons', to_jsonb(v_blocking_reasons),
      'message', 'Cannot permanently delete account linked to protected financial, attendance, or audit records. Set status to Restricted or Paused instead.'
    );
  end if;

  -- Atomic cleanup of transient / non-financial dependencies in FK-safe order
  delete from public.pw_desk_history
  where actor_id = target
     or item_id in (select id from public.pw_desk_items where assigned_to = target or created_by = target or staff_id = target);
  delete from public.pw_desk_items where assigned_to = target or created_by = target or staff_id = target;
  delete from public.pw_emails where recipient_id = target;
  delete from public.pw_learning_replies where created_by = target;
  delete from public.pw_learning_requests where created_by = target;
  update public.pw_learning_requests set handled_by = null where handled_by = target;
  delete from public.pw_practice where created_by = target;
  delete from public.pw_lessons where teacher_id = target and verified_at is null and teacher_done_at is null;
  update public.pw_lessons set admin_id = null where admin_id = target;
  update public.pw_students set teacher_id = null where teacher_id = target;
  update public.pw_students set admin_id = null where admin_id = target;
  delete from public.pw_students where parent_id = target or student_user_id = target;
  update public.pw_leads set owner_id = null where owner_id = target;
  update public.pw_leads set referral_parent_id = null where referral_parent_id = target;
  delete from public.pw_leaves where staff_id = target or submitted_by = target;
  update public.pw_leaves set head_by = null where head_by = target;
  update public.pw_leaves set hr_by = null where hr_by = target;
  delete from public.pw_staff_compensation where staff_id = target;
  delete from public.pw_availability where staff_id = target;
  delete from public.pw_salary_banks where staff_id = target;
  delete from public.pw_policy_acceptances where parent_id = target;
  update public.pw_policy_versions set audience_parent_id = null where audience_parent_id = target;
  delete from public.pw_family_pins where parent_id = target;
  delete from public.pw_kid_blocks where parent_id = target or child_user = target;
  delete from public.pw_marketing_contacts where guardian_id = target;
  update public.pw_marketing_contacts set recorded_by = null where recorded_by = target;
  update public.pw_recurring_series set created_by = null where created_by = target;
  update public.pw_student_pauses set created_by = null where created_by = target;
  update public.pw_settings set updated_by = null where updated_by = target;
  update public.pw_hiring_cases set staff_id = null where staff_id = target;
  update public.pw_teacher_roster_history set teacher_id = null where teacher_id = target;

  update public.pw_profiles set head_admin_id = null where head_admin_id = target;
  update public.pw_profiles set qc_id = null where qc_id = target;

  insert into public.pw_audit(
    actor_id, actor_name, actor_role,
    entity_type, entity_id, subject_id,
    action, changed_fields
  ) values (
    actor, v_owner.name, v_owner.role,
    'pw_profiles', target::text, target,
    'account_permanent_deleted',
    array[
      'deleted_name:' || v_target.name,
      'deleted_email:' || v_target.email,
      'deleted_role:' || v_target.role,
      'reason:' || coalesce(nullif(trim(reason), ''), 'Not provided')
    ]
  );

  delete from public.pw_profiles where id = target;

  return jsonb_build_object(
    'allowed', true,
    'message', format('Account %s (%s) was permanently removed and audited.', v_target.name, v_target.email)
  );
end $$;

revoke all on function public.pw_purge_account(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.pw_purge_account(uuid, uuid, text) to service_role;

-- ============================================================================
-- 6. Dedicated LiveKit Egress columns on pw_classrooms + authorized RPCs
--    (avoids pw_lessons.payload trigger & Zod strict-schema conflicts)
-- ============================================================================
alter table public.pw_classrooms
  add column if not exists active_egress_id text,
  add column if not exists egress_started_at timestamptz;

create or replace function public.pw_classroom_egress_info(p_lesson text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.pw_classrooms;
begin
  if not public.pw_active() or public.pw_role() not in ('super_admin', 'admin', 'head_admin', 'qc', 'teacher') then
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

revoke all on function public.pw_classroom_egress_info(text) from public, anon;
grant execute on function public.pw_classroom_egress_info(text) to authenticated;

create or replace function public.pw_set_lesson_egress(p_lesson text, p_egress_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.pw_active() or public.pw_role() not in ('super_admin', 'admin', 'head_admin', 'qc', 'teacher') then
    raise exception 'Unauthorized recording metadata update.' using errcode = '42501';
  end if;

  perform public.pw_classroom_access(p_lesson, false);

  update public.pw_classrooms
  set active_egress_id = p_egress_id,
      egress_started_at = case when p_egress_id is null then null else now() end
  where lesson_id = p_lesson;
end $$;

revoke all on function public.pw_set_lesson_egress(text, text) from public, anon;
grant execute on function public.pw_set_lesson_egress(text, text) to authenticated;

-- ============================================================================
-- 7. Scoped applicant provisioning RPC for HR / General Manager hiring invites
-- ============================================================================
create or replace function public.pw_provision_applicant(actor uuid, target uuid, new_role text, new_timezone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor public.pw_profiles;
begin
  select * into v_actor from public.pw_profiles
  where id = actor and status = 'active' and role in ('super_admin', 'general_manager', 'hr');
  if v_actor.id is null then
    raise exception 'Owner, General Manager, or HR access required.' using errcode = '42501';
  end if;

  if new_role in ('super_admin', 'general_manager') then
    raise exception 'Privileged executive roles require owner provisioning.' using errcode = '42501';
  end if;

  if exists(select 1 from public.pw_profiles where id = target and role = 'super_admin') then
    raise exception 'Owner accounts cannot be modified here.' using errcode = '42501';
  end if;

  update public.pw_profiles
  set status = 'applicant',
      role = new_role,
      timezone = coalesce(nullif(trim(new_timezone), ''), timezone)
  where id = target;

  if not found then
    raise exception 'Applicant profile missing.' using errcode = '23514';
  end if;

  insert into public.pw_audit(actor_id, actor_name, actor_role, entity_type, entity_id, subject_id, action, changed_fields)
  values(actor, v_actor.name, v_actor.role, 'pw_profiles', target::text, target, 'Applicant account provisioned', array['role:' || new_role, 'status:applicant']);
end $$;

revoke all on function public.pw_provision_applicant(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.pw_provision_applicant(uuid, uuid, text, text) to service_role;

-- ============================================================================
-- 8. Harden pw_financial_summary (Africa/Lagos dates, 2dp rounding, non-negative net)
-- ============================================================================
create or replace function public.pw_financial_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
  converted jsonb;
  rules public.pw_finance_rules;
  profit_allowed boolean;
begin
  if not coalesce(public.pw_active() and public.pw_role() in ('super_admin', 'finance'), false) then
    return '[]';
  end if;

  select * into rules from public.pw_finance_rules;
  profit_allowed := public.pw_role() = 'super_admin' or rules.finance_profit;

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
      (payload->>'date')::date
    from public.pw_expenses
    union all
    select
      currency,
      net,
      'payroll',
      (paid_at at time zone 'Africa/Lagos')::date
    from public.pw_salary_statements
    where paid_at is not null
  ),
  totals as (
    select
      currency,
      round(coalesce(sum(amount) filter (where kind = 'income'), 0), 2) as income,
      round(coalesce(sum(amount) filter (where kind = 'expenses'), 0), 2) as expenses,
      round(coalesce(sum(amount) filter (where kind = 'payroll'), 0), 2) as payroll
    from entries
    group by currency
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object('currency', currency, 'income', income, 'expenses', expenses, 'payroll', payroll) ||
      case
        when profit_allowed then jsonb_build_object(
          'estimatedTax', round(greatest(0, income - expenses - payroll) * rules.tax_percent / 100, 2),
          'profit', round(income - expenses - payroll - round(greatest(0, income - expenses - payroll) * rules.tax_percent / 100, 2), 2)
        )
        else '{}'::jsonb
      end
    ),
    '[]'
  ) into result
  from totals;

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
      (payload->>'date')::date
    from public.pw_expenses
    union all
    select
      currency,
      net,
      'payroll',
      (paid_at at time zone 'Africa/Lagos')::date
    from public.pw_salary_statements
    where paid_at is not null
  ),
  converted_entries as (
    select
      e.*,
      case
        when currency = 'NGN' then 1
        else (select rate from public.pw_fx_rates where currency = e.currency and date <= e.date order by date desc limit 1)
      end as rate
    from entries e
  ),
  totals as (
    select
      count(*) filter (where rate is null) as missing,
      round(coalesce(sum(amount * rate) filter (where kind = 'income'), 0), 2) as income,
      round(coalesce(sum(amount * rate) filter (where kind = 'expenses'), 0), 2) as expenses,
      round(coalesce(sum(amount * rate) filter (where kind = 'payroll'), 0), 2) as payroll
    from converted_entries
  )
  select
    jsonb_build_object(
      'currency', 'NGN (dated conversion)',
      'missingRates', missing,
      'income', case when missing = 0 then income else null end,
      'expenses', case when missing = 0 then expenses else null end,
      'payroll', case when missing = 0 then payroll else null end
    ) ||
    case
      when profit_allowed then jsonb_build_object(
        'estimatedTax', case when missing = 0 then round(greatest(0, income - expenses - payroll) * rules.tax_percent / 100, 2) else null end,
        'profit', case when missing = 0 then round(income - expenses - payroll - round(greatest(0, income - expenses - payroll) * rules.tax_percent / 100, 2), 2) else null end
      )
      else '{}'::jsonb
    end
  into converted
  from totals;

  return result || jsonb_build_array(converted);
end $$;

revoke all on function public.pw_financial_summary() from public, anon;
grant execute on function public.pw_financial_summary() to authenticated;

alter table public.pw_payments
  drop constraint if exists pw_payments_discount_lte_amount;
alter table public.pw_payments
  add constraint pw_payments_discount_lte_amount
  check (coalesce((payload->>'referralDiscount')::numeric, 0) <= (payload->>'amount')::numeric) not valid;

-- ============================================================================
-- 9. Resolve live Supabase security advisor warnings:
--    - Pin search_path on pw_protect_lesson_event & pw_completion_time_guard
--    - Revoke public/anon execute on trigger functions & internal RLS helpers
--      (keeping only pw_marketing_unsubscribe(uuid) callable by anon)
-- ============================================================================
alter function public.pw_protect_lesson_event() set search_path = '';
alter function public.pw_completion_time_guard() set search_path = '';

do $harden$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as sig, p.proname, pg_get_function_result(p.oid) as ret_type
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'pw_%'
      and p.proname <> 'pw_marketing_unsubscribe'
  loop
    if fn.ret_type = 'trigger' then
      execute 'revoke all on function ' || fn.sig || ' from public, anon, authenticated';
    else
      execute 'revoke all on function ' || fn.sig || ' from public, anon';
    end if;
  end loop;
end $harden$;

grant execute on function public.pw_desk_visible(public.pw_desk_items) to authenticated;
grant execute on function public.pw_file_allowed(text, text, boolean) to authenticated;
grant execute on function public.pw_portal_allowed() to authenticated;
grant execute on function public.pw_session_allowed() to authenticated;
grant execute on function public.pw_storage_allowed(text, boolean) to authenticated;
grant execute on function public.pw_storage_cleanup_allowed(text) to authenticated;
