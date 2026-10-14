-- ProsperWork's private academy core. No demo data is imported.
create table public.pw_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  name text not null,
  username text not null,
  role text not null default 'parent' check (role in ('super_admin','general_manager','head_admin','admin','hr','qc','teacher','parent','student','finance','sales_marketing','social_media')),
  status text not null default 'pending' check (status in ('pending','active','on_leave','paused','restricted','applicant')),
  timezone text not null default 'Africa/Lagos',
  department text not null default '',
  head_admin_id uuid references public.pw_profiles(id),
  qc_id uuid references public.pw_profiles(id),
  avatar_path text,
  quota integer not null default 0 check (quota >= 0),
  created_at timestamptz not null default now()
);
create unique index pw_profile_username on public.pw_profiles(lower(username));
create unique index pw_profile_email on public.pw_profiles(lower(email)) where email <> '';

create function public.pw_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pw_profiles(id,email,name,username)
  values(new.id,coalesce(new.email,''),left(coalesce(nullif(new.raw_user_meta_data->>'name',''),'New account'),120),'PW-'||replace(new.id::text,'-',''));
  return new;
end $$;
create trigger pw_auth_profile after insert on auth.users for each row execute function public.pw_new_user();
insert into public.pw_profiles(id,email,name,username)
select id,coalesce(email,''),left(coalesce(nullif(raw_user_meta_data->>'name',''),'Existing account'),120),'PW-'||replace(id::text,'-','') from auth.users;

