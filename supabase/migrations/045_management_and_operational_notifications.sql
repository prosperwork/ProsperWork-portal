-- Scoped departmental work, not a second copy of scheduling or finance.
create table public.pw_desk_items(
 id uuid primary key default gen_random_uuid(),kind text not null,
 student_id text references public.pw_students(id),lead_id text references public.pw_leads(id),
 staff_id uuid references public.pw_profiles(id),assigned_to uuid not null references public.pw_profiles(id),
 created_by uuid not null references public.pw_profiles(id),due_at timestamptz not null,
 slots jsonb not null default '[]',notes text not null check(length(trim(notes)) between 5 and 4000),
 status text not null default 'open' check(status in('open','in_progress','completed','cancelled')),
 revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 dedup_key text unique
);
create index pw_desk_due on public.pw_desk_items(assigned_to,status,due_at);
create table public.pw_desk_history(
 id uuid primary key default gen_random_uuid(),item_id uuid not null references public.pw_desk_items(id),
 actor_id uuid not null references public.pw_profiles(id),status text not null,notes text not null,
 revision integer not null,created_at timestamptz not null default now()
);
create table public.pw_announcements(
 id uuid primary key default gen_random_uuid(),created_by uuid not null references public.pw_profiles(id),
 title text not null,body text not null,roles jsonb not null,expires_at timestamptz not null,
 archived_at timestamptz,created_at timestamptz not null default now()
);
create table public.pw_emergency_covers(
 id uuid primary key default gen_random_uuid(),lesson_id text not null references public.pw_lessons(id),
 student_id text not null references public.pw_students(id),
 original_teacher uuid references public.pw_profiles(id),original_admin uuid references public.pw_profiles(id),
 teacher_id uuid not null references public.pw_profiles(id),admin_id uuid not null references public.pw_profiles(id),
 starts_at timestamptz not null,ends_at timestamptz not null,
 created_by uuid not null references public.pw_profiles(id),reason text not null,created_at timestamptz not null default now(),
 superseded_at timestamptz
);
create table public.pw_classroom_presence(
 room_id uuid not null references public.pw_classrooms(id),user_id uuid not null references public.pw_profiles(id),
 joined_at timestamptz not null,observed_at timestamptz not null default now(),primary key(room_id,user_id)
);
create table public.pw_song_activity(
 student_id text primary key references public.pw_students(id),observed_since timestamptz not null default now(),
 last_change timestamptz
);
insert into public.pw_song_activity(student_id) select id from public.pw_students;

create function public.pw_desk_visible(p_item public.pw_desk_items) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(public.pw_active() and (
 public.pw_role()='super_admin' or p_item.created_by=auth.uid() or p_item.assigned_to=auth.uid()
 or(public.pw_role()='head_admin' and(
   exists(select 1 from public.pw_profiles where id in(p_item.assigned_to,p_item.staff_id) and head_admin_id=auth.uid())
   or exists(select 1 from public.pw_students s join public.pw_profiles a on a.id=s.admin_id where s.id=p_item.student_id and a.head_admin_id=auth.uid())))
 or(public.pw_role()='qc' and exists(select 1 from public.pw_profiles where id=p_item.staff_id and qc_id=auth.uid()))
 ),false)
