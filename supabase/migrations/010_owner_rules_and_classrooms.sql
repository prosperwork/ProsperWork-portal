create table public.pw_settings (
 singleton boolean primary key default true check(singleton),
 revision integer not null default 1,
 settings jsonb not null,
 updated_by uuid references public.pw_profiles(id),
 updated_at timestamptz not null default now()
);
insert into public.pw_settings(settings) values('{"standardMinutes":60,"trialMinutes":60,"coverMinutes":60,"rescheduleNoticeHours":2,"adminConcurrentClasses":3,"joinBeforeHours":2,"joinAfterHours":6,"payrollWeekAnchor":"not_configured","advanceEligibility":"not_configured","vacationAutoApprove":false,"adminParentQuota":12}');
alter table public.pw_settings enable row level security;
revoke all on public.pw_settings from anon,authenticated;
grant select on public.pw_settings to authenticated;
create policy pw_settings_owner_read on public.pw_settings for select to authenticated
 using(public.pw_role()='super_admin' and public.pw_active());

create function public.pw_save_settings(p_revision integer,p_settings jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare current_row public.pw_settings; field text; v numeric;
begin
 if not coalesce(public.pw_role()='super_admin' and public.pw_active(),false) then
   raise exception 'Owner required' using errcode='42501'; end if;
 select * into current_row from public.pw_settings where singleton for update;
 if p_revision is distinct from current_row.revision then raise exception 'Settings changed' using errcode='40001';end if;
 if jsonb_typeof(p_settings) is distinct from 'object' or
 (select count(*) from jsonb_object_keys(p_settings))<>11 then raise exception 'Invalid settings' using errcode='22023';end if;
 foreach field in array array['standardMinutes','trialMinutes','coverMinutes','rescheduleNoticeHours','adminConcurrentClasses','joinBeforeHours','joinAfterHours','adminParentQuota'] loop
   if jsonb_typeof(p_settings->field) is distinct from 'number' then raise exception 'Numeric rule required' using errcode='22023';end if;
   v:=(p_settings->>field)::numeric;
   if v<>trunc(v) or
     (field in ('standardMinutes','trialMinutes','coverMinutes') and v not between 1 and 180) or
     (field='rescheduleNoticeHours' and v not between 0 and 72) or
     (field='adminConcurrentClasses' and v not between 1 and 20) or
     (field='joinBeforeHours' and v not between 0 and 2) or
     (field='joinAfterHours' and v not between 5 and 6) or
     (field='adminParentQuota' and v not between 0 and 1000)
   then raise exception 'Rule out of range' using errcode='22023';end if;
 end loop;
 if not coalesce(p_settings->>'payrollWeekAnchor' in ('not_configured','calendar_month','pay_cycle'),false)
 or not coalesce(p_settings->>'advanceEligibility' in ('not_configured','owner_selected','previous_period_verified','disabled'),false)
 or jsonb_typeof(p_settings->'vacationAutoApprove') is distinct from 'boolean'
 then raise exception 'Invalid payroll rules' using errcode='22023';end if;
 update public.pw_settings set settings=p_settings,revision=revision+1,updated_by=auth.uid(),updated_at=now() where singleton;
 update public.pw_rules set value=(p_settings->>'standardMinutes')::integer where key='lesson_minutes';
 update public.pw_rules set value=(p_settings->>'rescheduleNoticeHours')::integer where key='reschedule_notice_hours';
 update public.pw_rules set value=(p_settings->>'adminConcurrentClasses')::integer where key='admin_concurrent_classes';
 insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,action,changed_fields)
 values(auth.uid(),(select name from public.pw_profiles where id=auth.uid()),public.pw_role(),'pw_settings','academy','Academy rules changed',
 array(select key from jsonb_each(p_settings) where value is distinct from current_row.settings->key));
 return current_row.revision+1;
end $$;
revoke all on function public.pw_save_settings(integer,jsonb) from public,anon;
grant execute on function public.pw_save_settings(integer,jsonb) to authenticated;

alter table public.pw_lessons add column duration_minutes integer not null default 60 check(duration_minutes between 1 and 180);
create function public.pw_lesson_duration() returns trigger
language plpgsql security definer set search_path='' as $$
declare rule text;
begin
 if tg_op='UPDATE' then
   if new.duration_minutes is distinct from old.duration_minutes then
     raise exception 'Lesson duration snapshot is immutable' using errcode='42501';end if;
 else
   rule:=case new.payload->>'kind' when 'trial' then 'trialMinutes' when 'cover' then 'coverMinutes' else 'standardMinutes' end;
   select (settings->>rule)::integer into new.duration_minutes from public.pw_settings where singleton;
 end if;
 return new;
