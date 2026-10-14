create or replace function public.pw_classroom_access(p_lesson text,p_join boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.pw_lessons;s public.pw_students; rules jsonb; opens timestamptz; closes timestamptz; room_id uuid;role_name text; allowed boolean;
begin
 select * into l from public.pw_lessons where id=p_lesson for share;
 select * into s from public.pw_students where id=l.student_id;
 role_name:=public.pw_role();
 allowed:=coalesce(public.pw_active() and s.payload->>'status'='active' and (
   role_name='super_admin'
   or (role_name='teacher' and l.teacher_id=auth.uid())
   or (role_name='admin' and l.admin_id=auth.uid())
   or (role_name in ('head_admin','general_manager','qc') and public.pw_can_student(s.id))
   or (role_name='parent' and s.parent_id=auth.uid())
   or (role_name='student' and s.student_user_id=auth.uid())
 ),false);
 if l.id is null or not allowed then raise exception 'Classroom access denied' using errcode='42501';end if;
 select settings into rules from public.pw_settings where singleton;
 opens:=(l.payload->>'startsAt')::timestamptz-make_interval(hours=>(rules->>'joinBeforeHours')::integer);
 closes:=(l.payload->>'startsAt')::timestamptz+make_interval(hours=>(rules->>'joinAfterHours')::integer);
 if p_join then
   if l.payload->>'status' not in ('scheduled','teacher_done','completed') or clock_timestamp()<opens or clock_timestamp()>=closes
   then raise exception 'Classroom outside join window' using errcode='PW006';end if;
   perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,80));
   if (select count(*) from public.pw_audit where actor_id=auth.uid() and entity_type='pw_classrooms'
     and action='Classroom access authorized' and created_at>clock_timestamp()-interval '1 minute')>=10
   then raise exception 'Join request rate limit' using errcode='PW429';end if;
   insert into public.pw_classrooms(lesson_id,starts_at,closes_at)
     values(l.id,(l.payload->>'startsAt')::timestamptz,closes)
     on conflict(lesson_id,starts_at) do update set closes_at=excluded.closes_at,closed_at=null
     returning id into room_id;
   insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,student_id,action,changed_fields)
   values(auth.uid(),(select name from public.pw_profiles where id=auth.uid()),role_name,'pw_classrooms',room_id::text,s.id,'Classroom access authorized',array['access']);
 end if;
 return jsonb_build_object('lesson',jsonb_build_object('id',l.id,'title',l.payload->>'title','studentName',s.payload->>'name',
   'startsAt',l.payload->>'startsAt','studentTimezone',s.payload->>'timezone','kind',l.payload->>'kind','durationMinutes',l.duration_minutes),
   'opensAt',opens,'closesAt',closes,'serverTime',clock_timestamp(),
   'joinEligible',l.payload->>'status' in ('scheduled','teacher_done','completed'),
   'joinOpen',l.payload->>'status' in ('scheduled','teacher_done','completed') and clock_timestamp()>=opens and clock_timestamp()<closes,
   'roomName',case when room_id is not null then 'pw-'||room_id::text else null end,
   'host',role_name in ('super_admin','admin','head_admin'));
end $$;
