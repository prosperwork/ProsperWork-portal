-- Each table-specific expression must be evaluated only for that table's row type.
create or replace function public.pw_guard_record() returns trigger language plpgsql security definer set search_path = '' as $$
declare r text := public.pw_role(); changed text[]; permitted text[];
begin
  if TG_OP='INSERT' then
    new.created_at=now(); new.updated_at=now(); new.revision=1;
    if TG_TABLE_NAME='pw_lessons' then
      new.teacher_done_at=null; new.verified_at=null; new.verified_by=null;
      new.payload=new.payload-'verification';
    elsif TG_TABLE_NAME='pw_payments' then
      new.verified_at=null; new.verified_by=null;
    elsif TG_TABLE_NAME='pw_homework' then
      new.submitted_at=null; new.reviewed_at=null;
    end if;
  end if;
  if TG_OP='UPDATE' then
    new.updated_at=now(); new.revision=old.revision+1; new.created_at=old.created_at;
    select coalesce(array_agg(k),'{}') into changed from (select jsonb_object_keys(old.payload||new.payload) k) keys where old.payload->k is distinct from new.payload->k;
    if TG_TABLE_NAME='pw_students' then
      if r in ('parent','student') then permitted=array['consent','songsToDo'];
      elsif r in ('teacher','qc') then permitted=array['rank','songsDone','songsToDo'];
      elsif r in ('admin','head_admin','general_manager') then permitted=array['name','dob','status','monthlyLessons','timezone','adminName','teacherName','parentName','parentEmail','instrument'];
      end if;
      if r <> 'super_admin' and permitted is not null and not changed <@ permitted then raise exception 'Protected student fields' using errcode='42501'; end if;
      if r in ('parent','student','teacher','qc','admin') and (new.parent_id,new.teacher_id,new.admin_id,new.student_user_id) is distinct from (old.parent_id,old.teacher_id,old.admin_id,old.student_user_id) then raise exception 'Assignment requires management' using errcode='42501'; end if;
    elsif TG_TABLE_NAME='pw_lessons' then
      if new.student_id<>old.student_id then raise exception 'Lesson child is immutable' using errcode='42501'; end if;
      if r='teacher' and (not changed <@ array['notes','nextTopics','status'] or new.teacher_id<>old.teacher_id or new.admin_id is distinct from old.admin_id or new.payload->>'status' not in ('scheduled','teacher_done')) then raise exception 'Teacher cannot verify attendance' using errcode='42501'; end if;
      if old.verified_at is not null and new.payload->>'status' <> 'completed' then raise exception 'Verified attendance is permanent' using errcode='23514'; end if;
      new.teacher_done_at=old.teacher_done_at; new.verified_at=old.verified_at; new.verified_by=old.verified_by;
      if old.verified_at is not null then new.payload=jsonb_set(new.payload,'{verification}',old.payload->'verification'); end if;
    elsif TG_TABLE_NAME='pw_payments' then
      if new.student_id<>old.student_id or new.parent_id<>old.parent_id then raise exception 'Invoice ownership is immutable' using errcode='42501'; end if;
      if r='parent' and (not changed <@ array['status','receiptName','receiptPath'] or new.payload->>'status' <> 'receipt_uploaded') then raise exception 'Parent can only submit a receipt' using errcode='42501'; end if;
      if old.payload->>'status'='paid' and new.payload<>old.payload then raise exception 'Verified payment is permanent' using errcode='23514'; end if;
      new.verified_at=old.verified_at; new.verified_by=old.verified_by;
    elsif TG_TABLE_NAME='pw_payroll' then
      if old.payload->>'status' in ('approved','paid') and ((new.payload-'status')<>(old.payload-'status') or new.staff_id<>old.staff_id) then raise exception 'Approved payroll is locked' using errcode='23514'; end if;
      if old.payload->>'status'='paid' and new.payload<>old.payload then raise exception 'Paid payroll is permanent' using errcode='23514'; end if;
      new.prepared_by=old.prepared_by; new.approved_by=old.approved_by; new.approved_at=old.approved_at; new.paid_at=old.paid_at;
    elsif TG_TABLE_NAME='pw_homework' then
      if new.student_id<>old.student_id or new.teacher_id<>old.teacher_id then raise exception 'Homework assignment is immutable' using errcode='42501'; end if;
      if r in ('parent','student') and (not changed <@ array['status','mediaName','mediaPath','submissionNote'] or new.payload->>'status'<>'submitted') then raise exception 'Learner may only submit homework' using errcode='42501'; end if;
      new.submitted_at=old.submitted_at; new.reviewed_at=old.reviewed_at;
    end if;
  end if;
  if TG_TABLE_NAME='pw_lessons' then
    if new.payload->>'status'='teacher_done' and new.teacher_done_at is null then new.teacher_done_at=now(); end if;
    if new.payload->>'status'='completed' and new.verified_at is null then
      if not public.pw_manage_student(new.student_id) then raise exception 'Attendance requires assigned admin verification' using errcode='42501'; end if;
      new.verified_at=now(); new.verified_by=auth.uid();
      new.payload=jsonb_set(new.payload,'{verification}',jsonb_build_object('teacher',coalesce((select name from public.pw_profiles where id=new.teacher_id),''),'admin',(select name from public.pw_profiles where id=auth.uid()),'at',new.verified_at));
      insert into public.pw_attendance values(new.id,new.student_id,new.payload->>'studentName',new.teacher_id,new.admin_id,(new.payload->>'startsAt')::timestamptz,new.payload->>'kind',new.teacher_done_at,new.verified_at,auth.uid());
    elsif new.verified_at is null then new.payload=new.payload-'verification'; end if;
  elsif TG_TABLE_NAME='pw_payments' then
    if new.payload->>'status'='paid' and new.verified_at is null then
      if r not in ('super_admin','finance') then raise exception 'Finance verifies payments' using errcode='42501'; end if;
      new.verified_at=now(); new.verified_by=auth.uid();
    end if;
  elsif TG_TABLE_NAME='pw_payroll' then
    if TG_OP='INSERT' and (new.payload->>'status'<>'draft' or new.approved_by is not null or new.approved_at is not null or new.paid_at is not null or new.prepared_by<>auth.uid()) then raise exception 'Payroll must begin as the current maker draft' using errcode='42501'; end if;
    if new.payload->>'status'='approved' and new.approved_at is null then
      if r<>'super_admin' then raise exception 'Owner approval required' using errcode='42501'; end if;
      if TG_OP<>'UPDATE' or old.payload->>'status'<>'pending_approval' then raise exception 'Submit payroll before approval' using errcode='23514'; end if;
      new.approved_at=now(); new.approved_by=auth.uid();
    elsif new.payload->>'status'='paid' and new.paid_at is null then
      if TG_OP<>'UPDATE' or old.payload->>'status'<>'approved' then raise exception 'Approve payroll before payment' using errcode='23514'; end if;
      new.paid_at=now();
    end if;
    if (new.payload->>'deduction')::numeric > 0 and length(trim(coalesce(new.payload->>'deductionReason','')))<3 then raise exception 'Deduction reason required' using errcode='23514'; end if;
  elsif TG_TABLE_NAME='pw_homework' then
    if TG_OP='INSERT' and new.payload->>'status'<>'assigned' then raise exception 'Homework starts assigned' using errcode='23514'; end if;
    if new.payload->>'status'='submitted' and new.submitted_at is null then new.submitted_at=now(); end if;
    if new.payload->>'status'='reviewed' and new.reviewed_at is null then
      if r not in ('super_admin','teacher','qc') then raise exception 'Only an educator reviews homework' using errcode='42501'; end if;
      if new.submitted_at is null then raise exception 'Homework has not been submitted' using errcode='23514'; end if;
      new.reviewed_at=now();
    end if;
  end if;
  return new;