$$;
do $$ declare t text;begin
 foreach t in array array['pw_desk_items','pw_desk_history','pw_announcements','pw_emergency_covers','pw_classroom_presence','pw_song_activity'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy pw_desk_read on public.pw_desk_items for select to authenticated using(public.pw_desk_visible(pw_desk_items));
create policy pw_desk_history_read on public.pw_desk_history for select to authenticated
 using(exists(select 1 from public.pw_desk_items d where d.id=item_id and public.pw_desk_visible(d)));
create policy pw_announcement_read on public.pw_announcements for select to authenticated
 using(public.pw_active() and(public.pw_role()='super_admin' or(archived_at is null and expires_at>now() and roles ? public.pw_role())));
create policy pw_emergency_read on public.pw_emergency_covers for select to authenticated
 using(public.pw_active() and public.pw_can_student(student_id));
create policy pw_presence_read on public.pw_classroom_presence for select to authenticated
 using(public.pw_active() and exists(select 1 from public.pw_classrooms r join public.pw_lessons l on l.id=r.lesson_id
 where r.id=room_id and public.pw_can_student(l.student_id)));
create policy pw_song_activity_read on public.pw_song_activity for select to authenticated using(public.pw_active() and public.pw_can_student(student_id));

-- Cover access is bounded to one actual class. Changing the regular roster or
-- confirming attendance still uses existing native functions and guards.
create or replace function public.pw_can_student(target text) returns boolean language sql stable security definer set search_path='' as $$
 select public.pw_role() in('super_admin','general_manager') or exists(
  select 1 from public.pw_students s left join public.pw_profiles a on a.id=s.admin_id left join public.pw_profiles t on t.id=s.teacher_id
  where s.id=target and(auth.uid() in(s.parent_id,s.student_user_id,s.teacher_id,s.admin_id)
   or(public.pw_role()='head_admin' and a.head_admin_id=auth.uid())
   or(public.pw_role()='qc' and t.qc_id=auth.uid())))
 or exists(select 1 from public.pw_leave_covers c join public.pw_leaves v on v.id=c.leave_id
  join public.pw_students s on s.id=c.student_id where c.student_id=target and c.cover_id=auth.uid()
  and(case c.duty when 'teacher' then s.teacher_id else s.admin_id end)=c.original_id
  and v.state in('approved','active') and clock_timestamp()>=v.starts_at and clock_timestamp()<v.ends_at)
 or exists(
  select 1 from public.pw_emergency_covers c join public.pw_lessons l on l.id=c.lesson_id
  where c.student_id=target and c.superseded_at is null and clock_timestamp()>=c.starts_at and clock_timestamp()<c.ends_at
  and auth.uid() in(c.teacher_id,c.admin_id) and l.teacher_id=c.teacher_id and l.admin_id=c.admin_id)
$$;
grant execute on function public.pw_can_student(text) to authenticated,service_role;

create function public.pw_queue_notice(p_key text,p_recipient uuid,p_subject text,p_body text,p_source text,p_id text,p_at timestamptz default now())
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_recipient is null then return;end if;
 insert into public.pw_emails(dedup_key,recipient_id,category,subject,template,payload,source_table,source_id,scheduled_at)
 values(p_key,p_recipient,'admin',p_subject,'academy_notice',jsonb_build_object('body',p_body),p_source,p_id,p_at)
 on conflict(dedup_key) do nothing;
end $$;
revoke all on function public.pw_queue_notice(text,uuid,text,text,text,text,timestamptz) from public,anon,authenticated;

create function public.pw_management_action(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r text:=public.pw_role();actor uuid:=auth.uid();d public.pw_desk_items;s public.pw_students;l public.pw_lessons;
 target uuid;head uuid;newid uuid;note text:=trim(p_data->>'notes');k text;at_time timestamptz;slot jsonb;source_lead public.pw_leads;
begin
 if not coalesce(public.pw_active(),false) then raise exception 'Active account required' using errcode='42501';end if;
 if length(coalesce(note,'')) not between 5 and 4000 and p_action<>'announcement'
 then raise exception 'Written reason required' using errcode='22023';end if;
 if p_action='create' then
  k:=p_data->>'kind';target:=(p_data->>'assignedTo')::uuid;at_time:=(p_data->>'at')::timestamptz;
  if at_time is null or at_time<now()-interval '1 minute' or at_time>now()+interval '366 days'
   or not exists(select 1 from public.pw_profiles where id=target and status='active')
  then raise exception 'Active recipient and valid future date required' using errcode='22023';end if;
  if k in('trial_request','callback','nursery') then
   select * into source_lead from public.pw_leads where id=p_data->>'leadId';
   if r not in('super_admin','head_admin','sales_marketing') or source_lead.id is null
    or(r='sales_marketing' and source_lead.owner_id is distinct from actor)
   then raise exception 'Assigned Sales lead required' using errcode='42501';end if;
   if k='trial_request' then
    if not exists(select 1 from public.pw_profiles where id=target and role in('head_admin','super_admin'))
     or jsonb_typeof(p_data->'slots')<>'array' or jsonb_array_length(p_data->'slots') not between 1 and 10
    then raise exception 'Head assignment and preferred dates required' using errcode='22023';end if;
    for slot in select value from jsonb_array_elements(p_data->'slots') loop
     if (slot#>>'{}')::timestamptz<=now() then raise exception 'Future dates required' using errcode='22023';end if;
    end loop;
   elsif not exists(select 1 from public.pw_profiles where id=target and role='sales_marketing')
    or(target is distinct from source_lead.owner_id and r='sales_marketing') then raise exception 'Assigned Sales follow-up only' using errcode='42501';end if;
  elsif k in('winback','exit_feedback','dispute','priority') then
   select * into s from public.pw_students where id=p_data->>'studentId';
   if s.id is null or not public.pw_can_student(s.id)
    or r not in('super_admin','head_admin','admin','parent','sales_marketing')
   then raise exception 'Linked family required' using errcode='42501';end if;
   if k in('winback','exit_feedback') then
    if r not in('super_admin','head_admin') or not exists(select 1 from public.pw_profiles where id=target and role='sales_marketing')
    then raise exception 'Head routes to Sales' using errcode='42501';end if;
   elsif not exists(select 1 from public.pw_profiles p join public.pw_profiles a on a.id=s.admin_id
     where p.id=target and(p.role='super_admin' or(p.role='head_admin' and a.head_admin_id=p.id)))
   then raise exception 'Assigned senior manager required' using errcode='42501';end if;
  elsif k in('monthly_report','shadow_request','personal_teaching') then
   if r not in('super_admin','head_admin','admin','qc') then raise exception 'Management or QC required' using errcode='42501';end if;
   if k='monthly_report' then
    if r='admin' and not exists(select 1 from public.pw_profiles where id=actor and head_admin_id=target)
    then raise exception 'Assigned Head required' using errcode='42501';end if;
    if not exists(select 1 from public.pw_profiles where id=target and role in('super_admin','head_admin')) then raise exception 'Senior reviewer required' using errcode='22023';end if;
   else
    select * into s from public.pw_students where id=p_data->>'studentId';
    if s.id is null or not public.pw_can_student(s.id) or(r='qc' and not exists(select 1 from public.pw_profiles where id=s.teacher_id and qc_id=actor) and s.teacher_id<>actor)
    then raise exception 'Assigned teaching roster required' using errcode='42501';end if;
    if target<>actor and r='qc' then raise exception 'Own QC task only' using errcode='42501';end if;
   end if;
  else raise exception 'Unknown case kind' using errcode='22023';end if;
  insert into public.pw_desk_items(kind,student_id,lead_id,staff_id,assigned_to,created_by,due_at,slots,notes)
  values(k,p_data->>'studentId',p_data->>'leadId',(p_data->>'staffId')::uuid,target,actor,at_time,coalesce(p_data->'slots','[]'),note) returning id into newid;
  perform public.pw_queue_notice('desk:'||newid||':new',target,'New academy task: '||replace(k,'_',' '),note,'pw_desk_items',newid::text);
  perform public.pw_queue_notice('desk:'||newid||':due',target,'Academy task is due: '||replace(k,'_',' '),note,'pw_desk_items',newid::text,at_time);
 elsif p_action='update' then
  select * into d from public.pw_desk_items where id=(p_data->>'id')::uuid for update;
  if d.id is null or not public.pw_desk_visible(d) or(actor not in(d.assigned_to,d.created_by) and r not in('super_admin','head_admin','qc'))
  then raise exception 'Assigned task required' using errcode='42501';end if;
  if d.revision<>(p_data->>'revision')::integer or d.status in('completed','cancelled') then raise exception 'Refresh task first' using errcode='PW409';end if;
  if p_data->>'status' not in('open','in_progress','completed','cancelled') then raise exception 'Invalid status' using errcode='22023';end if;
  if d.kind='trial_request' and p_data->>'status'='completed' and not exists(select 1 from public.pw_leads where id=d.lead_id and trial_lesson_id is not null)
  then raise exception 'Schedule the actual trial before completing the request' using errcode='PW409';end if;
  if d.kind='conversion_followup' and p_data->>'status'='completed' and d.assigned_to<>actor and r<>'super_admin'
  then raise exception 'Assigned Sales response required' using errcode='42501';end if;
  update public.pw_desk_items set status=p_data->>'status',notes=note,revision=revision+1,updated_at=now() where id=d.id returning id into newid;
  insert into public.pw_desk_history(item_id,actor_id,status,notes,revision) values(d.id,actor,p_data->>'status',note,d.revision+1);
 elsif p_action='hierarchy' then
  if r<>'super_admin' then raise exception 'Owner required' using errcode='42501';end if;
  target:=(p_data->>'adminId')::uuid;head:=(p_data->>'headId')::uuid;
  if not exists(select 1 from public.pw_profiles where id=target and role='admin')
   or not exists(select 1 from public.pw_profiles where id=head and role='head_admin' and status='active')
   or (p_data->>'quota')::integer not between 0 and 1000 then raise exception 'Active hierarchy required' using errcode='22023';end if;
  update public.pw_profiles set head_admin_id=head,quota=(p_data->>'quota')::integer where id=target;newid:=target;
 elsif p_action='announcement' then
  if r<>'super_admin' then raise exception 'Owner required' using errcode='42501';end if;
  if length(trim(p_data->>'body')) not between 5 and 4000 or length(trim(p_data->>'title')) not between 1 and 160
   or jsonb_typeof(p_data->'roles')<>'array' or jsonb_array_length(p_data->'roles') not between 1 and 11
   or (p_data->>'expiresAt')::timestamptz<=now() then raise exception 'Complete announcement required' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements_text(p_data->'roles') x where x not in('super_admin','head_admin','admin','teacher','qc','hr','finance','sales_marketing','social_media','parent','student'))
  then raise exception 'Unknown audience' using errcode='22023';end if;
  insert into public.pw_announcements(created_by,title,body,roles,expires_at)
  values(actor,trim(p_data->>'title'),trim(p_data->>'body'),p_data->'roles',(p_data->>'expiresAt')::timestamptz) returning id into newid;
  for target in select id from public.pw_profiles where status='active' and(p_data->'roles') ? role loop
   perform public.pw_queue_notice('announcement:'||newid||':'||target,target,p_data->>'title',p_data->>'body','pw_announcements',newid::text);
  end loop;
 elsif p_action='announcement_archive' then
  if r<>'super_admin' then raise exception 'Owner required' using errcode='42501';end if;
  update public.pw_announcements set archived_at=now() where id=(p_data->>'id')::uuid returning id into newid;
  if newid is null then raise exception 'Announcement not found' using errcode='22023';end if;
 elsif p_action='emergency_cover' then
  select * into l from public.pw_lessons where id=p_data->>'lessonId' for update;
  if r not in('super_admin','head_admin','admin') or l.id is null or not public.pw_can_student(l.student_id)
   or(r='admin' and l.admin_id<>actor) then raise exception 'Assigned class manager required' using errcode='42501';end if;
  if l.verified_at is not null or l.teacher_done_at is not null or l.payload->>'status' not in('scheduled','rescheduled')
  then raise exception 'Actual attendance cannot be reassigned' using errcode='PW409';end if;
  target:=(p_data->>'teacherId')::uuid;head:=(p_data->>'adminId')::uuid;
  if not exists(select 1 from public.pw_profiles where id=target and role in('teacher','qc') and status='active')
   or not exists(select 1 from public.pw_profiles where id=head and role='admin' and status='active')
  then raise exception 'Available active cover staff required' using errcode='22023';end if;
  if exists(select 1 from public.pw_leaves where staff_id in(target,head) and state in('approved','active')
    and starts_at<(l.payload->>'startsAt')::timestamptz+make_interval(mins=>l.duration_minutes) and ends_at>(l.payload->>'startsAt')::timestamptz)
  then raise exception 'Proposed cover is on approved leave' using errcode='PW409';end if;
  update public.pw_emergency_covers set superseded_at=now() where lesson_id=l.id and superseded_at is null;
  insert into public.pw_emergency_covers(lesson_id,student_id,original_teacher,original_admin,teacher_id,admin_id,starts_at,ends_at,created_by,reason)
  values(l.id,l.student_id,l.teacher_id,l.admin_id,target,head,(l.payload->>'startsAt')::timestamptz-interval '2 hours',
    (l.payload->>'startsAt')::timestamptz+make_interval(mins=>l.duration_minutes)+interval '1 hour',actor,note) returning id into newid;
  update public.pw_lessons set teacher_id=target,admin_id=head,
   payload=payload||jsonb_build_object('teacherId',target,'teacherName',(select name from public.pw_profiles where id=target),
   'adminId',head,'adminName',(select name from public.pw_profiles where id=head),'kind',case when payload->>'kind'='trial' then 'trial' else 'cover' end,
   'coverReason',note),revision=revision+1 where id=l.id;
  perform public.pw_queue_notice('emergency:'||newid||':teacher',target,'Emergency class cover assigned',note,'pw_emergency_covers',newid::text);
  perform public.pw_queue_notice('emergency:'||newid||':admin',head,'Emergency class hosting assigned',note,'pw_emergency_covers',newid::text);
 elsif p_action='deactivate' then
  target:=(p_data->>'staffId')::uuid;
  if r<>'super_admin' or target=actor or p_data->>'confirm'<>'DEACTIVATE'
   or exists(select 1 from public.pw_profiles where id=target and role in('super_admin','parent','student'))
  then raise exception 'Owner may deactivate other staff only' using errcode='42501';end if;
  if exists(select 1 from public.pw_students where(teacher_id=target or admin_id=target) and payload->>'status'='active')
   or exists(select 1 from public.pw_lessons where(target=teacher_id or target=admin_id) and verified_at is null and payload->>'status' in('scheduled','rescheduled','teacher_done'))
  then raise exception 'Reassign active duties before deactivation' using errcode='PW409';end if;
  update public.pw_profiles set status='restricted' where id=target returning id into newid;
  if newid is null then raise exception 'Staff not found' using errcode='22023';end if;
 elsif p_action='preview' then
  if r<>'super_admin' then raise exception 'Owner required' using errcode='42501';end if;
  target:=(p_data->>'staffId')::uuid;
  if not exists(select 1 from public.pw_profiles where id=target) then raise exception 'Account not found' using errcode='22023';end if;
  insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,subject_id,action,changed_fields)
  values(actor,(select name from public.pw_profiles where id=actor),r,'support_preview',target::text,target::text,'Read-only user preview: '||note,array['preview']);
  return jsonb_build_object('readOnly',true,'profile',(select jsonb_build_object('id',id,'name',name,'role',role,'status',status) from public.pw_profiles where id=target),
   'students',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.payload->>'name','status',s.payload->>'status')),'[]') from public.pw_students s
    left join public.pw_profiles a on a.id=s.admin_id left join public.pw_profiles t on t.id=s.teacher_id
    where target in(s.parent_id,s.student_user_id,s.teacher_id,s.admin_id) or a.head_admin_id=target or t.qc_id=target),
   'lessons',(select coalesce(jsonb_agg(l.payload),'[]') from public.pw_lessons l join public.pw_students s on s.id=l.student_id
    where target in(s.parent_id,s.student_user_id,l.teacher_id,l.admin_id)));
 else raise exception 'Unknown management action' using errcode='22023';end if;
 insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,subject_id,action,changed_fields)
 values(actor,(select name from public.pw_profiles where id=actor),r,'management',newid::text,newid::text,
  p_action||': '||coalesce(note,p_data->>'title'),array[p_action]);
 return jsonb_build_object('id',newid);