create table public.pw_students (
  id text primary key,
  parent_id uuid not null references public.pw_profiles(id),
  teacher_id uuid references public.pw_profiles(id),
  admin_id uuid references public.pw_profiles(id),
  student_user_id uuid unique references public.pw_profiles(id),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'id' = id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1
);
create index pw_students_parent on public.pw_students(parent_id);
create index pw_students_teacher on public.pw_students(teacher_id);
create index pw_students_admin on public.pw_students(admin_id);
create table public.pw_lessons (
  id text primary key,
  student_id text not null references public.pw_students(id),
  teacher_id uuid not null references public.pw_profiles(id),
  admin_id uuid references public.pw_profiles(id),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'id' = id),
  teacher_done_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references public.pw_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1
);
create index pw_lessons_student on public.pw_lessons(student_id);
create table public.pw_leads (
  id text primary key,
  owner_id uuid references public.pw_profiles(id),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'id' = id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1
);
create table public.pw_payments (
  id text primary key,
  parent_id uuid not null references public.pw_profiles(id),
  student_id text not null references public.pw_students(id),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'id' = id),
  verified_at timestamptz,
  verified_by uuid references public.pw_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1
);
create table public.pw_staff_compensation (
  staff_id uuid primary key references public.pw_profiles(id),
  monthly_student_rate numeric(12,2) not null default 0 check (monthly_student_rate >= 0),
  trial_rate numeric(12,2) not null default 0 check (trial_rate >= 0),
  cover_rate numeric(12,2) not null default 0 check (cover_rate >= 0),
  currency text not null check (currency in ('GBP','USD','EUR','CAD','NGN')),
  updated_at timestamptz not null default now()
);
create table public.pw_payroll (
  id text primary key,
  staff_id uuid not null references public.pw_profiles(id),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'id' = id),
  prepared_by uuid not null default auth.uid() references public.pw_profiles(id),
  approved_by uuid references public.pw_profiles(id),
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1
);
create table public.pw_resources (
  id text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'id' = id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1
);
create table public.pw_homework (
  id text primary key,
  student_id text not null references public.pw_students(id),
  teacher_id uuid not null references public.pw_profiles(id),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'id' = id),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1
);
create table public.pw_expenses (
  id text primary key,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'id' = id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1
);
-- Permanent, financially safe verification ledger; never includes teaching notes.
create table public.pw_attendance (
  lesson_id text primary key,
  student_id text not null,
  student_name text not null,
  teacher_id uuid not null,
  admin_id uuid,
  starts_at timestamptz not null,
  kind text not null,
  teacher_done_at timestamptz,
  verified_at timestamptz not null,
  verified_by uuid not null
);
create table public.pw_audit (
  id bigint generated always as identity primary key,
  actor_id uuid,
  actor_name text not null,
  actor_role text not null,
  entity_type text not null,
  entity_id text not null,
  student_id text,
  subject_id uuid,
  action text not null,
  changed_fields text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.pw_students add constraint pw_student_state check (
  coalesce(payload->>'status' in ('active','paused','inactive'),false)
  and coalesce(payload->>'rank' in ('Novice','Beginner','Amateur','Master'),false)
  and jsonb_typeof(payload->'consent')='boolean'
);
alter table public.pw_lessons add constraint pw_lesson_state check (
  coalesce(payload->>'status' in ('scheduled','teacher_done','completed','missed','cancelled','rescheduled'),false)
  and coalesce(payload->>'kind' in ('standard','trial','cover'),false)
);
alter table public.pw_payments add constraint pw_payment_state check (
  coalesce(payload->>'status' in ('due','receipt_uploaded','paid'),false)
  and coalesce(payload->>'currency' in ('GBP','USD','EUR','CAD','NGN'),false)
  and (payload->>'amount')::numeric >= 0
);
alter table public.pw_payroll add constraint pw_payroll_state check (
  coalesce(payload->>'status' in ('draft','pending_approval','approved','paid'),false)
  and coalesce(payload->>'currency' in ('GBP','USD','EUR','CAD','NGN'),false)
  and (payload->>'base')::numeric >= 0 and (payload->>'bonus')::numeric >= 0
  and (payload->>'deduction')::numeric >= 0
);
alter table public.pw_homework add constraint pw_homework_state check (
  coalesce(payload->>'status' in ('assigned','submitted','reviewed'),false)
);

create function public.pw_role() returns text language sql stable security definer set search_path = '' as $$
  select role from public.pw_profiles where id = auth.uid() and status in ('active','on_leave')
$$;
create function public.pw_active() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.pw_profiles where id = auth.uid() and status = 'active')
$$;
create function public.pw_can_student(target text) returns boolean language sql stable security definer set search_path = '' as $$
  select public.pw_role() in ('super_admin','general_manager') or exists (
    select 1 from public.pw_students s left join public.pw_profiles a on a.id=s.admin_id left join public.pw_profiles t on t.id=s.teacher_id
    where s.id=target and (
      s.parent_id=auth.uid() or s.student_user_id=auth.uid() or s.teacher_id=auth.uid() or s.admin_id=auth.uid()
      or (public.pw_role()='head_admin' and a.head_admin_id=auth.uid())
      or (public.pw_role()='qc' and t.qc_id=auth.uid())
    )
  )
$$;
create function public.pw_manage_student(target text) returns boolean language sql stable security definer set search_path = '' as $$
  select public.pw_active() and (public.pw_role() in ('super_admin','general_manager') or exists (
    select 1 from public.pw_students s join public.pw_profiles a on a.id=s.admin_id
    where s.id=target and (s.admin_id=auth.uid() or (public.pw_role()='head_admin' and a.head_admin_id=auth.uid()))
  ))
