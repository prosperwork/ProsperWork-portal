create table public.pw_lesson_events(
 id bigint generated always as identity primary key,lesson_id text not null,student_id text not null,
 teacher_id uuid,admin_id uuid,event text not null,starts_at timestamptz not null,payload jsonb not null,
 actor_id uuid,actor_name text not null,created_at timestamptz not null default now()
);
create index pw_lesson_events_child_date on public.pw_lesson_events(student_id,starts_at,created_at desc);
alter table public.pw_lesson_events enable row level security;
revoke all on public.pw_lesson_events from anon,authenticated;
grant select on public.pw_lesson_events to authenticated;
create policy pw_lesson_event_read on public.pw_lesson_events for select to authenticated using(public.pw_can_student(student_id));
create function public.pw_capture_lesson_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare action text;
begin
 if tg_op='INSERT' then action:=new.payload->>'status';
 elsif new.payload=old.payload and new.teacher_id is not distinct from old.teacher_id and new.admin_id is not distinct from old.admin_id then return new;
 elsif new.payload->>'startsAt' is distinct from old.payload->>'startsAt' then action:='rescheduled';
 elsif new.payload->>'status' is distinct from old.payload->>'status' then action:=new.payload->>'status';
 elsif new.teacher_id is distinct from old.teacher_id or new.admin_id is distinct from old.admin_id then action:='assignment_changed';
 else action:='notes_updated';end if;
 insert into public.pw_lesson_events(lesson_id,student_id,teacher_id,admin_id,event,starts_at,payload,actor_id,actor_name)
 values(new.id,new.student_id,new.teacher_id,new.admin_id,action,(new.payload->>'startsAt')::timestamptz,new.payload,
 auth.uid(),coalesce((select name from public.pw_profiles where id=auth.uid()),'System setup'));
 return new;
end $$;
create trigger pw_lesson_event after insert or update on public.pw_lessons for each row execute function public.pw_capture_lesson_event();
insert into public.pw_lesson_events(lesson_id,student_id,teacher_id,admin_id,event,starts_at,payload,actor_name,created_at)
select id,student_id,teacher_id,admin_id,'existing_record',(payload->>'startsAt')::timestamptz,payload,'Existing record',updated_at from public.pw_lessons;
create function public.pw_protect_lesson_event() returns trigger language plpgsql as $$
begin raise exception 'Historical lesson versions are permanent' using errcode='42501';end $$;
create trigger pw_event_immutable before update or delete on public.pw_lesson_events for each row execute function public.pw_protect_lesson_event();
create function public.pw_completion_time_guard() returns trigger language plpgsql as $$
begin
 if new.payload->>'status' in ('teacher_done','completed') and (new.payload->>'startsAt')::timestamptz>clock_timestamp() then
   raise exception 'A future class cannot be marked done' using errcode='PW005';
 end if;
 return new;
end $$;
create trigger pw_completion_time before insert or update on public.pw_lessons for each row execute function public.pw_completion_time_guard();
create function public.pw_lesson_history(p_student text,p_month text,p_page integer default 1) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;total_count bigint;available_months jsonb;
begin
 if not coalesce(public.pw_can_student(p_student),false) then raise exception 'Child not accessible' using errcode='42501';end if;
 if p_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_page<1 or p_page>100000 then raise exception 'Invalid history query' using errcode='22023';end if;
 select count(*) into total_count from public.pw_lesson_events
 where student_id=p_student and to_char(starts_at at time zone (payload->>'studentTimezone'),'YYYY-MM')=p_month;
 select coalesce(jsonb_agg(row_data order by created_at desc,id desc),'[]') into result from (
 select id,event,starts_at,created_at,actor_name,payload from public.pw_lesson_events
 where student_id=p_student and to_char(starts_at at time zone (payload->>'studentTimezone'),'YYYY-MM')=p_month
 order by created_at desc,id desc limit 25 offset ((p_page-1)*25)
 ) row_data;
 select coalesce(jsonb_agg(history_month order by history_month desc),'[]') into available_months from (
 select distinct to_char(starts_at at time zone (payload->>'studentTimezone'),'YYYY-MM') as history_month from public.pw_lesson_events where student_id=p_student
 ) month_data;
 return jsonb_build_object('events',result,'total',total_count,'months',available_months);
end $$;
revoke all on function public.pw_lesson_history(text,text,integer) from public,anon;
grant execute on function public.pw_lesson_history(text,text,integer) to authenticated;
