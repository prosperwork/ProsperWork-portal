create table public.pw_management_rules(
 singleton boolean primary key default true check(singleton),
 stagnant_days integer not null default 30 check(stagnant_days between 1 and 365),
 empty_board_classes integer not null default 2 check(empty_board_classes between 1 and 10),
 followup_hours integer not null default 24 check(followup_hours between 1 and 168),
 escalation_hours integer not null default 24 check(escalation_hours between 1 and 168),
 late_grace_minutes integer not null default 5 check(late_grace_minutes between 0 and 60)
);
insert into public.pw_management_rules(singleton) values(true);
alter table public.pw_management_rules enable row level security;
revoke all on public.pw_management_rules from anon,authenticated;
grant select on public.pw_management_rules to authenticated;
create policy pw_management_rules_read on public.pw_management_rules for select to authenticated using(public.pw_active());

create table public.pw_teacher_roster_history(
 id uuid primary key default gen_random_uuid(),student_id text not null references public.pw_students(id),
 teacher_id uuid references public.pw_profiles(id),active boolean not null,
 starts_at timestamptz not null default now(),ends_at timestamptz,
 check(ends_at is null or ends_at>=starts_at)
);
create unique index pw_one_teacher_roster_state on public.pw_teacher_roster_history(student_id) where ends_at is null;
insert into public.pw_teacher_roster_history(student_id,teacher_id,active)
 select id,teacher_id,payload->>'status'='active' from public.pw_students;
alter table public.pw_teacher_roster_history enable row level security;
revoke all on public.pw_teacher_roster_history from anon,authenticated;
grant select on public.pw_teacher_roster_history to authenticated;
create policy pw_teacher_roster_read on public.pw_teacher_roster_history for select to authenticated
 using(public.pw_active() and(public.pw_role()='super_admin' or teacher_id=auth.uid()
 or(public.pw_role()='qc' and exists(select 1 from public.pw_profiles where id=teacher_id and qc_id=auth.uid()))));

create function public.pw_teacher_roster_track() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.teacher_id is not distinct from old.teacher_id and new.payload->>'status' is not distinct from old.payload->>'status' then return new;end if;
 update public.pw_teacher_roster_history set ends_at=clock_timestamp() where student_id=new.id and ends_at is null;
 insert into public.pw_teacher_roster_history(student_id,teacher_id,active)
 values(new.id,new.teacher_id,new.payload->>'status'='active');
 return new;
end $$;
create trigger pw_teacher_roster_history after insert or update on public.pw_students for each row execute function public.pw_teacher_roster_track();

-- Observed attendance and cohort retention are never invented from a "Done"
-- timestamp or a current roster that lacks historical evidence.
create or replace function public.pw_quality_snapshot() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
 'staffId',t.id,'name',t.name,
 'activeStudents',(select count(*) from public.pw_students where teacher_id=t.id and payload->>'status'='active'),
 'verifiedLessons',(select count(*) from public.pw_lessons where teacher_id=t.id and verified_at>=now()-interval '30 days'),
 'missedLessons',(select count(*) from public.pw_lessons where teacher_id=t.id and(payload->>'startsAt')::timestamptz between now()-interval '30 days' and now() and payload->>'status'='missed'),
 'emptyBoards',(select count(*) from public.pw_lessons l left join public.pw_lesson_boards b on b.lesson_id=l.id
  where l.teacher_id=t.id and l.verified_at>=now()-interval '30 days'
  and(b.lesson_id is null or(trim(b.notes)='' and trim(b.next_topics)='' and jsonb_array_length(b.completed_topics)=0))),
 'observedClasses',(select count(*) from public.pw_classroom_presence p join public.pw_classrooms c on c.id=p.room_id where p.user_id=t.id and c.starts_at>=now()-interval '30 days'),
 'punctualPercent',(select round(100.0*count(*) filter(where p.joined_at<=c.starts_at+make_interval(mins=>rules.late_grace_minutes))/nullif(count(*),0),1)
  from public.pw_classroom_presence p join public.pw_classrooms c on c.id=p.room_id where p.user_id=t.id and c.starts_at>=now()-interval '30 days'),
 'retentionPercent',case when exists(select 1 from public.pw_teacher_roster_history where teacher_id=t.id and starts_at<=now()-interval '30 days') then
  (select round(100.0*count(*) filter(where exists(select 1 from public.pw_students s where s.id=h.student_id and s.teacher_id=t.id and s.payload->>'status'='active'))/nullif(count(*),0),1)
   from public.pw_teacher_roster_history h where h.teacher_id=t.id and h.active and h.starts_at<=now()-interval '30 days' and(h.ends_at is null or h.ends_at>now()-interval '30 days'))
  else null end,
 'score',(select round(avg(score),1) from public.pw_quality_observations where staff_id=t.id and created_at>=now()-interval '30 days')
 )),'[]') from public.pw_profiles t cross join public.pw_management_rules rules
 where public.pw_active() and t.role in('teacher','qc')
 and(public.pw_role()='super_admin' or t.id=auth.uid() or(public.pw_role()='qc' and t.qc_id=auth.uid()))