$$;
create function public.pw_profile_visible(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid()=target or public.pw_role() in ('super_admin','general_manager','hr','finance')
    or (public.pw_role() not in ('parent','student','social_media') and exists(select 1 from public.pw_profiles where id=target and role not in ('parent','student')))
    or exists(select 1 from public.pw_students where public.pw_can_student(id) and target in (parent_id,teacher_id,admin_id,student_user_id))
$$;

-- All browser roles start with no grants. Each table has explicit policies.
do $$ declare t text; begin
  foreach t in array array['profiles','students','lessons','leads','payments','staff_compensation','payroll','resources','homework','expenses','attendance','audit'] loop
    execute format('alter table public.pw_%I enable row level security',t);
    execute format('revoke all on public.pw_%I from anon, authenticated',t);
    execute format('grant select on public.pw_%I to authenticated',t);
  end loop;
  foreach t in array array['students','lessons','leads','payments','payroll','resources','homework','expenses'] loop
    execute format('grant insert, update on public.pw_%I to authenticated',t);
  end loop;
  foreach t in array array['students','lessons','leads','payments','staff_compensation','payroll','resources','homework','expenses','attendance','audit'] loop
    execute format('create policy pw_account_active on public.pw_%I as restrictive for select to authenticated using (public.pw_role() is not null)',t);
  end loop;
end $$;
grant update(name,timezone,avatar_path) on public.pw_profiles to authenticated;

create policy pw_profile_read on public.pw_profiles for select to authenticated using (public.pw_profile_visible(id));
create policy pw_profile_update on public.pw_profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy pw_student_read on public.pw_students for select to authenticated using (public.pw_can_student(id));
create policy pw_student_insert on public.pw_students for insert to authenticated with check (public.pw_active() and public.pw_role() in ('super_admin','general_manager','head_admin'));
create policy pw_student_update on public.pw_students for update to authenticated using (public.pw_active() and public.pw_can_student(id)) with check (public.pw_can_student(id));
create policy pw_lesson_read on public.pw_lessons for select to authenticated using (public.pw_can_student(student_id) or (public.pw_role()='teacher' and teacher_id=auth.uid()));
create policy pw_lesson_insert on public.pw_lessons for insert to authenticated with check (public.pw_manage_student(student_id));
create policy pw_lesson_update on public.pw_lessons for update to authenticated using (public.pw_active() and (public.pw_manage_student(student_id) or teacher_id=auth.uid())) with check (public.pw_can_student(student_id) or teacher_id=auth.uid());
create policy pw_lead_read on public.pw_leads for select to authenticated using (public.pw_role() in ('super_admin','general_manager','head_admin','sales_marketing'));
create policy pw_lead_insert on public.pw_leads for insert to authenticated with check (public.pw_active() and public.pw_role() in ('super_admin','general_manager','head_admin','sales_marketing'));
create policy pw_lead_update on public.pw_leads for update to authenticated using (public.pw_active() and public.pw_role() in ('super_admin','general_manager','head_admin','sales_marketing'));
create policy pw_payment_read on public.pw_payments for select to authenticated using (public.pw_role() in ('super_admin','general_manager','finance') or parent_id=auth.uid());
create policy pw_payment_insert on public.pw_payments for insert to authenticated with check (public.pw_active() and public.pw_role() in ('super_admin','general_manager','finance'));
create policy pw_payment_update on public.pw_payments for update to authenticated using (public.pw_active() and (public.pw_role() in ('super_admin','general_manager','finance') or parent_id=auth.uid()));
create policy pw_compensation_read on public.pw_staff_compensation for select to authenticated using (public.pw_role() in ('super_admin','general_manager','finance','hr') or (public.pw_role()='teacher' and staff_id=auth.uid()));
create policy pw_payroll_read on public.pw_payroll for select to authenticated using (public.pw_role() in ('super_admin','general_manager','finance') or (public.pw_role()='teacher' and staff_id=auth.uid()));
create policy pw_payroll_insert on public.pw_payroll for insert to authenticated with check (public.pw_active() and public.pw_role() in ('super_admin','finance'));
create policy pw_payroll_update on public.pw_payroll for update to authenticated using (public.pw_active() and public.pw_role() in ('super_admin','finance'));
create policy pw_resource_read on public.pw_resources for select to authenticated using (public.pw_role() in ('super_admin','general_manager','qc','teacher','parent','student'));
create policy pw_resource_insert on public.pw_resources for insert to authenticated with check (public.pw_active() and public.pw_role() in ('super_admin','qc'));
create policy pw_resource_update on public.pw_resources for update to authenticated using (public.pw_active() and public.pw_role() in ('super_admin','qc'));
create policy pw_homework_read on public.pw_homework for select to authenticated using (public.pw_can_student(student_id));
create policy pw_homework_insert on public.pw_homework for insert to authenticated with check (public.pw_active() and public.pw_role() in ('super_admin','qc','teacher') and public.pw_can_student(student_id));
create policy pw_homework_update on public.pw_homework for update to authenticated using (public.pw_active() and public.pw_can_student(student_id)) with check (public.pw_can_student(student_id));
create policy pw_expense_read on public.pw_expenses for select to authenticated using (public.pw_role() in ('super_admin','general_manager','finance'));
create policy pw_expense_insert on public.pw_expenses for insert to authenticated with check (public.pw_active() and public.pw_role() in ('super_admin','finance'));
create policy pw_expense_update on public.pw_expenses for update to authenticated using (public.pw_active() and public.pw_role() in ('super_admin','finance'));
create policy pw_attendance_read on public.pw_attendance for select to authenticated using (public.pw_role() in ('super_admin','general_manager','finance') or teacher_id=auth.uid() or admin_id=auth.uid() or public.pw_can_student(student_id));
create policy pw_audit_read on public.pw_audit for select to authenticated using (
  public.pw_role()='super_admin'
  or (entity_type in ('pw_payments','pw_payroll','pw_expenses','pw_staff_compensation') and (public.pw_role() in ('general_manager','finance') or subject_id=auth.uid()))
  or (entity_type not in ('pw_payments','pw_payroll','pw_expenses','pw_staff_compensation') and (public.pw_role()='general_manager' or public.pw_can_student(student_id) or actor_id=auth.uid()))
);

-- Clients cannot control completion signatures, approval actors, timestamps, or scope.
create function public.pw_guard_record() returns trigger language plpgsql security definer set search_path = '' as $$
declare r text := public.pw_role(); changed text[]; permitted text[]; key text;
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
    elsif TG_TABLE_NAME='pw_payments' then
      if r='parent' and (not changed <@ array['status','receiptName','receiptPath'] or new.payload->>'status' <> 'receipt_uploaded' or new.student_id<>old.student_id or new.parent_id<>old.parent_id) then raise exception 'Parent can only submit a receipt' using errcode='42501'; end if;
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
  elsif TG_TABLE_NAME='pw_payments' and new.payload->>'status'='paid' and new.verified_at is null then
    if r not in ('super_admin','finance') then raise exception 'Finance verifies payments' using errcode='42501'; end if;
    new.verified_at=now(); new.verified_by=auth.uid();
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
create function public.pw_log_record() returns trigger language plpgsql security definer set search_path = '' as $$
declare changed text[]; student text; subject uuid;
begin
  if TG_OP='UPDATE' then
    select coalesce(array_agg(k),'{}') into changed from (select jsonb_object_keys(old.payload||new.payload) k) keys where old.payload->k is distinct from new.payload->k;
  else select array_agg(k) into changed from jsonb_object_keys(new.payload) k; end if;
  if TG_TABLE_NAME='pw_students' then student=new.id; subject=new.parent_id;
  elsif TG_TABLE_NAME in ('pw_lessons','pw_homework') then student=new.student_id;
  elsif TG_TABLE_NAME='pw_payments' then student=new.student_id; subject=new.parent_id;
  elsif TG_TABLE_NAME='pw_payroll' then subject=new.staff_id;
  end if;
  insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,student_id,subject_id,action,changed_fields)
  values(auth.uid(),coalesce((select name from public.pw_profiles where id=auth.uid()),'System'),coalesce(public.pw_role(),'system'),TG_TABLE_NAME,new.id,student,subject,case when TG_OP='INSERT' then 'Created' else 'Updated' end,changed);
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['students','lessons','leads','payments','payroll','resources','homework','expenses'] loop
    execute format('create trigger pw_record_guard before insert or update on public.pw_%I for each row execute function public.pw_guard_record()',t);
    execute format('create trigger pw_record_audit after insert or update on public.pw_%I for each row execute function public.pw_log_record()',t);
  end loop;