end $$;
revoke all on function public.pw_management_action(text,jsonb) from public,anon;
grant execute on function public.pw_management_action(text,jsonb) to authenticated;

create function public.pw_management_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text:=public.pw_role();
begin
 if not public.pw_active() then raise exception 'Active access required' using errcode='42501';end if;
 return jsonb_build_object(
 'items',(select coalesce(jsonb_agg(to_jsonb(d) order by d.due_at),'[]') from public.pw_desk_items d where public.pw_desk_visible(d)),
 'announcements',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]') from public.pw_announcements a
  where r='super_admin' or(a.archived_at is null and a.expires_at>now() and a.roles ? r)),
 'staff',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'role',p.role,'status',p.status,'quota',p.quota,'head_admin_id',p.head_admin_id,'avatar_file_id',p.avatar_file_id) order by p.name),'[]')
  from public.pw_profiles p where p.id=auth.uid() or r='super_admin' or(p.role not in('parent','student') and r in('head_admin','hr','qc','admin','sales_marketing'))),
 'students',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'payload',s.payload)),'[]') from public.pw_students s where public.pw_can_student(s.id)),
 'leads',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'payload',l.payload,'trial_lesson_id',l.trial_lesson_id,'trial_student_id',l.trial_student_id)),'[]') from public.pw_leads l where r in('super_admin','head_admin') or l.owner_id=auth.uid()),
 'lessons',(select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'student_id',l.student_id,'teacher_id',l.teacher_id,'admin_id',l.admin_id,'payload',l.payload)),'[]') from public.pw_lessons l where public.pw_can_student(l.student_id)),
 'quality',public.pw_quality_snapshot());
