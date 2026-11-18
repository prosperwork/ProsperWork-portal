-- Migration 065: Complete lesson/student FK blockers & child cleanups in pw_purge_account
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

  -- Check all immutable financial, salary, attendance, contract, classroom, complaint & audit records
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

  select count(*) into v_cnt from public.pw_lessons
  where (teacher_id = target or verified_by = target)
    and (
      verified_at is not null
      or teacher_done_at is not null
      or exists(select 1 from public.pw_classrooms c where c.lesson_id = public.pw_lessons.id)
      or exists(select 1 from public.pw_leads ld where ld.trial_lesson_id = public.pw_lessons.id)
      or exists(select 1 from public.pw_reschedules rs where rs.lesson_id = public.pw_lessons.id)
      or exists(select 1 from public.pw_emergency_covers ec where ec.lesson_id = public.pw_lessons.id)
      or exists(select 1 from public.pw_leave_lesson_history lh where lh.lesson_id = public.pw_lessons.id)
    );
  if v_cnt > 0 then v_blocking_reasons := array_append(v_blocking_reasons, format('%s active, completed, or classroom-linked lesson(s)', v_cnt)); end if;

  if exists(
    select 1 from public.pw_students s
    where (s.parent_id = target or s.student_user_id = target)
      and (
        exists(select 1 from public.pw_lessons l where l.student_id = s.id)
        or exists(select 1 from public.pw_payments p where p.student_id = s.id)
        or exists(select 1 from public.pw_homework h where h.student_id = s.id)
        or exists(select 1 from public.pw_course_terms ct where ct.student_id = s.id)
        or exists(select 1 from public.pw_billing_contracts bc where bc.student_id = s.id)
        or exists(select 1 from public.pw_evaluations ev where ev.student_id = s.id)
        or exists(select 1 from public.pw_repertoire_events re where re.student_id = s.id)
        or exists(select 1 from public.pw_leads ld where ld.trial_student_id = s.id)
        or exists(select 1 from public.pw_complaints cm where cm.student_id = s.id)
        or exists(select 1 from public.pw_reschedules rs where rs.student_id = s.id)
        or exists(select 1 from public.pw_media_reviews mr where mr.student_id = s.id)
        or exists(select 1 from public.pw_recurring_series rser where rser.student_id = s.id)
        or exists(select 1 from public.pw_student_pauses sp where sp.student_id = s.id)
        or exists(select 1 from public.pw_teacher_roster_history trh where trh.student_id = s.id)
        or exists(select 1 from public.pw_emergency_covers ec where ec.student_id = s.id)
        or exists(select 1 from public.pw_leave_covers lc where lc.student_id = s.id)
      )
  ) then
    v_blocking_reasons := array_append(v_blocking_reasons, 'enrolled student record(s) with academic, billing, or schedule history');
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

  select count(*) into v_cnt from public.pw_operations_events oe where oe.actor = target;
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

  -- Atomic cleanup of transient / unlinked dependencies in FK-safe order
  delete from public.pw_desk_history
  where actor_id = target
     or item_id in (
       select id from public.pw_desk_items
       where assigned_to = target or created_by = target or staff_id = target
          or student_id in (select id from public.pw_students where parent_id = target or student_user_id = target)
     );
  delete from public.pw_desk_items
  where assigned_to = target or created_by = target or staff_id = target
     or student_id in (select id from public.pw_students where parent_id = target or student_user_id = target);

  delete from public.pw_emails where recipient_id = target;

  delete from public.pw_learning_replies
  where created_by = target
     or request_id in (
       select id from public.pw_learning_requests
       where created_by = target
          or lesson_id in (select id from public.pw_lessons where teacher_id = target and verified_at is null and teacher_done_at is null)
          or student_id in (select id from public.pw_students where parent_id = target or student_user_id = target)
     );
  delete from public.pw_learning_requests
  where created_by = target
     or lesson_id in (select id from public.pw_lessons where teacher_id = target and verified_at is null and teacher_done_at is null)
     or student_id in (select id from public.pw_students where parent_id = target or student_user_id = target);
  update public.pw_learning_requests set handled_by = null where handled_by = target;

  delete from public.pw_practice
  where created_by = target
     or student_id in (select id from public.pw_students where parent_id = target or student_user_id = target);

  delete from public.pw_lesson_boards
  where lesson_id in (select id from public.pw_lessons where teacher_id = target and verified_at is null and teacher_done_at is null);
  delete from public.pw_paused_lessons
  where lesson_id in (select id from public.pw_lessons where teacher_id = target and verified_at is null and teacher_done_at is null);
  delete from public.pw_lessons where teacher_id = target and verified_at is null and teacher_done_at is null;
  update public.pw_lessons set admin_id = null where admin_id = target;

  update public.pw_students set teacher_id = null where teacher_id = target;
  update public.pw_students set admin_id = null where admin_id = target;
  delete from public.pw_song_activity
  where student_id in (select id from public.pw_students where parent_id = target or student_user_id = target);
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
