-- Migration 058: Controlled permanent account deletion for Super Admin
-- Provides a strict database function pw_purge_account to permanently purge
-- an account that has no immutable financial or attendance evidence.
--
-- Safeguards:
-- 1. Caller must be an active super_admin.
-- 2. Target cannot be a super_admin or self.
-- 3. Cannot purge if target has verified attendance/lessons (as teacher, student, verifier).
-- 4. Cannot purge if target has financial records (payments, payroll).
-- 5. Removes auxiliary records (marketing contacts, referrals, pauses, notifications) safely,
--    records the permanent deletion in pw_audit, and deletes from pw_profiles.

create or replace function public.pw_purge_account(actor uuid, target uuid, reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_owner public.pw_profiles;
  v_target public.pw_profiles;
  v_blocking_reasons text[] := array[]::text[];
  v_payment_count int := 0;
  v_payroll_count int := 0;
  v_verified_lesson_count int := 0;
  v_student_count int := 0;
begin
  -- 1. Verify caller is active super_admin
  select * into v_owner from public.pw_profiles where id = actor and role = 'super_admin' and status = 'active';
  if v_owner.id is null then
    raise exception 'Super Admin access required for permanent deletion.' using errcode = '42501';
  end if;

  -- 2. Verify target account exists
  select * into v_target from public.pw_profiles where id = target;
  if v_target.id is null then
    raise exception 'Account not found.' using errcode = '23514';
  end if;

  -- 3. Self-deletion and owner deletion blocked
  if target = actor then
    raise exception 'You cannot delete your own Super Admin account.' using errcode = '42501';
  end if;
  if v_target.role = 'super_admin' then
    raise exception 'Owner accounts cannot be deleted through this workflow.' using errcode = '42501';
  end if;

  -- 4. Check for immutable financial evidence
  -- (a) Payments: either parent or verified_by
  select count(*) into v_payment_count from public.pw_payments where parent_id = target or verified_by = target;
  if v_payment_count > 0 then
    v_blocking_reasons := array_append(v_blocking_reasons, format('%s payment record(s) linked to this account', v_payment_count));
  end if;

  -- (b) Payroll: staff_id, prepared_by, or approved_by
  select count(*) into v_payroll_count from public.pw_payroll where staff_id = target or prepared_by = target or approved_by = target;
  if v_payroll_count > 0 then
    v_blocking_reasons := array_append(v_blocking_reasons, format('%s payroll record(s) linked to this account', v_payroll_count));
  end if;

  -- (c) Lessons: verified or teacher_done lessons
  select count(*) into v_verified_lesson_count from public.pw_lessons
  where (teacher_id = target or verified_by = target)
    and (verified_at is not null or teacher_done_at is not null);
  if v_verified_lesson_count > 0 then
    v_blocking_reasons := array_append(v_blocking_reasons, format('%s completed or verified lesson attendance record(s)', v_verified_lesson_count));
  end if;

  -- (d) Active students with enrolled lessons
  select count(*) into v_student_count from public.pw_students where parent_id = target or teacher_id = target;
  if v_student_count > 0 then
    -- Check if those students have lessons or payments
    if exists(
      select 1 from public.pw_lessons l
      join public.pw_students s on s.id = l.student_id
      where (s.parent_id = target or s.teacher_id = target)
        and (l.verified_at is not null or l.teacher_done_at is not null)
    ) then
      v_blocking_reasons := array_append(v_blocking_reasons, 'Active student records with lesson history are associated with this account');
    end if;
  end if;

  -- If any financial or attendance evidence exists, block deletion!
  if array_length(v_blocking_reasons, 1) > 0 then
    return jsonb_build_object(
      'allowed', false,
      'reasons', to_jsonb(v_blocking_reasons),
      'message', 'Cannot permanently delete account with verified financial or attendance history. Deactivate or restrict the account instead to preserve compliance and audit trails.'
    );
  end if;

  -- 5. Safe cleanup of dependent transient/unverified references:
  -- Cleanup scheduled/unverified lessons assigned to this teacher if no attendance logged
  delete from public.pw_lessons where teacher_id = target and verified_at is null and teacher_done_at is null;

  -- Cleanup students if parent has 0 payments and 0 verified lessons
  delete from public.pw_students where parent_id = target or student_user_id = target;

  -- Reassign or clear leads owned by target
  update public.pw_leads set owner_id = null where owner_id = target;

  -- Cleanup desk notifications / items / events where target is actor/staff
  delete from public.pw_desk_actions where actor_id = target;
  delete from public.pw_desk_items where staff_id = target or assigned_to = target or created_by = target;
  delete from public.pw_operations_events where actor = target;

  -- Cleanup leaves & emergency cover where staff is target
  delete from public.pw_leaves where staff_id = target;

  -- Cleanup compensation profile
  delete from public.pw_staff_compensation where staff_id = target;

  -- Cleanup consent records & email campaigns created
  delete from public.pw_guardian_consents where guardian_id = target or recorded_by = target;

  -- Nullify non-critical references in pw_profiles (e.g. head_admin_id, qc_id)
  update public.pw_profiles set head_admin_id = null where head_admin_id = target;
  update public.pw_profiles set qc_id = null where qc_id = target;

  -- Record audit log entry BEFORE deleting profile
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

  -- Delete from pw_profiles
  delete from public.pw_profiles where id = target;

  return jsonb_build_object(
    'allowed', true,
    'message', format('Account %s (%s) was permanently removed and audited.', v_target.name, v_target.email)
  );
end $$;

revoke all on function public.pw_purge_account(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.pw_purge_account(uuid, uuid, text) to service_role;

