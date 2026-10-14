create function public.pw_classroom_participant_allowed(p_room uuid,p_actor uuid) returns boolean
language sql security definer set search_path='' as $$
 select exists(
   select 1 from public.pw_classrooms r
   join public.pw_lessons l on l.id=r.lesson_id
   join public.pw_students s on s.id=l.student_id
   join public.pw_profiles p on p.id=p_actor
   left join public.pw_profiles a on a.id=s.admin_id
   left join public.pw_profiles t on t.id=s.teacher_id
   where r.id=p_room and p.status='active' and s.payload->>'status'='active'
   and l.payload->>'status' in ('scheduled','teacher_done','completed')
   and (l.payload->>'startsAt')::timestamptz=r.starts_at
   and (
     p.role in ('super_admin','general_manager')
     or (p.role='parent' and s.parent_id=p.id)
     or (p.role='student' and s.student_user_id=p.id)
     or (p.role='teacher' and l.teacher_id=p.id)
     or (p.role='admin' and l.admin_id=p.id)
     or (p.role='head_admin' and a.head_admin_id=p.id)
     or (p.role='qc' and t.qc_id=p.id)
   )
 )
$$;
create or replace function public.pw_expired_classrooms() returns table(id uuid,room_name text)
language sql security definer set search_path='' as $$
 select r.id,'pw-'||r.id::text from public.pw_classrooms r
 join public.pw_lessons l on l.id=r.lesson_id
 join public.pw_students s on s.id=l.student_id
 cross join public.pw_settings cfg
 where r.closed_at is null and (
   least(r.closes_at,(l.payload->>'startsAt')::timestamptz+make_interval(hours=>(cfg.settings->>'joinAfterHours')::integer))<=clock_timestamp()
   or l.payload->>'status' not in ('scheduled','teacher_done','completed')
   or s.payload->>'status'<>'active'
   or (l.payload->>'startsAt')::timestamptz<>r.starts_at)
 limit 100
$$;
create function public.pw_open_classrooms() returns table(id uuid,room_name text)
language sql security definer set search_path='' as $$
 select r.id,'pw-'||r.id::text from public.pw_classrooms r where r.closed_at is null
 and r.closes_at>clock_timestamp()
$$;
revoke all on function public.pw_classroom_participant_allowed(uuid,uuid),public.pw_open_classrooms() from public,anon,authenticated;
grant execute on function public.pw_classroom_participant_allowed(uuid,uuid),public.pw_open_classrooms() to service_role;
