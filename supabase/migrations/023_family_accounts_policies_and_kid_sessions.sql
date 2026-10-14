alter table public.pw_profiles add column avatar_file_id uuid;
create table public.pw_policy_versions(
 id uuid primary key default gen_random_uuid(),key text not null,title text not null,
 version integer not null,file_id uuid references public.pw_files(id),created_by uuid not null references public.pw_profiles(id),
 created_at timestamptz not null default clock_timestamp(),published_at timestamptz,unique(key,version)
);
create table public.pw_policy_acceptances(
 parent_id uuid not null references public.pw_profiles(id),policy_id uuid not null references public.pw_policy_versions(id),
 accepted_at timestamptz not null default clock_timestamp(),primary key(parent_id,policy_id)
);
create table public.pw_family_pins(
 parent_id uuid primary key references public.pw_profiles(id),salt text not null,digest text not null,
 failures integer not null default 0,locked_until timestamptz,updated_at timestamptz not null default clock_timestamp()
);
create table public.pw_kid_blocks(
 parent_session uuid primary key,parent_id uuid not null references public.pw_profiles(id),child_user uuid not null references public.pw_profiles(id),
 expires_at timestamptz not null default clock_timestamp()+interval '12 hours'
);
alter table public.pw_policy_versions enable row level security;
alter table public.pw_policy_acceptances enable row level security;
alter table public.pw_family_pins enable row level security;
alter table public.pw_kid_blocks enable row level security;
revoke all on public.pw_policy_versions,public.pw_policy_acceptances,public.pw_family_pins,public.pw_kid_blocks from anon,authenticated;
grant select on public.pw_policy_versions,public.pw_policy_acceptances to authenticated;
grant all on public.pw_policy_versions,public.pw_policy_acceptances,public.pw_family_pins,public.pw_kid_blocks to service_role;
create function public.pw_session_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.pw_kid_blocks where parent_session::text=auth.jwt()->>'session_id')
$$;
revoke all on function public.pw_session_allowed() from public;
grant execute on function public.pw_session_allowed() to authenticated,anon,service_role;
-- Revoke the old parent's access during Kid Mode, including direct Supabase requests.
do $migration$
declare t record; definition text;
begin
 for t in select tablename from pg_tables where schemaname='public' and tablename like 'pw_%' loop
  execute format('create policy pw_kid_session_gate on public.%I as restrictive for all to authenticated using(public.pw_session_allowed()) with check(public.pw_session_allowed())',t.tablename);
 end loop;
 select pg_get_functiondef('public.pw_role()'::regprocedure) into definition;
 definition:=regexp_replace(definition,'where[[:space:]]+id[[:space:]]*=[[:space:]]*auth.uid\(\)','where public.pw_session_allowed() and id=auth.uid()');
 execute definition;
end;
$migration$;
create policy pw_policies_read on public.pw_policy_versions for select to authenticated using(public.pw_role()='super_admin' or (published_at is not null and public.pw_role() in('parent','student')));
create policy pw_acceptance_read on public.pw_policy_acceptances for select to authenticated using(parent_id=auth.uid() or public.pw_role()='super_admin');

create function public.pw_policy_change(p_action text,p_id uuid default null,p_key text default null,p_title text default null,p_ids uuid[] default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare v public.pw_policy_versions; result uuid; r text:=public.pw_role();
begin
 if not public.pw_active() then raise exception 'Active account required' using errcode='42501';end if;
 if p_action in('draft','publish') and r<>'super_admin' then raise exception 'Owner approval required' using errcode='42501';end if;
 if p_action='draft' then
  if p_key!~'^[a-z][a-z0-9_-]{2,49}$' or length(p_title) not between 3 and 150 then raise exception 'Invalid policy' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_key,34));
  insert into public.pw_policy_versions(key,title,version,created_by)
  select p_key,p_title,coalesce(max(version),0)+1,auth.uid() from public.pw_policy_versions where key=p_key returning id into result;
 elsif p_action='publish' then
  select * into v from public.pw_policy_versions where id=p_id for update;
  if v.id is null or v.file_id is null or v.published_at is not null
   or not exists(select 1 from public.pw_files where id=v.file_id and complete and category='policy' and target_id=v.id::text)
   then raise exception 'Upload approved PDF before publishing' using errcode='22023';end if;
  if exists(select 1 from public.pw_policy_versions where key=v.key and version>v.version and published_at is not null)
   then raise exception 'A newer version is already active' using errcode='40001';end if;
  update public.pw_policy_versions set published_at=clock_timestamp() where id=p_id;result:=p_id;
 elsif p_action='accept' then
  if r<>'parent' then raise exception 'Guardian acceptance only' using errcode='42501';end if;
  if p_ids is null or array_length(p_ids,1)>30 or exists(select 1 from unnest(p_ids) x where not exists(
   select 1 from public.pw_policy_versions p where p.id=x and p.published_at is not null and not exists(select 1 from public.pw_policy_versions n where n.key=p.key and n.version>p.version and n.published_at is not null)
  )) then raise exception 'Policy versions changed; reload' using errcode='40001';end if;
  insert into public.pw_policy_acceptances(parent_id,policy_id) select auth.uid(),x from unnest(p_ids) x on conflict do nothing;
 else raise exception 'Unknown action' using errcode='22023';end if;
 insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,action)
 select auth.uid(),name,role,'policy',coalesce(result::text,auth.uid()::text),'Policy '||p_action from public.pw_profiles where id=auth.uid();
 return result;
