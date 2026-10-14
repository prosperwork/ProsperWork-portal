create table public.pw_practice(
 id uuid primary key default gen_random_uuid(),student_id text not null references public.pw_students(id),
 created_by uuid not null references public.pw_profiles(id),started_at timestamptz not null default clock_timestamp(),
 resumed_at timestamptz,seconds integer not null default 0,status text not null check(status in('running','paused','complete')),
 ended_at timestamptz,game_score integer,game_total integer
);
create unique index pw_one_practice on public.pw_practice(student_id,created_by) where status<>'complete';
create table public.pw_learning_requests(
 id uuid primary key default gen_random_uuid(),student_id text not null references public.pw_students(id),
 lesson_id text references public.pw_lessons(id),kind text not null check(kind in('song','tutor','message','class_not_started')),
 body text not null,created_by uuid not null references public.pw_profiles(id),created_at timestamptz not null default clock_timestamp(),
 status text not null default 'open' check(status in('open','in_progress','resolved','rejected')),
 handled_by uuid references public.pw_profiles(id),updated_at timestamptz not null default clock_timestamp()
);
create table public.pw_learning_replies(
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.pw_learning_requests(id),
 created_by uuid not null references public.pw_profiles(id),body text not null,created_at timestamptz not null default clock_timestamp()
);
create table public.pw_evaluations(
 id uuid primary key default gen_random_uuid(),student_id text not null references public.pw_students(id),
 educator_id uuid not null references public.pw_profiles(id),title text not null,scores jsonb not null,
 notes text not null,created_at timestamptz not null default clock_timestamp()
);
do $migration$
declare t text;
begin
 foreach t in array array['pw_practice','pw_learning_requests','pw_learning_replies','pw_evaluations'] loop
 execute format('alter table public.%I enable row level security;revoke all on public.%I from anon,authenticated;grant select on public.%I to authenticated',t,t,t);
 execute format('create policy pw_session_gate on public.%I as restrictive for all to authenticated using(public.pw_portal_allowed()) with check(public.pw_portal_allowed())',t);
 end loop;
end;
$migration$;
create policy pw_practice_read on public.pw_practice for select to authenticated using(public.pw_can_student(student_id) and public.pw_role() in('super_admin','teacher','qc','parent','student'));
create policy pw_request_read on public.pw_learning_requests for select to authenticated using(
 public.pw_role() in('super_admin','head_admin') or(public.pw_can_student(student_id) and public.pw_role() in('admin','teacher','qc','parent','student')));
create policy pw_reply_read on public.pw_learning_replies for select to authenticated using(exists(select 1 from public.pw_learning_requests r where r.id=request_id));
create policy pw_evaluation_read on public.pw_evaluations for select to authenticated using(public.pw_can_student(student_id) and public.pw_role() in('super_admin','teacher','qc','parent','student'));