end $$;

-- Atomic, user-scoped batch command. No client-supplied audit or privileged snapshots.
create function public.pw_apply_changes(changes jsonb) returns void language plpgsql security invoker set search_path = '' as $$
declare c jsonb; t text; v jsonb; expected integer; updated integer;
begin
  if not public.pw_active() or jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)>50 then raise exception 'Invalid batch' using errcode='42501'; end if;
  for c in select value from jsonb_array_elements(changes) loop
    t=c->>'table'; v=c->'record'; expected=(c->>'revision')::integer;
    if t not in ('pw_students','pw_lessons','pw_leads','pw_payments','pw_payroll','pw_resources','pw_homework','pw_expenses') then raise exception 'Invalid module' using errcode='42501'; end if;
    if c->>'operation'='insert' then
      if t='pw_students' then insert into public.pw_students(id,parent_id,teacher_id,admin_id,payload) values(v->>'id',(v->>'parent_id')::uuid,(v->>'teacher_id')::uuid,(v->>'admin_id')::uuid,v->'payload');
      elsif t='pw_lessons' then insert into public.pw_lessons(id,student_id,teacher_id,admin_id,payload) values(v->>'id',v->>'student_id',(v->>'teacher_id')::uuid,(v->>'admin_id')::uuid,v->'payload');
      elsif t='pw_payments' then insert into public.pw_payments(id,parent_id,student_id,payload) values(v->>'id',(v->>'parent_id')::uuid,v->>'student_id',v->'payload');
      elsif t='pw_payroll' then insert into public.pw_payroll(id,staff_id,payload) values(v->>'id',(v->>'staff_id')::uuid,v->'payload');
      elsif t='pw_homework' then insert into public.pw_homework(id,student_id,teacher_id,payload) values(v->>'id',v->>'student_id',(v->>'teacher_id')::uuid,v->'payload');
      elsif t='pw_leads' then insert into public.pw_leads(id,owner_id,payload) values(v->>'id',auth.uid(),v->'payload');
      else execute format('insert into public.%I(id,payload) values ($1,$2)',t) using v->>'id',v->'payload';
      end if;
    elsif c->>'operation'='update' then
      if t='pw_students' then update public.pw_students set payload=v->'payload',parent_id=(v->>'parent_id')::uuid,teacher_id=(v->>'teacher_id')::uuid,admin_id=(v->>'admin_id')::uuid where id=v->>'id' and revision=expected;
      elsif t='pw_lessons' then update public.pw_lessons set payload=v->'payload',teacher_id=(v->>'teacher_id')::uuid,admin_id=(v->>'admin_id')::uuid where id=v->>'id' and revision=expected;
      else execute format('update public.%I set payload=$1 where id=$2 and revision=$3',t) using v->'payload',v->>'id',expected;
      end if;
      get diagnostics updated=row_count;
      if updated<>1 then raise exception 'Record changed or not accessible; reload' using errcode='40001'; end if;
    else raise exception 'Unsupported operation' using errcode='42501'; end if;
  end loop;
end $$;
revoke all on function public.pw_apply_changes(jsonb) from public,anon;
grant execute on function public.pw_apply_changes(jsonb) to authenticated;
revoke all on function public.pw_new_user(), public.pw_guard_record(), public.pw_log_record() from public,anon,authenticated;
revoke all on function public.pw_role(),public.pw_active(),public.pw_can_student(text),public.pw_manage_student(text),public.pw_profile_visible(uuid) from public,anon;
grant execute on function public.pw_role(),public.pw_active(),public.pw_can_student(text),public.pw_manage_student(text),public.pw_profile_visible(uuid) to authenticated;