end $$;
revoke all on function public.pw_policy_change(text,uuid,text,text,uuid[]) from public,anon;
grant execute on function public.pw_policy_change(text,uuid,text,text,uuid[]) to authenticated;
create function public.pw_policy_ready() returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from unnest(array['parent_agreement','terms_of_service','reschedule_policy']) k
  where not exists(select 1 from public.pw_policy_versions p where p.key=k and p.published_at is not null))
 and not exists(
  select 1 from public.pw_policy_versions p where p.published_at is not null
   and not exists(select 1 from public.pw_policy_versions n where n.key=p.key and n.version>p.version and n.published_at is not null)
   and not exists(select 1 from public.pw_policy_acceptances a where a.policy_id=p.id and (
    a.parent_id=auth.uid() or exists(select 1 from public.pw_students s where s.student_user_id=auth.uid() and s.parent_id=a.parent_id)))
 )
$$;
revoke all on function public.pw_policy_ready() from public,anon;
grant execute on function public.pw_policy_ready() to authenticated;
-- Missing approved documents block family operations rather than inventing agreement.
create function public.pw_portal_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select public.pw_session_allowed() and (public.pw_role() not in('parent','student') or public.pw_policy_ready())
$$;
revoke all on function public.pw_portal_allowed() from public,anon;
grant execute on function public.pw_portal_allowed() to authenticated,anon;
do $migration$
declare t record;definition text;
begin
 for t in select tablename from pg_tables where schemaname='public' and tablename like 'pw_%'
  and tablename not in('pw_profiles','pw_policy_versions','pw_policy_acceptances','pw_family_pins','pw_kid_blocks') loop
  execute format('create policy pw_policy_gate on public.%I as restrictive for all to authenticated using(public.pw_portal_allowed()) with check(public.pw_portal_allowed())',t.tablename);
 end loop;
 select pg_get_functiondef('public.pw_active()'::regprocedure) into definition;
 definition:=regexp_replace(definition,'where[[:space:]]+id[[:space:]]*=[[:space:]]*auth.uid\(\)','where public.pw_portal_allowed() and id=auth.uid()');
 execute definition;
end;
$migration$;

create function public.pw_link_student_account(p_actor uuid,p_child text,p_user uuid,p_username text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.pw_students; a public.pw_profiles;
begin
 select * into a from public.pw_profiles where id=p_actor and status='active';
 select * into s from public.pw_students where id=p_child for update;
 if a.id is null or s.id is null or not (a.role='super_admin' or (a.role='parent' and s.parent_id=p_actor))
  or s.student_user_id is not null or p_username!~'^[a-z][a-z0-9_-]{2,31}$'
  or not exists(select 1 from public.pw_profiles where id=p_user and status='pending')
 then raise exception 'Guardian/student linkage invalid' using errcode='42501';end if;
 update public.pw_profiles set role='student',status='active',name=s.payload->>'name',timezone=s.payload->>'timezone',username=p_username where id=p_user;
 update public.pw_students set student_user_id=p_user where id=p_child;
 insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,action) values(p_actor,a.name,a.role,'student_account',p_child,'Guardian linked independent student account');
