-- HR authorization is separate from Head Admin portfolio planning. Primary
-- ownership is retained; verified classes keep their actual covering staff.
create table public.pw_leaves(
 id uuid primary key default gen_random_uuid(),staff_id uuid not null references public.pw_profiles(id),
 submitted_by uuid not null references public.pw_profiles(id),route text not null check(route in('hr','head_admin')),
 kind text not null check(kind in('leave','exam_break','sick_leave')),reason text not null,
 starts_at timestamptz not null,ends_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),
 state text not null default 'submitted' check(state in('submitted','forwarded','hr_approved','approved','active','completed','rejected','cancelled')),
 hr_by uuid references public.pw_profiles(id),hr_at timestamptz,head_by uuid references public.pw_profiles(id),
 approved_at timestamptz,activated_at timestamptz,closed_at timestamptz,decision_reason text,
 check(ends_at>starts_at and ends_at<=starts_at+interval '180 days')
);
create table public.pw_leave_covers(
 id uuid primary key default gen_random_uuid(),leave_id uuid not null references public.pw_leaves(id),
 student_id text not null references public.pw_students(id),cover_id uuid not null references public.pw_profiles(id),
 duty text not null check(duty in('teacher','admin')),original_id uuid not null references public.pw_profiles(id),
 created_by uuid not null references public.pw_profiles(id),created_at timestamptz not null default clock_timestamp(),
 applied_at timestamptz,unique(leave_id,student_id,duty)
);
create table public.pw_leave_lesson_history(
 id bigint generated always as identity primary key,leave_id uuid not null references public.pw_leaves(id),
 lesson_id text not null references public.pw_lessons(id),cover_id uuid not null references public.pw_leave_covers(id),
 original_id uuid not null references public.pw_profiles(id),original_kind text not null,created_at timestamptz not null default clock_timestamp(),
 unique(leave_id,lesson_id,cover_id)
);
create function public.pw_leave_manages(p_staff uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.pw_active() and (public.pw_role() in('super_admin','hr') or(public.pw_role()='head_admin' and(
 exists(select 1 from public.pw_profiles where id=p_staff and head_admin_id=auth.uid()) or
 exists(select 1 from public.pw_students s join public.pw_profiles a on a.id=s.admin_id where a.head_admin_id=auth.uid() and(p_staff=s.teacher_id or p_staff=s.admin_id))
 )));
$$;
create function public.pw_leave_reads(p_leave uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.pw_session_allowed() and exists(select 1 from public.pw_leaves l where l.id=p_leave and(
 l.staff_id=auth.uid() or public.pw_leave_manages(l.staff_id) or exists(select 1 from public.pw_leave_covers c where c.leave_id=l.id and c.cover_id=auth.uid())
 ));
$$;
alter table public.pw_leaves enable row level security;
alter table public.pw_leave_covers enable row level security;
alter table public.pw_leave_lesson_history enable row level security;
revoke all on public.pw_leaves,public.pw_leave_covers,public.pw_leave_lesson_history from anon,authenticated;
grant select on public.pw_leaves,public.pw_leave_covers,public.pw_leave_lesson_history to authenticated;
create policy pw_leave_read on public.pw_leaves for select to authenticated using(public.pw_session_allowed() and(staff_id=auth.uid() or public.pw_leave_manages(staff_id)));
-- Do not expose the absent person's medical reason to covering staff: API returns
-- a minimal covering directory instead of querying pw_leaves with service access.
create policy pw_leave_cover_read on public.pw_leave_covers for select to authenticated using(public.pw_session_allowed() and(cover_id=auth.uid() or exists(select 1 from public.pw_leaves l where l.id=leave_id and(l.staff_id=auth.uid() or public.pw_leave_manages(l.staff_id)))));
create policy pw_leave_history_read on public.pw_leave_lesson_history for select to authenticated using(public.pw_session_allowed() and(
 exists(select 1 from public.pw_leaves l where l.id=leave_id and(l.staff_id=auth.uid() or public.pw_leave_manages(l.staff_id))) or
 exists(select 1 from public.pw_leave_covers c where c.id=pw_leave_lesson_history.cover_id and c.cover_id=auth.uid())));

create function public.pw_leave_audit(p_id uuid,p_action text) returns void language sql security definer set search_path='' as $$
 insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,subject_id,action)
 select auth.uid(),coalesce(p.name,'Academy leave service'),coalesce(p.role,'service_role'),'pw_leaves',l.id::text,l.staff_id,p_action
 from public.pw_leaves l left join public.pw_profiles p on p.id=auth.uid() where l.id=p_id;
$$;
revoke all on function public.pw_leave_audit(uuid,text) from public,anon,authenticated;

create function public.pw_leave_action(p_action text,p_id uuid default null,p_staff uuid default null,p_route text default null,p_kind text default null,
 p_start timestamptz default null,p_end timestamptz default null,p_reason text default null,p_student text default null,p_cover uuid default null)
 returns uuid language plpgsql security definer set search_path='' as $$
declare l public.pw_leaves;s public.pw_profiles;c public.pw_profiles;k text;child public.pw_students;
begin
 if not public.pw_active() or public.pw_role() in('parent','student','general_manager','super_admin') and p_action='request' and p_staff is null
 then raise exception 'Active staff required' using errcode='42501';end if;
 if p_action='request' then
  p_staff:=coalesce(p_staff,auth.uid());
  if p_staff<>auth.uid() and not public.pw_leave_manages(p_staff) then raise exception 'Staff management required' using errcode='42501';end if;
  select * into s from public.pw_profiles where id=p_staff for update;
  if s.status<>'active' or s.role in('parent','student','super_admin','general_manager') or s.id is null
   or p_route not in('hr','head_admin') or p_kind not in('leave','exam_break','sick_leave')
   or p_start is null or p_end is null or p_start<clock_timestamp() or p_end<=p_start or p_end>p_start+interval '180 days'
   or length(trim(coalesce(p_reason,''))) not between 5 and 2000 then raise exception 'Valid active staff, future interval and reason required' using errcode='22023';end if;
  if exists(select 1 from public.pw_leaves where staff_id=p_staff and state not in('rejected','cancelled','completed') and starts_at<p_end and ends_at>p_start)
  then raise exception 'Overlapping leave request' using errcode='23514';end if;
  insert into public.pw_leaves(staff_id,submitted_by,route,kind,starts_at,ends_at,reason) values(p_staff,auth.uid(),p_route,p_kind,p_start,p_end,trim(p_reason)) returning id into p_id;
  perform public.pw_leave_audit(p_id,'Leave requested via '||p_route);return p_id;
 end if;
 select * into l from public.pw_leaves where id=p_id for update;
 if l.id is null or not public.pw_leave_reads(l.id) then raise exception 'Leave unavailable' using errcode='42501';end if;
 select * into s from public.pw_profiles where id=l.staff_id;
 if p_action='forward' then
  if public.pw_role() not in('super_admin','head_admin') or not public.pw_leave_manages(l.staff_id) or l.route<>'head_admin' or l.state<>'submitted'
  then raise exception 'Head Admin forwarding required' using errcode='42501';end if;
  update public.pw_leaves set state='forwarded' where id=l.id;
 elsif p_action in('hr_approve','reject') then
  if public.pw_role() not in('super_admin','hr') or l.staff_id=auth.uid() or l.state not in('submitted','forwarded')
   or(l.route='head_admin' and l.state<>'forwarded') then raise exception 'Independent HR review required' using errcode='42501';end if;
  if length(trim(coalesce(p_reason,'')))<5 or l.starts_at<=clock_timestamp() then raise exception 'Review reason and future start required' using errcode='22023';end if;
  update public.pw_leaves set state=case p_action when 'reject' then 'rejected' else 'hr_approved' end,hr_by=auth.uid(),hr_at=clock_timestamp(),decision_reason=trim(p_reason) where id=l.id;
 elsif p_action='plan' then
  if public.pw_role() not in('super_admin','head_admin') or not public.pw_leave_manages(l.staff_id) or l.staff_id=auth.uid() or l.state<>'hr_approved'
  then raise exception 'HR-approved Head Admin planning required' using errcode='42501';end if;
  k:=case s.role when 'teacher' then 'teacher' when 'admin' then 'admin' else null end;
  select * into child from public.pw_students where id=p_student for update;
  select * into c from public.pw_profiles where id=p_cover for update;
  if k is null or child.id is null or c.status<>'active' or c.id=l.staff_id or
    (k='teacher' and(child.teacher_id<>l.staff_id or c.role not in('teacher','qc'))) or
    (k='admin' and(child.admin_id<>l.staff_id or c.role not in('admin','head_admin')))
  then raise exception 'Compatible assigned learner and active covering staff required' using errcode='22023';end if;
  if exists(select 1 from public.pw_leaves where staff_id=c.id and state not in('rejected','cancelled','completed') and starts_at<l.ends_at and ends_at>l.starts_at)
   or exists(select 1 from public.pw_leave_covers x join public.pw_leaves y on y.id=x.leave_id where x.student_id=child.id and x.duty=k and y.id<>l.id and y.state not in('rejected','cancelled','completed') and y.starts_at<l.ends_at and y.ends_at>l.starts_at)
  then raise exception 'Covering staff or learner already has overlapping leave/cover' using errcode='23514';end if;
  if k='admin' and exists(select 1 from public.pw_leave_covers x join public.pw_students a on a.id=x.student_id where x.leave_id=l.id and x.duty=k and a.parent_id=child.parent_id and x.cover_id<>c.id)
  then raise exception 'A family portfolio must remain with one covering administrator' using errcode='23514';end if;
  insert into public.pw_leave_covers(leave_id,student_id,cover_id,duty,original_id,created_by) values(l.id,child.id,c.id,k,l.staff_id,auth.uid())
  on conflict(leave_id,student_id,duty) do update set cover_id=excluded.cover_id,created_by=excluded.created_by,created_at=clock_timestamp();
 elsif p_action='finalize' then
  if public.pw_role() not in('super_admin','head_admin') or not public.pw_leave_manages(l.staff_id) or l.staff_id=auth.uid() or l.state<>'hr_approved'
   then raise exception 'Independent Head Admin finalization required' using errcode='42501';end if;
  if l.starts_at<=clock_timestamp() then raise exception 'Leave must be ready before it starts' using errcode='23514';end if;
  if s.role in('teacher','admin') and exists(select 1 from public.pw_students a where a.payload->>'status'='active' and
   (case s.role when 'teacher' then a.teacher_id else a.admin_id end)=s.id and not exists(select 1 from public.pw_leave_covers x where x.leave_id=l.id and x.student_id=a.id))
  then raise exception 'Every active learner needs a covering assignment' using errcode='23514';end if;
  update public.pw_leaves set state='approved',head_by=auth.uid(),approved_at=clock_timestamp() where id=l.id;
  perform public.pw_apply_leave_lessons(l.id);
 elsif p_action='cancel' then
  if not(public.pw_role()='super_admin' or(l.staff_id=auth.uid() and l.state in('submitted','forwarded')) or(public.pw_role()='hr' and l.state in('submitted','forwarded','hr_approved')))
   or l.state in('cancelled','completed','rejected') or length(trim(coalesce(p_reason,'')))<5 then raise exception 'Authorized cancellation and reason required' using errcode='42501';end if;
  update public.pw_leaves set state='cancelled',closed_at=clock_timestamp(),decision_reason=trim(p_reason) where id=l.id;
  perform public.pw_restore_leave_lessons(l.id);
 else raise exception 'Unknown leave action' using errcode='22023';
 end if;
 perform public.pw_leave_audit(l.id,'Leave: '||p_action);return l.id;
end $$;

-- Only a finalized leave can change classroom personnel. These helpers are never
-- exposed as user RPCs and cannot be called to erase verified attendance.
create function public.pw_apply_leave_lessons(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare l public.pw_leaves;c public.pw_leave_covers;r public.pw_lessons;
begin
 select * into l from public.pw_leaves where id=p_id and state in('approved','active');
 if l.id is null then return;end if;
 for c in select * from public.pw_leave_covers where leave_id=l.id loop
  for r in select * from public.pw_lessons where student_id=c.student_id and verified_at is null and payload->>'status' in('scheduled','rescheduled')
   and(payload->>'startsAt')::timestamptz>=l.starts_at and(payload->>'startsAt')::timestamptz<l.ends_at for update loop
   if (case c.duty when 'teacher' then r.teacher_id else r.admin_id end) not in(c.original_id,c.cover_id) then raise exception 'Class assignment changed; review leave plan' using errcode='23514';end if;
   insert into public.pw_leave_lesson_history(leave_id,lesson_id,cover_id,original_id,original_kind) values(l.id,r.id,c.id,c.original_id,r.payload->>'kind') on conflict do nothing;
   update public.pw_lessons set teacher_id=case c.duty when 'teacher' then c.cover_id else teacher_id end,
    admin_id=case c.duty when 'admin' then c.cover_id else admin_id end,
    payload=case c.duty when 'teacher' then jsonb_set(jsonb_set(payload,'{teacherId}',to_jsonb(c.cover_id::text)),'{teacherName}',to_jsonb((select name from public.pw_profiles where id=c.cover_id)))||jsonb_build_object('kind','cover')
     else jsonb_set(jsonb_set(payload,'{adminId}',to_jsonb(c.cover_id::text)),'{adminName}',to_jsonb((select name from public.pw_profiles where id=c.cover_id))) end where id=r.id;
  end loop;
 end loop;
end $$;
create function public.pw_restore_leave_lessons(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare h record;
begin
 for h in select a.*,c.duty,c.cover_id current_cover from public.pw_leave_lesson_history a join public.pw_leave_covers c on c.id=a.cover_id where a.leave_id=p_id loop
  update public.pw_lessons set teacher_id=case h.duty when 'teacher' then h.original_id else teacher_id end,
   admin_id=case h.duty when 'admin' then h.original_id else admin_id end,
   payload=case h.duty when 'teacher' then jsonb_set(jsonb_set(payload,'{teacherId}',to_jsonb(h.original_id::text)),'{teacherName}',to_jsonb((select name from public.pw_profiles where id=h.original_id)))||jsonb_build_object('kind',h.original_kind)
    else jsonb_set(jsonb_set(payload,'{adminId}',to_jsonb(h.original_id::text)),'{adminName}',to_jsonb((select name from public.pw_profiles where id=h.original_id))) end
   where id=h.lesson_id and verified_at is null and payload->>'status' in('scheduled','rescheduled') and (payload->>'startsAt')::timestamptz>=clock_timestamp() and
    (case h.duty when 'teacher' then teacher_id else admin_id end)=h.current_cover;
 end loop;
 update public.pw_profiles set status='active' where id=(select staff_id from public.pw_leaves where id=p_id) and status='on_leave'
  and exists(select 1 from public.pw_leaves where id=p_id and activated_at is not null);
end $$;
revoke all on function public.pw_apply_leave_lessons(uuid),public.pw_restore_leave_lessons(uuid) from public,anon,authenticated;

create function public.pw_reconcile_leaves() returns void language plpgsql security definer set search_path='' as $$
declare l public.pw_leaves;
begin
 for l in select * from public.pw_leaves where state in('approved','active') and starts_at<=clock_timestamp() for update skip locked loop
  if l.ends_at<=clock_timestamp() then
   update public.pw_leaves set state='completed',closed_at=l.ends_at where id=l.id;
   perform public.pw_restore_leave_lessons(l.id);perform public.pw_leave_audit(l.id,'Leave ended; unverified assignments restored');
  elsif l.state='approved' then
   perform public.pw_apply_leave_lessons(l.id);
   update public.pw_profiles set status='on_leave' where id=l.staff_id and status='active';
   update public.pw_leaves set state='active',activated_at=clock_timestamp() where id=l.id;
   update public.pw_leave_covers set applied_at=clock_timestamp() where leave_id=l.id;
   perform public.pw_leave_audit(l.id,'Leave started; temporary cover active');
  end if;
 end loop;
end $$;
revoke all on function public.pw_reconcile_leaves() from public,anon,authenticated;
grant execute on function public.pw_reconcile_leaves() to service_role;

-- Native RLS shares dossiers with a covering employee only for the approved
-- interval. Primary ownership and financial history remain unchanged.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.pw_can_student(text)'::regprocedure) into definition;
 definition:=replace(definition,'select public.pw_role()','select exists(select 1 from public.pw_leave_covers c join public.pw_leaves l on l.id=c.leave_id where c.student_id=target and c.cover_id=auth.uid() and l.state in(''approved'',''active'') and clock_timestamp()>=l.starts_at and clock_timestamp()<l.ends_at) or public.pw_role()');
 if definition not like '%pw_leave_covers%' then raise exception 'Unexpected dossier permission definition';end if;
 execute definition;
end $migration$;
revoke all on function public.pw_leave_manages(uuid),public.pw_leave_reads(uuid) from public,anon;
grant execute on function public.pw_leave_manages(uuid),public.pw_leave_reads(uuid) to authenticated;
revoke all on function public.pw_leave_action(text,uuid,uuid,text,text,timestamptz,timestamptz,text,text,uuid) from public,anon;
grant execute on function public.pw_leave_action(text,uuid,uuid,text,text,timestamptz,timestamptz,text,text,uuid) to authenticated;

create function public.pw_leave_directory() returns table(id uuid,name text,role text,status text,timezone text) language sql stable security definer set search_path='' as $$
 select p.id,p.name,p.role,p.status,p.timezone from public.pw_profiles p where public.pw_active() and public.pw_role() not in('parent','student','general_manager') and p.role not in('parent','student','general_manager')
 and(p.id=auth.uid() or p.role in('hr','head_admin') or public.pw_role() in('super_admin','hr','head_admin')) and p.status in('active','on_leave');
$$;
revoke all on function public.pw_leave_directory() from public,anon;
grant execute on function public.pw_leave_directory() to authenticated;

create function public.pw_leave_cover_timeline() returns table(id uuid,staff_id uuid,starts_at timestamptz,ends_at timestamptz,state text,closed_at timestamptz) language sql stable security definer set search_path='' as $$
 select l.id,l.staff_id,l.starts_at,l.ends_at,l.state,l.closed_at from public.pw_leaves l
 where public.pw_session_allowed() and exists(select 1 from public.pw_leave_covers c where c.leave_id=l.id and c.cover_id=auth.uid());
$$;
revoke all on function public.pw_leave_cover_timeline() from public,anon;
grant execute on function public.pw_leave_cover_timeline() to authenticated;

create function public.pw_leave_schedule_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare c record;h public.pw_leave_covers;
begin
 if new.verified_at is not null or new.payload->>'status' not in('scheduled','rescheduled') then return new;end if;
 for c in select l.*,p.role staff_role from public.pw_leaves l join public.pw_profiles p on p.id=l.staff_id where l.state in('approved','active')
  and (new.payload->>'startsAt')::timestamptz>=l.starts_at and(new.payload->>'startsAt')::timestamptz<l.ends_at
  and((p.role='teacher' and new.teacher_id=l.staff_id)or(p.role='admin' and new.admin_id=l.staff_id)) loop
  select * into h from public.pw_leave_covers where leave_id=c.id and student_id=new.student_id and duty=c.staff_role;
  if h.id is null then raise exception 'Staff has approved leave; Head Admin must plan this learner cover first' using errcode='23514';end if;
  if TG_OP='UPDATE' then
   insert into public.pw_leave_lesson_history(leave_id,lesson_id,cover_id,original_id,original_kind)
   values(c.id,new.id,h.id,h.original_id,new.payload->>'kind') on conflict do nothing;
  end if;
  if c.staff_role='teacher' then
   new.payload:=new.payload||jsonb_build_object('leaveOriginalKind',new.payload->>'kind');
   new.teacher_id:=h.cover_id;
   new.payload:=jsonb_set(jsonb_set(new.payload,'{teacherId}',to_jsonb(h.cover_id::text)),'{teacherName}',to_jsonb((select name from public.pw_profiles where id=h.cover_id)))||jsonb_build_object('kind','cover');
  else
   new.admin_id:=h.cover_id;
   new.payload:=jsonb_set(jsonb_set(new.payload,'{adminId}',to_jsonb(h.cover_id::text)),'{adminName}',to_jsonb((select name from public.pw_profiles where id=h.cover_id)));
  end if;
 end loop;
 return new;
end $$;
create trigger aa_pw_leave_schedule before insert or update on public.pw_lessons for each row execute function public.pw_leave_schedule_guard();
-- New lessons require their FK-safe history after insertion.
create function public.pw_leave_schedule_history() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.pw_leave_lesson_history(leave_id,lesson_id,cover_id,original_id,original_kind)
 select l.id,new.id,c.id,c.original_id,coalesce(new.payload->>'leaveOriginalKind','standard') from public.pw_leave_covers c join public.pw_leaves l on l.id=c.leave_id
 where l.state in('approved','active') and c.student_id=new.student_id and(new.payload->>'startsAt')::timestamptz>=l.starts_at
 and(new.payload->>'startsAt')::timestamptz<l.ends_at and(case c.duty when 'teacher' then new.teacher_id else new.admin_id end)=c.cover_id
 on conflict do nothing;
 return new;
end $$;
create trigger pw_leave_new_lesson_history after insert on public.pw_lessons for each row execute function public.pw_leave_schedule_history();
revoke all on function public.pw_leave_schedule_guard(),public.pw_leave_schedule_history() from public,anon,authenticated;
