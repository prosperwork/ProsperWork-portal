create table public.pw_rules(key text primary key,value integer not null);
insert into public.pw_rules values('reschedule_notice_hours',2),('admin_concurrent_classes',3),('lesson_minutes',60);
alter table public.pw_rules enable row level security;
revoke all on public.pw_rules from anon,authenticated;
grant select on public.pw_rules to authenticated;
create policy pw_rules_read on public.pw_rules for select to authenticated using(public.pw_role() is not null);
create table public.pw_reschedules(
 id uuid primary key default gen_random_uuid(),lesson_id text not null references public.pw_lessons(id),
 student_id text not null references public.pw_students(id),requested_by uuid not null references public.pw_profiles(id),
 original_start timestamptz not null,slots jsonb not null,reason text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 teacher_approved boolean not null default false,admin_approved boolean not null default false,
 selected_slot timestamptz,teacher_approved_by uuid,teacher_approved_at timestamptz,
 admin_approved_by uuid,admin_approved_at timestamptz,decision_note text,created_at timestamptz not null default now()
);
create unique index pw_one_pending_reschedule on public.pw_reschedules(lesson_id) where status='pending';
alter table public.pw_reschedules enable row level security;
revoke all on public.pw_reschedules from anon,authenticated;
grant select on public.pw_reschedules to authenticated;
create policy pw_reschedule_read on public.pw_reschedules for select to authenticated using(public.pw_can_student(student_id));

create function public.pw_validate_schedule() returns trigger language plpgsql security definer set search_path='' as $$
declare start_time timestamptz; minutes integer; limit_count integer;
begin
  if tg_op='UPDATE' and new.teacher_id is not distinct from old.teacher_id and new.admin_id is not distinct from old.admin_id
    and new.payload->>'startsAt' is not distinct from old.payload->>'startsAt' then return new; end if;
  if new.payload->>'status' not in ('scheduled','teacher_done','completed') then return new; end if;
  start_time:=(new.payload->>'startsAt')::timestamptz;
  select value into minutes from public.pw_rules where key='lesson_minutes';
  select value into limit_count from public.pw_rules where key='admin_concurrent_classes';
  if new.teacher_id is not null then perform pg_advisory_xact_lock(hashtextextended(new.teacher_id::text,77)); end if;
  if new.admin_id is not null then perform pg_advisory_xact_lock(hashtextextended(new.admin_id::text,78)); end if;
  if exists(select 1 from public.pw_lessons l where l.id<>new.id and l.teacher_id=new.teacher_id
    and l.payload->>'status' in ('scheduled','teacher_done','completed')
    and abs(extract(epoch from ((l.payload->>'startsAt')::timestamptz-start_time)))<minutes*60) then
    raise exception 'Teacher schedule conflict' using errcode='PW003';
  end if;
  if (select count(*) from public.pw_lessons l where l.id<>new.id and l.admin_id=new.admin_id
    and l.payload->>'status' in ('scheduled','teacher_done','completed')
    and abs(extract(epoch from ((l.payload->>'startsAt')::timestamptz-start_time)))<minutes*60)>=limit_count then
    raise exception 'Admin concurrent class limit reached' using errcode='PW003';
  end if;
  return new;
end $$;
create trigger pw_schedule before insert or update on public.pw_lessons for each row execute function public.pw_validate_schedule();

create function public.pw_request_reschedule(p_lesson text,p_slots jsonb,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare l public.pw_lessons; request_id uuid; slot text; notice integer;
begin
  select * into l from public.pw_lessons where id=p_lesson for update;
  if l.id is null or not coalesce(public.pw_active(),false) or not public.pw_can_student(l.student_id)
    or coalesce(public.pw_role(),'') not in ('parent','student','teacher','admin','head_admin','super_admin','general_manager')
    or (public.pw_role()='teacher' and l.teacher_id<>auth.uid()) then
    raise exception 'Unauthorized request' using errcode='42501';
  end if;
  select value into notice from public.pw_rules where key='reschedule_notice_hours';
  if l.payload->>'status'<>'scheduled' or (l.payload->>'startsAt')::timestamptz<=now()+make_interval(hours=>notice) then
    raise exception 'Notice cutoff reached' using errcode='PW001';
  end if;
  if length(trim(p_reason)) not between 1 and 4000 or jsonb_typeof(p_slots)<>'array' or jsonb_array_length(p_slots) not between 1 and 10 then
    raise exception 'Reason and proposed times required' using errcode='22023';
  end if;
  for slot in select jsonb_array_elements_text(p_slots) loop
    if slot::timestamptz<=now()+make_interval(hours=>notice) then
      raise exception 'Propose future slots beyond the notice cutoff' using errcode='PW001';
    end if;
  end loop;
  insert into public.pw_reschedules(lesson_id,student_id,requested_by,original_start,slots,reason)
  values(l.id,l.student_id,auth.uid(),(l.payload->>'startsAt')::timestamptz,p_slots,trim(p_reason)) returning id into request_id;
  insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,student_id,action,changed_fields)
  values(auth.uid(),(select name from public.pw_profiles where id=auth.uid()),public.pw_role(),'pw_reschedules',request_id::text,l.student_id,'Reschedule requested',array['slots','reason']);
  return request_id;