$$;

alter function public.pw_management_action(text,jsonb) rename to pw_management_action_base;
create function public.pw_management_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_action='rules' then
  if not coalesce(public.pw_active() and public.pw_role()='super_admin',false) then raise exception 'Owner required' using errcode='42501';end if;
  if length(trim(p_data->>'notes'))<5 then raise exception 'Reason required' using errcode='22023';end if;
  update public.pw_management_rules set stagnant_days=(p_data->>'stagnantDays')::integer,empty_board_classes=(p_data->>'emptyBoardClasses')::integer,
   followup_hours=(p_data->>'followupHours')::integer,escalation_hours=(p_data->>'escalationHours')::integer,late_grace_minutes=(p_data->>'lateGraceMinutes')::integer;
  insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,action,changed_fields)
  values(auth.uid(),(select name from public.pw_profiles where id=auth.uid()),'super_admin','management_rules','singleton','Rules updated: '||trim(p_data->>'notes'),array['rules']);
  return jsonb_build_object('updated',true);
 end if;
 return public.pw_management_action_base(p_action,p_data);
end $$;
revoke all on function public.pw_management_action_base(text,jsonb),public.pw_management_action(text,jsonb) from public,anon;
revoke all on function public.pw_management_action_base(text,jsonb) from authenticated;
grant execute on function public.pw_management_action(text,jsonb) to authenticated;

alter function public.pw_management_snapshot() rename to pw_management_snapshot_base;
create function public.pw_management_snapshot() returns jsonb language sql stable security definer set search_path='' as $$
 select public.pw_management_snapshot_base()||jsonb_build_object('rules',(select to_jsonb(r)-'singleton' from public.pw_management_rules r))
$$;
revoke all on function public.pw_management_snapshot_base(),public.pw_management_snapshot() from public,anon;
revoke all on function public.pw_management_snapshot_base() from authenticated;
grant execute on function public.pw_management_snapshot() to authenticated;

create or replace function public.pw_sales_followup_notice() returns trigger language plpgsql security definer set search_path='' as $$
declare task uuid;hours integer;
begin
 select followup_hours into hours from public.pw_management_rules;
 if new.trial_verified_at is not null and old.trial_verified_at is null and new.owner_id is not null then
  insert into public.pw_desk_items(kind,lead_id,assigned_to,created_by,due_at,notes,dedup_key)
  values('conversion_followup',new.id,new.owner_id,new.owner_id,new.trial_verified_at+make_interval(hours=>hours),
   'Follow up after the verified trial, share approved policies and record the family decision.','trial-followup:'||new.id)
  on conflict(dedup_key) do nothing returning id into task;
  if task is not null then
   perform public.pw_queue_notice('trial:'||task||':verified',new.owner_id,'Trial completed and verified','Follow up with the family; the configured conversion check-in is now scheduled.','pw_desk_items',task::text);
   perform public.pw_queue_notice('trial:'||task||':due',new.owner_id,'Trial conversion check-in is due','Record the family response and proceed with approved policy and Finance handoff.','pw_desk_items',task::text,new.trial_verified_at+make_interval(hours=>hours));
  end if;
 end if;
 return new;
