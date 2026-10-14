-- Usernames are stable sign-in identifiers, so preserve superseded UUID names
-- as private aliases while replacing the old generated values.
create table public.pw_username_aliases (
  username text not null,
  profile_id uuid not null references public.pw_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index pw_username_aliases_lower on public.pw_username_aliases(lower(username));
alter table public.pw_username_aliases enable row level security;
revoke all on public.pw_username_aliases from public,anon,authenticated;
grant all on public.pw_username_aliases to service_role;

insert into public.pw_username_aliases(username,profile_id)
select username,id from public.pw_profiles
where username ~* '^pw-[0-9a-f]{32}$'
on conflict do nothing;

create function public.pw_generate_username(p_name text,p_profile_id uuid default null)
returns text language plpgsql volatile security definer set search_path='' as $$
declare
  slug text;
  base_name text;
  candidate text;
  suffix integer := 1;
begin
  slug := regexp_replace(normalize(lower(coalesce(p_name,'')),NFKD),'[^a-z0-9]+','','g');
  if slug='' then slug:='user'; end if;
  base_name := 'pw_'||left(slug,29);
  perform pg_advisory_xact_lock(hashtextextended(base_name,0));
  candidate:=base_name;
  while exists (
    select 1 from public.pw_profiles p
    where lower(p.username)=candidate and (p_profile_id is null or p.id<>p_profile_id)
  ) or exists (
    select 1 from public.pw_username_aliases a
    where lower(a.username)=candidate and (p_profile_id is null or a.profile_id<>p_profile_id)
  ) loop
    suffix:=suffix+1;
    candidate:=left(base_name,32-length(suffix::text))||suffix::text;
  end loop;
  return candidate;
end
$$;
revoke all on function public.pw_generate_username(text,uuid) from public,anon,authenticated;
grant execute on function public.pw_generate_username(text,uuid) to service_role;

-- Keep existing username sign-in working after generated usernames are renamed.
create function public.pw_login_email_for_username(p_username text)
returns text language sql stable security definer set search_path='' as $$
  select coalesce(
    (select p.email from public.pw_profiles p
     where lower(p.username)=lower(btrim(coalesce(p_username,''))) and p.email<>''),
    (select p.email from public.pw_username_aliases a
     join public.pw_profiles p on p.id=a.profile_id
     where lower(a.username)=lower(btrim(coalesce(p_username,''))) and p.email<>'')
  )
$$;
revoke all on function public.pw_login_email_for_username(text) from public,anon,authenticated;
grant execute on function public.pw_login_email_for_username(text) to service_role;

create or replace function public.pw_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare new_name text;
begin
  new_name:=left(coalesce(nullif(new.raw_user_meta_data->>'name',''),'New account'),120);
  insert into public.pw_profiles(id,email,name,username)
  values(new.id,coalesce(new.email,''),new_name,public.pw_generate_username(new_name,new.id));
  return new;
end $$;

-- Convert only the old UUID-generated names. Explicit legacy usernames remain
-- unchanged; their owners can continue using them as before.
do $$
declare profile_row record;
begin
  for profile_row in
    select id,name from public.pw_profiles where username ~* '^pw-[0-9a-f]{32}$' order by created_at,id
  loop
    update public.pw_profiles
    set username=public.pw_generate_username(profile_row.name,profile_row.id)
    where id=profile_row.id;
  end loop;
end
$$;

create or replace function public.pw_link_student_account(p_actor uuid,p_child text,p_user uuid,p_username text)
returns void language plpgsql security definer set search_path='' as $$
declare s public.pw_students; a public.pw_profiles;
begin
  select * into a from public.pw_profiles where id=p_actor and status='active';
  select * into s from public.pw_students where id=p_child for update;
  if a.id is null or s.id is null or not (a.role='super_admin' or (a.role='parent' and s.parent_id=p_actor))
    or s.student_user_id is not null
    or not exists(select 1 from public.pw_profiles where id=p_user and status='pending')
  then raise exception 'Guardian/student linkage invalid' using errcode='42501';end if;
  update public.pw_profiles
  set role='student',status='active',name=s.payload->>'name',timezone=s.payload->>'timezone',
      username=public.pw_generate_username(s.payload->>'name',p_user)
  where id=p_user;
  update public.pw_students set student_user_id=p_user where id=p_child;
  insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,action)
  values(p_actor,a.name,a.role,'student_account',p_child,'Guardian linked independent student account');
end $$;

-- Photos follow the same row-visibility boundary as profile data.
do $migration$
declare definition text; old_branch text; new_branch text;
begin
  select pg_get_functiondef('public.pw_file_allowed(text,text,boolean)'::regprocedure) into definition;
  old_branch:=$old$auth.uid()::text=p_target or public.pw_role()='super_admin' or exists(select 1 from public.pw_students s where public.pw_can_student(s.id)
   and p_target in(s.parent_id::text,s.student_user_id::text,s.teacher_id::text,s.admin_id::text)) end$old$;
  new_branch:=$new$exists(select 1 from public.pw_profiles p
   where p.id::text=p_target and public.pw_profile_visible(p.id)) end$new$;
  if position(old_branch in definition)=0 then
    raise exception 'Could not safely update avatar visibility policy';
  end if;
  execute replace(definition,old_branch,new_branch);
end
$migration$;