end $$;

create function public.pw_set_account(actor uuid,target uuid,new_status text,new_role text default null,new_timezone text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare owner public.pw_profiles;
begin
  select * into owner from public.pw_profiles where id=actor and role='super_admin' and status='active';
  if owner.id is null then raise exception 'Active owner required' using errcode='42501'; end if;
  if new_status not in ('pending','active','on_leave','paused','restricted','applicant') then raise exception 'Invalid account state' using errcode='23514'; end if;
  if target=actor and new_status<>'active' then raise exception 'Cannot deactivate yourself' using errcode='42501'; end if;
  if exists(select 1 from public.pw_profiles where id=target and role='super_admin') then raise exception 'Owner account needs safeguarded approval' using errcode='42501'; end if;
  if new_role='super_admin' then raise exception 'Owner promotion requires safeguarded approval' using errcode='42501'; end if;
  update public.pw_profiles set status=new_status,role=coalesce(new_role,role),timezone=coalesce(new_timezone,timezone) where id=target;
  if not found then raise exception 'Account missing' using errcode='23514'; end if;
  insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,subject_id,action,changed_fields)
  values(actor,owner.name,owner.role,'pw_profiles',target::text,target,'Account access changed',array['role','status','timezone']);
end $$;
revoke all on function public.pw_set_account(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.pw_set_account(uuid,uuid,text,text,text) to service_role;