end $$;

create function public.pw_reconcile_management() returns integer language plpgsql security definer set search_path='' as $$
declare student public.pw_students;req record;recipient uuid;task uuid;k text;latest text;count_empty integer;rule public.pw_management_rules;
begin
 select * into rule from public.pw_management_rules;
 for student in select * from public.pw_students where payload->>'status'='active' loop
  select l.id into latest from public.pw_lessons l where l.student_id=student.id and l.teacher_id=student.teacher_id and l.verified_at is not null order by l.verified_at desc limit 1;
  select count(*) into count_empty from(
   select l.id,b.notes,b.next_topics,b.completed_topics from public.pw_lessons l left join public.pw_lesson_boards b on b.lesson_id=l.id
   where l.student_id=student.id and l.teacher_id=student.teacher_id and l.verified_at is not null order by l.verified_at desc limit rule.empty_board_classes
  ) q where q.notes is null or(trim(q.notes)='' and trim(q.next_topics)='' and jsonb_array_length(q.completed_topics)=0);
  k:=null;
  if count_empty=rule.empty_board_classes then k:='empty-board:'||student.id||':'||latest;
  elsif exists(select 1 from public.pw_song_activity a where a.student_id=student.id and greatest(a.observed_since,coalesce(a.last_change,a.observed_since))<=now()-make_interval(days=>rule.stagnant_days))
   then k:='stagnant-songs:'||student.id||':'||(select coalesce(last_change,observed_since)::text from public.pw_song_activity where student_id=student.id);
  end if;
  if k is null then continue;end if;
  select coalesce(qc_id,(select id from public.pw_profiles where role='super_admin' and status='active' limit 1)) into recipient from public.pw_profiles where id=student.teacher_id;
  if recipient is null then continue;end if;
  insert into public.pw_desk_items(kind,student_id,staff_id,assigned_to,created_by,due_at,notes,dedup_key)
  values('quality_alert',student.id,student.teacher_id,recipient,recipient,now(),
   case when k like 'empty-board:%' then 'Consecutive verified classes have empty lesson boards. Review and coach the assigned teacher.'
    else 'The song bank has no recorded changes during the configured monitoring period. Review lesson continuity.' end,k)
  on conflict(dedup_key) do nothing returning id into task;
  if task is not null then perform public.pw_queue_notice('quality:'||task,recipient,'Teaching continuity needs review','Review the private QC alert and the original lesson evidence.','pw_desk_items',task::text);end if;
 end loop;
 for req in select q.* from public.pw_learning_requests q where q.kind in('message','class_not_started') and q.status='open'
  and(q.kind='class_not_started' or q.created_at<=now()-make_interval(hours=>rule.escalation_hours)) loop
  select coalesce(p.head_admin_id,(select id from public.pw_profiles where role='super_admin' and status='active' limit 1))
   into recipient from public.pw_students s left join public.pw_profiles p on p.id=s.admin_id where s.id=req.student_id;
  if recipient is null then continue;end if;
  insert into public.pw_desk_items(kind,student_id,assigned_to,created_by,due_at,notes,dedup_key)
  values('priority',req.student_id,recipient,req.created_by,now(),'Parent request needs senior review: '||left(req.body,3900),'escalation:'||req.id)
  on conflict(dedup_key) do nothing returning id into task;
  if task is not null then perform public.pw_queue_notice('escalation:'||task,recipient,'Parent escalation needs attention','A linked family has an unresolved request or class-not-started report. Review it in the private management workspace.','pw_desk_items',task::text);end if;
 end loop;
 return 1;
end $$;
revoke all on function public.pw_reconcile_management() from public,anon,authenticated;
grant execute on function public.pw_reconcile_management() to service_role;
notify pgrst,'reload schema';