end $$;
revoke all on function public.pw_link_student_account(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.pw_link_student_account(uuid,text,uuid,text) to service_role;

alter table public.pw_files drop constraint pw_files_category_check;
alter table public.pw_files add constraint pw_files_category_check check(category in('receipt','homework','curriculum','policy','avatar'));
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.pw_file_allowed(text,text,boolean)'::regprocedure) into definition;
 definition:=replace(definition,'else false end,false)',$new$
 when p_category='policy' then exists(select 1 from public.pw_policy_versions p where p.id::text=p_target and
  case when p_write then public.pw_role()='super_admin' and p.published_at is null
   else public.pw_role()='super_admin' or (p.published_at is not null and public.pw_role() in('parent','student')) end)
 when p_category='avatar' then case when p_write then auth.uid()::text=p_target and public.pw_role() is not null
  else auth.uid()::text=p_target or public.pw_role()='super_admin' or exists(select 1 from public.pw_students s where public.pw_can_student(s.id)
   and p_target in(s.parent_id::text,s.student_user_id::text,s.teacher_id::text,s.admin_id::text)) end
 else false end,false)$new$);
 execute definition;
 select pg_get_functiondef('public.pw_reserve_file(text,text,text,text,bigint)'::regprocedure) into definition;
 definition:=replace(definition,'if length(p_name)', 'if (p_category=''policy'' and p_mime<>''application/pdf'') or (p_category=''avatar'' and (p_bytes>5242880 or p_mime not in(''image/png'',''image/jpeg''))) then raise exception ''Invalid document/image'' using errcode=''22023'';end if; if length(p_name)');
 execute definition;
end;
$migration$;
-- Unaccepted guardians must still be able to open the documents they are accepting.
drop policy pw_policy_gate on public.pw_files;
create policy pw_policy_gate on public.pw_files as restrictive for all to authenticated
 using(category='policy' or public.pw_portal_allowed()) with check(category='policy' or public.pw_portal_allowed());
create function public.pw_pin_attempt(p_parent uuid,p_session uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.pw_family_pins;
begin
 if not exists(select 1 from public.pw_kid_blocks where parent_session=p_session and parent_id=p_parent)
 then raise exception 'Guardian return session required' using errcode='42501';end if;
 select * into p from public.pw_family_pins where parent_id=p_parent for update;
 if p.parent_id is null or p.locked_until>now() then raise exception 'PIN locked' using errcode='42501';end if;
 if p.locked_until is not null then p.failures:=0;end if;
 update public.pw_family_pins set failures=p.failures+1,locked_until=case when p.failures+1>=5 then now()+interval '15 minutes' else null end where parent_id=p_parent;
 return jsonb_build_object('salt',p.salt,'digest',p.digest);
end $$;
create function public.pw_kid_unblock(p_parent uuid,p_session uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 delete from public.pw_kid_blocks where parent_session=p_session and parent_id=p_parent;
 update public.pw_family_pins set failures=0,locked_until=null where parent_id=p_parent;
end $$;
revoke all on function public.pw_pin_attempt(uuid,uuid),public.pw_kid_unblock(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pw_pin_attempt(uuid,uuid),public.pw_kid_unblock(uuid,uuid) to service_role;
create function public.pw_family_consent(p_child text,p_consent boolean) returns void language plpgsql security definer set search_path='' as $$
declare s public.pw_students;
begin
 select * into s from public.pw_students where id=p_child for update;
 if not public.pw_active() or s.id is null or not (public.pw_role()='super_admin' or (public.pw_role()='parent' and s.parent_id=auth.uid()))
 then raise exception 'Guardian consent only' using errcode='42501';end if;
 update public.pw_students set payload=jsonb_set(payload,'{consent}',to_jsonb(p_consent)) where id=p_child;
 insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,subject_id,action)
 select auth.uid(),name,role,'consent',p_child,s.parent_id,case when p_consent then 'Guardian granted social consent' else 'Guardian withdrew social consent' end from public.pw_profiles where id=auth.uid();
end $$;
revoke all on function public.pw_family_consent(text,boolean) from public,anon;
grant execute on function public.pw_family_consent(text,boolean) to authenticated;
create function public.pw_finish_profile_document(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare f public.pw_files;
begin
 select * into f from public.pw_files where id=p_id for update;
 if f.id is null or f.complete or f.uploader_id<>auth.uid() or f.category not in('policy','avatar') or not public.pw_file_allowed(f.category,f.target_id,true)
 then raise exception 'Upload not permitted' using errcode='42501';end if;
 if not exists(select 1 from storage.objects where bucket_id='pw-private' and name=f.path and (metadata->>'size')::bigint=f.bytes and metadata->>'mimetype'=f.mime)
 then raise exception 'Stored object required' using errcode='22023';end if;
 update public.pw_files set complete=true where id=f.id;
 if f.category='policy' then update public.pw_policy_versions set file_id=f.id where id::text=f.target_id and published_at is null;
 else update public.pw_profiles set avatar_file_id=f.id where id=auth.uid();end if;
end $$;
revoke all on function public.pw_finish_profile_document(uuid) from public,anon;
grant execute on function public.pw_finish_profile_document(uuid) to authenticated;