end $$;
create trigger pw_00_lesson_duration before insert or update on public.pw_lessons
 for each row execute function public.pw_lesson_duration();

-- Half-open intervals: adjacent classes do not clash. Count simultaneous classes,
-- not all classes that happen to intersect a long candidate interval.
create or replace function public.pw_validate_schedule() returns trigger language plpgsql security definer set search_path='' as $$
declare start_time timestamptz; end_time timestamptz; limit_count integer;
begin
 if tg_op='UPDATE' and new.teacher_id is not distinct from old.teacher_id and new.admin_id is not distinct from old.admin_id
 and new.payload->>'startsAt' is not distinct from old.payload->>'startsAt'
 and (new.payload->>'status' is not distinct from old.payload->>'status'
   or (new.payload->>'status' in ('scheduled','teacher_done','completed')
     and old.payload->>'status' in ('scheduled','teacher_done','completed'))) then return new;end if;
 if new.payload->>'status' not in ('scheduled','teacher_done','completed') then return new;end if;
 start_time:=(new.payload->>'startsAt')::timestamptz;
 end_time:=start_time+make_interval(mins=>new.duration_minutes);
 select value into limit_count from public.pw_rules where key='admin_concurrent_classes';
 if new.teacher_id is not null then perform pg_advisory_xact_lock(hashtextextended(new.teacher_id::text,77));end if;
 if new.admin_id is not null then perform pg_advisory_xact_lock(hashtextextended(new.admin_id::text,78));end if;
 if exists(select 1 from public.pw_lessons l where l.id<>new.id and l.teacher_id=new.teacher_id
   and l.payload->>'status' in ('scheduled','teacher_done','completed')
   and (l.payload->>'startsAt')::timestamptz<end_time
   and (l.payload->>'startsAt')::timestamptz+make_interval(mins=>l.duration_minutes)>start_time)
 then raise exception 'Teacher schedule conflict' using errcode='PW003';end if;
 if new.admin_id is not null and exists(
   with occupied as (
     select (l.payload->>'startsAt')::timestamptz a,
       (l.payload->>'startsAt')::timestamptz+make_interval(mins=>l.duration_minutes) b
     from public.pw_lessons l where l.id<>new.id and l.admin_id=new.admin_id
       and l.payload->>'status' in ('scheduled','teacher_done','completed')
       and (l.payload->>'startsAt')::timestamptz<end_time
       and (l.payload->>'startsAt')::timestamptz+make_interval(mins=>l.duration_minutes)>start_time
   ), moments as (select start_time t union select a from occupied where a>=start_time)
   select 1 from moments m where (select count(*) from occupied o where o.a<=m.t and o.b>m.t)>=limit_count
 ) then raise exception 'Admin concurrent class limit reached' using errcode='PW003';end if;
 return new;
end $$;

create table public.pw_classrooms (
 id uuid primary key default gen_random_uuid(),
 lesson_id text not null references public.pw_lessons(id),
 starts_at timestamptz not null,
 closes_at timestamptz not null,
 issued_at timestamptz not null default now(),
 closed_at timestamptz,
 unique(lesson_id,starts_at)
);
alter table public.pw_classrooms enable row level security;
revoke all on public.pw_classrooms from anon,authenticated;
create function public.pw_classroom_access(p_lesson text,p_join boolean default false) returns jsonb
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
   'joinOpen',l.payload->>'status' in ('scheduled','teacher_done','completed') and clock_timestamp()>=opens and clock_timestamp()<closes,
   'roomName',case when room_id is not null then 'pw-'||room_id::text else null end,
   'host',role_name in ('super_admin','admin','head_admin'));
end $$;
revoke all on function public.pw_classroom_access(text,boolean) from public,anon;
grant execute on function public.pw_classroom_access(text,boolean) to authenticated;

create function public.pw_expired_classrooms() returns table(id uuid,room_name text)
language sql security definer set search_path='' as $$
 select r.id,'pw-'||r.id::text from public.pw_classrooms r join public.pw_lessons l on l.id=r.lesson_id
 where r.closed_at is null and (r.closes_at<=clock_timestamp()
   or l.payload->>'status' not in ('scheduled','teacher_done','completed')
   or (l.payload->>'startsAt')::timestamptz<>r.starts_at)
 limit 100
$$;
create function public.pw_close_classroom(p_id uuid) returns void language sql security definer set search_path='' as $$
 update public.pw_classrooms set closed_at=clock_timestamp() where id=p_id
$$;
revoke all on function public.pw_expired_classrooms(),public.pw_close_classroom(uuid) from public,anon,authenticated;
grant execute on function public.pw_expired_classrooms(),public.pw_close_classroom(uuid) to service_role;