end $$;
revoke all on function public.pw_management_snapshot() from public,anon;
grant execute on function public.pw_management_snapshot() to authenticated;

-- Deliver only while the source still authorizes the recipient.
alter function public.pw_email_current(uuid) rename to pw_email_current_base;
create function public.pw_email_current(p_job uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare e public.pw_emails;
begin
 select * into e from public.pw_emails where id=p_job;
 if e.template<>'academy_notice' then return public.pw_email_current_base(p_job);end if;
 if not exists(select 1 from public.pw_profiles p join auth.users u on u.id=p.id
  where p.id=e.recipient_id and(p.status='active' or(p.status='on_leave' and e.source_table='pw_leaves')) and u.email_confirmed_at is not null) then return false;end if;
 return case e.source_table
 when 'pw_desk_items' then exists(select 1 from public.pw_desk_items d where d.id::text=e.source_id and d.status in('open','in_progress') and e.recipient_id=d.assigned_to)
 when 'pw_announcements' then exists(select 1 from public.pw_announcements a join public.pw_profiles p on p.id=e.recipient_id
  where a.id::text=e.source_id and a.archived_at is null and a.expires_at>now() and a.roles ? p.role)
 when 'pw_emergency_covers' then exists(select 1 from public.pw_emergency_covers c where c.id::text=e.source_id and c.superseded_at is null
  and e.recipient_id in(c.teacher_id,c.admin_id) and c.ends_at>now())
 when 'pw_leaves' then exists(select 1 from public.pw_leaves l join public.pw_profiles p on p.id=e.recipient_id
  where l.id::text=e.source_id and(l.staff_id=p.id or p.role in('super_admin','hr') or(p.role='head_admin' and exists(select 1 from public.pw_profiles where id=l.staff_id and head_admin_id=p.id))
   or exists(select 1 from public.pw_leave_covers where leave_id=l.id and cover_id=p.id)))
 else false end;
end $$;
revoke all on function public.pw_email_current_base(uuid),public.pw_email_current(uuid) from public,anon,authenticated;
grant execute on function public.pw_email_current(uuid) to service_role;

create function public.pw_sales_followup_notice() returns trigger language plpgsql security definer set search_path='' as $$
declare task uuid;
begin
 if new.trial_verified_at is not null and old.trial_verified_at is null and new.owner_id is not null then
  insert into public.pw_desk_items(kind,lead_id,assigned_to,created_by,due_at,notes,dedup_key)
  values('conversion_followup',new.id,new.owner_id,new.owner_id,new.trial_verified_at+interval '24 hours',
   'Follow up after the verified trial, share approved policies and record the family decision.','trial-followup:'||new.id)
  on conflict(dedup_key) do nothing returning id into task;
  if task is not null then
   perform public.pw_queue_notice('trial:'||task||':verified',new.owner_id,'Trial completed and verified','Follow up with the family; the 24-hour conversion check-in is now scheduled.','pw_desk_items',task::text);
   perform public.pw_queue_notice('trial:'||task||':24h',new.owner_id,'24-hour trial conversion check-in','Record the family response and proceed with approved policy and Finance handoff.','pw_desk_items',task::text,new.trial_verified_at+interval '24 hours');
  end if;
 end if;
 return new;
end $$;
create trigger pw_sales_followup after update on public.pw_leads for each row execute function public.pw_sales_followup_notice();

create function public.pw_leave_notice() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 if tg_op='INSERT' or new.state is distinct from old.state then
  for recipient in select p.id from public.pw_profiles p where p.status='active' and(p.id=new.staff_id or p.role in('super_admin','hr')
    or(p.role='head_admin' and exists(select 1 from public.pw_profiles where id=new.staff_id and head_admin_id=p.id))
    or exists(select 1 from public.pw_leave_covers c where c.leave_id=new.id and c.cover_id=p.id)) loop
   perform public.pw_queue_notice('leave:'||new.id||':'||new.state||':'||recipient,recipient,'Staff leave status updated',
    'A staff leave request is now '||replace(new.state,'_',' ')||'. Open the leave workspace for dates, approval and assigned cover. Private medical reasons are not included.','pw_leaves',new.id::text);
  end loop;
 end if;
 return new;
end $$;
create trigger pw_leave_notifications after insert or update on public.pw_leaves for each row execute function public.pw_leave_notice();

create function public.pw_record_presence(p_room uuid,p_user uuid,p_joined timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.pw_classroom_participant_allowed(p_room,p_user) or p_joined>now()+interval '1 minute'
  or not exists(select 1 from public.pw_classrooms where id=p_room and p_joined>=starts_at-interval '2 hours')
 then raise exception 'Invalid provider presence' using errcode='22023';end if;
 insert into public.pw_classroom_presence(room_id,user_id,joined_at) values(p_room,p_user,p_joined)
 on conflict(room_id,user_id) do update set joined_at=least(pw_classroom_presence.joined_at,excluded.joined_at);
end $$;
revoke all on function public.pw_record_presence(uuid,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.pw_record_presence(uuid,uuid,timestamptz) to service_role;

create function public.pw_song_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then insert into public.pw_song_activity(student_id) values(new.id);
 elsif new.payload->'songsDone' is distinct from old.payload->'songsDone' or new.payload->'songsToDo' is distinct from old.payload->'songsToDo' then
  update public.pw_song_activity set last_change=clock_timestamp() where student_id=new.id;
 end if;
 return new;
end $$;
create trigger pw_song_activity after insert or update on public.pw_students for each row execute function public.pw_song_change();