end $$;
create function public.pw_decide_reschedule(p_id uuid,p_decision text,p_slot timestamptz default null,p_note text default '')
returns void language plpgsql security definer set search_path='' as $$
declare r public.pw_reschedules;l public.pw_lessons;is_teacher boolean;is_admin boolean;
begin
  select * into r from public.pw_reschedules where id=p_id for update;
  select * into l from public.pw_lessons where id=r.lesson_id for update;
  is_teacher:=coalesce(public.pw_role()='teacher' and l.teacher_id=auth.uid(),false);
  is_admin:=coalesce(public.pw_manage_student(l.student_id),false);
  if r.id is null or not coalesce(public.pw_active(),false) or not (is_teacher or is_admin) then
    raise exception 'Assigned approver required' using errcode='42501';
  end if;
  if r.status<>'pending' or (l.payload->>'startsAt')::timestamptz<>r.original_start or r.original_start<=now() then
    raise exception 'Request no longer current' using errcode='40001';
  end if;
  if length(p_note)>4000 then raise exception 'Note too long' using errcode='22023';end if;
  if p_decision='reject' then
    if length(trim(p_note))=0 then raise exception 'Rejection reason required' using errcode='22023';end if;
    update public.pw_reschedules set status='rejected',decision_note=trim(p_note) where id=r.id;
  elsif p_decision='approve' then
    if p_slot is null or p_slot<=now() or not exists(select 1 from jsonb_array_elements_text(r.slots) s where s::timestamptz=p_slot) then
      raise exception 'Choose an offered future slot' using errcode='22023';
    end if;
    if is_teacher then
      if r.teacher_approved and r.selected_slot<>p_slot then raise exception 'Confirmed slot is locked' using errcode='40001';end if;
      update public.pw_reschedules set teacher_approved=true,selected_slot=p_slot,teacher_approved_by=auth.uid(),teacher_approved_at=now(),decision_note=p_note where id=r.id;
    else
      if not r.teacher_approved then raise exception 'Teacher confirmation required first' using errcode='PW002';end if;
      if r.selected_slot<>p_slot then raise exception 'Approve the teacher confirmed slot' using errcode='22023';end if;
      update public.pw_reschedules set status='approved',admin_approved=true,admin_approved_by=auth.uid(),admin_approved_at=now(),decision_note=p_note where id=r.id;
      -- Normal lesson guards and audit remain enabled: an authorized administrator performs the move.
      update public.pw_lessons set payload=(payload-'requestedSlots')||jsonb_build_object('startsAt',p_slot,'status','scheduled') where id=l.id;
    end if;
  else raise exception 'Invalid decision' using errcode='22023';end if;
  insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,student_id,action,changed_fields)
  values(auth.uid(),(select name from public.pw_profiles where id=auth.uid()),public.pw_role(),'pw_reschedules',r.id::text,r.student_id,
    case when p_decision='reject' then 'Reschedule rejected' when is_teacher then 'Teacher confirmed reschedule' else 'Admin approved reschedule' end,array['status','selected_slot','decision_note']);
end $$;
revoke all on function public.pw_request_reschedule(text,jsonb,text),public.pw_decide_reschedule(uuid,text,timestamptz,text) from public,anon;
grant execute on function public.pw_request_reschedule(text,jsonb,text),public.pw_decide_reschedule(uuid,text,timestamptz,text) to authenticated;