create function public.pw_practice_action(p_action text,p_student text default null,p_id uuid default null,p_answers integer[] default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare v public.pw_practice; elapsed integer;result uuid;correct integer:=0;bank integer[]:=array[4,2,3,8,1,6];i integer;
begin
 if not public.pw_active() or public.pw_role() not in('parent','student') then raise exception 'Family practice only' using errcode='42501';end if;
 if p_action='start' then
  if not public.pw_can_student(p_student) then raise exception 'Linked learner required' using errcode='42501';end if;
  insert into public.pw_practice(student_id,created_by,resumed_at,status) values(p_student,auth.uid(),clock_timestamp(),'running') returning id into result;return result;
 end if;
 select * into v from public.pw_practice where id=p_id and created_by=auth.uid() for update;
 if v.id is null or v.status='complete' or not public.pw_can_student(v.student_id) then raise exception 'Active own practice required' using errcode='42501';end if;
 elapsed:=v.seconds+case when v.status='running' then least(7200,greatest(0,floor(extract(epoch from(clock_timestamp()-v.resumed_at)))))::integer else 0 end;
 if p_action='pause' and v.status='running' then update public.pw_practice set seconds=elapsed,status='paused',resumed_at=null where id=v.id;
 elsif p_action='resume' and v.status='paused' then update public.pw_practice set status='running',resumed_at=clock_timestamp() where id=v.id;
 elsif p_action in('finish','quiz') then
  if p_action='quiz' then
   if coalesce(array_length(p_answers,1),0)<>6 then raise exception 'Six answers required' using errcode='22023';end if;
   for i in 1..6 loop if p_answers[i]=bank[i] then correct:=correct+1;end if;end loop;
  end if;
  update public.pw_practice set seconds=least(elapsed,7200),status='complete',resumed_at=null,ended_at=clock_timestamp(),
   game_score=case when p_action='quiz' then correct end,game_total=case when p_action='quiz' then 6 end where id=v.id;
 else raise exception 'Invalid practice transition' using errcode='22023';end if;
 return v.id;
end $$;
revoke all on function public.pw_practice_action(text,text,uuid,integer[]) from public,anon;
grant execute on function public.pw_practice_action(text,text,uuid,integer[]) to authenticated;

create function public.pw_learning_request(p_action text,p_student text default null,p_id uuid default null,p_kind text default null,p_body text default null,p_status text default null,p_lesson text default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.pw_learning_requests;s public.pw_students;result uuid;family boolean:=public.pw_role() in('parent','student');
begin
 if not public.pw_active() or length(trim(coalesce(p_body,''))) not between 2 and 4000 then raise exception 'Active account and written message required' using errcode='42501';end if;
 if p_action='create' then
  if not family or not public.pw_can_student(p_student) or p_kind not in('song','tutor','message','class_not_started') then raise exception 'Linked family request required' using errcode='42501';end if;
  if p_kind='class_not_started' and not exists(select 1 from public.pw_lessons where id=p_lesson and student_id=p_student
   and (payload->>'startsAt')::timestamptz<=now() and (payload->>'startsAt')::timestamptz>now()-interval '3 hours'
   and payload->>'status' in('scheduled','teacher_done'))
  then raise exception 'Report only a currently due unverified class' using errcode='22023';end if;
  insert into public.pw_learning_requests(student_id,lesson_id,kind,body,created_by) values(p_student,case when p_kind='class_not_started' then p_lesson end,p_kind,p_body,auth.uid()) returning id into result;
  return result;
 end if;
 select * into r from public.pw_learning_requests where id=p_id for update;
 if r.id is null or not (public.pw_role() in('super_admin','head_admin') or public.pw_can_student(r.student_id)) or public.pw_role() not in('super_admin','head_admin','admin','teacher','qc','parent','student')
 then raise exception 'Request not assigned to you' using errcode='42501';end if;
 if p_action='reply' then
  insert into public.pw_learning_replies(request_id,created_by,body) values(r.id,auth.uid(),p_body);return r.id;
 elsif p_action='decide' then
  if family or p_status not in('in_progress','resolved','rejected') or r.status in('resolved','rejected') then raise exception 'Staff decision required' using errcode='42501';end if;
  if r.kind in('message','tutor','class_not_started') and public.pw_role() not in('super_admin','head_admin','admin') then raise exception 'Assigned administrator handles this queue' using errcode='42501';end if;
  update public.pw_learning_requests set status=p_status,handled_by=auth.uid(),updated_at=clock_timestamp() where id=r.id;
  insert into public.pw_learning_replies(request_id,created_by,body) values(r.id,auth.uid(),p_body);return r.id;
 end if;
 raise exception 'Invalid request action' using errcode='22023';
end $$;
revoke all on function public.pw_learning_request(text,text,uuid,text,text,text,text) from public,anon;
grant execute on function public.pw_learning_request(text,text,uuid,text,text,text,text) to authenticated;
create function public.pw_evaluate(p_student text,p_title text,p_scores jsonb,p_notes text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not public.pw_active() or public.pw_role() not in('super_admin','teacher','qc') or not public.pw_can_student(p_student)
 then raise exception 'Assigned educator required' using errcode='42501';end if;
 if length(p_title) not between 3 and 150 or length(p_notes)>4000 or jsonb_typeof(p_scores)<>'object'
 or (select count(*) from jsonb_each(p_scores)) not between 1 and 8
 or exists(select 1 from jsonb_each(p_scores) where length(key) not between 2 and 60 or jsonb_typeof(value)<>'number' or (value::text)::numeric not between 0 and 100)
 then raise exception 'Named rubric scores must be 0–100' using errcode='22023';end if;
 insert into public.pw_evaluations(student_id,educator_id,title,scores,notes) values(p_student,auth.uid(),p_title,p_scores,p_notes) returning id into result;return result;
end $$;
revoke all on function public.pw_evaluate(text,text,jsonb,text) from public,anon;
grant execute on function public.pw_evaluate(text,text,jsonb,text) to authenticated;
alter table public.pw_files drop constraint pw_files_category_check;
alter table public.pw_files add constraint pw_files_category_check check(category in('receipt','homework','curriculum','policy','avatar','practice'));
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.pw_file_allowed(text,text,boolean)'::regprocedure) into definition;
 definition:=replace(definition,'else false end,false)',$extra$
 when p_category='practice' then exists(select 1 from public.pw_practice s where s.id::text=p_target and public.pw_can_student(s.student_id)
  and public.pw_role() in('super_admin','teacher','qc','parent','student') and(not p_write or s.created_by=auth.uid()))
 else false end,false)$extra$);
 execute definition;
end;
$migration$;
create function public.pw_finish_practice_file(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare f public.pw_files;
begin
 select * into f from public.pw_files where id=p_id for update;
 if f.id is null or f.complete or f.category<>'practice' or f.uploader_id<>auth.uid() or not public.pw_file_allowed(f.category,f.target_id,true)
 then raise exception 'Own practice upload required' using errcode='42501';end if;
 if not exists(select 1 from storage.objects where bucket_id='pw-private' and name=f.path and (metadata->>'size')::bigint=f.bytes and metadata->>'mimetype'=f.mime)
 then raise exception 'Actual stored recording required' using errcode='22023';end if;
 update public.pw_files set complete=true where id=f.id;
end $$;
revoke all on function public.pw_finish_practice_file(uuid) from public,anon;
grant execute on function public.pw_finish_practice_file(uuid) to authenticated;
create table public.pw_repertoire_events(
 id uuid primary key default gen_random_uuid(),student_id text not null references public.pw_students(id),
 educator_id uuid not null references public.pw_profiles(id),song text not null,operation text not null check(operation in('plan','complete')),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.pw_repertoire_events enable row level security;
revoke all on public.pw_repertoire_events from anon,authenticated;
grant select on public.pw_repertoire_events to authenticated;
create policy pw_repertoire_read on public.pw_repertoire_events for select to authenticated using(public.pw_portal_allowed() and public.pw_can_student(student_id) and public.pw_role() in('super_admin','teacher','qc','parent','student'));
create function public.pw_repertoire(p_student text,p_song text,p_operation text) returns void language plpgsql security definer set search_path='' as $$
declare s public.pw_students;todo jsonb;done jsonb;
begin
 if not public.pw_active() or public.pw_role() not in('super_admin','teacher','qc') or not public.pw_can_student(p_student)
 then raise exception 'Assigned educator required' using errcode='42501';end if;
 if length(trim(p_song)) not between 2 and 150 or p_operation not in('plan','complete') then raise exception 'Valid song and action required' using errcode='22023';end if;
 select * into s from public.pw_students where id=p_student for update;
 if s.id is null then raise exception 'Learner missing' using errcode='22023';end if;
 todo:=coalesce(s.payload->'songsToDo','[]');done:=coalesce(s.payload->'songsDone','[]');
 if p_operation='complete' then
  if done ? p_song then return;end if;
  select coalesce(jsonb_agg(value),'[]') into todo from jsonb_array_elements(todo) where value<>to_jsonb(p_song);
  done:=done||jsonb_build_array(p_song);
 else
  if todo ? p_song or done ? p_song then return;end if;
  todo:=todo||jsonb_build_array(p_song);
 end if;
 update public.pw_students set payload=jsonb_set(jsonb_set(payload,'{songsToDo}',todo),'{songsDone}',done) where id=p_student;
 insert into public.pw_repertoire_events(student_id,educator_id,song,operation) values(p_student,auth.uid(),p_song,p_operation);
end $$;
revoke all on function public.pw_repertoire(text,text,text) from public,anon;
grant execute on function public.pw_repertoire(text,text,text) to authenticated;
