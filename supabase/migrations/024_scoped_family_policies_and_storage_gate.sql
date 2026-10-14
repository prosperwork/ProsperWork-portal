alter table public.pw_policy_versions add column audience_parent_id uuid references public.pw_profiles(id);
create function public.pw_guardian_id() returns uuid language sql stable security definer set search_path='' as $$
 select case when public.pw_role()='parent' then auth.uid() when public.pw_role()='student'
 then (select parent_id from public.pw_students where student_user_id=auth.uid() limit 1) end
$$;
revoke all on function public.pw_guardian_id() from public,anon;
grant execute on function public.pw_guardian_id() to authenticated;
create function public.pw_current_policies() returns setof public.pw_policy_versions language sql stable security definer set search_path='' as $$
 select distinct on(p.key) p.* from public.pw_policy_versions p where public.pw_role() in('parent','student')
 and p.published_at is not null and (p.audience_parent_id is null or p.audience_parent_id=public.pw_guardian_id())
 order by p.key,(p.audience_parent_id is not null) desc,p.version desc
$$;
revoke all on function public.pw_current_policies() from public,anon;
grant execute on function public.pw_current_policies() to authenticated;
create or replace function public.pw_policy_ready() returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from unnest(array['parent_agreement','terms_of_service','reschedule_policy']) k where not exists(select 1 from public.pw_current_policies() p where p.key=k))
 and not exists(select 1 from public.pw_current_policies() p where not exists(
 select 1 from public.pw_policy_acceptances a where a.policy_id=p.id and a.parent_id=public.pw_guardian_id()))
$$;
drop policy pw_policies_read on public.pw_policy_versions;
create policy pw_policies_read on public.pw_policy_versions for select to authenticated using(public.pw_role()='super_admin'
 or(published_at is not null and public.pw_role() in('parent','student') and(audience_parent_id is null or audience_parent_id=public.pw_guardian_id())));
create function public.pw_policy_draft(p_key text,p_title text,p_parent uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if public.pw_role()<>'super_admin' or not public.pw_active() then raise exception 'Owner only' using errcode='42501';end if;
 if p_parent is not null and not exists(select 1 from public.pw_profiles where id=p_parent and role='parent')
 then raise exception 'Guardian account required' using errcode='22023';end if;
 result:=public.pw_policy_change('draft',null,p_key,p_title,null);
 update public.pw_policy_versions set audience_parent_id=p_parent where id=result;
 return result;
end $$;
revoke all on function public.pw_policy_draft(text,text,uuid) from public,anon;
grant execute on function public.pw_policy_draft(text,text,uuid) to authenticated;
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.pw_policy_change(text,uuid,text,text,uuid[])'::regprocedure) into definition;
 definition:=replace(definition,'where key=v.key and version>v.version and published_at is not null',
 'where key=v.key and audience_parent_id is not distinct from v.audience_parent_id and version>v.version and published_at is not null');
 definition:=replace(definition,'select 1 from public.pw_policy_versions p where p.id=x and p.published_at is not null and not exists(select 1 from public.pw_policy_versions n where n.key=p.key and n.version>p.version and n.published_at is not null)',
 'select 1 from public.pw_current_policies() p where p.id=x');
 execute definition;
 select pg_get_functiondef('public.pw_file_allowed(text,text,boolean)'::regprocedure) into definition;
 definition:=replace(definition,'public.pw_role() is not null and case','public.pw_role() is not null and (p_category=''policy'' or public.pw_portal_allowed()) and case');
 -- Published private family agreements are not shared with other families.
 definition:=replace(definition,'p.published_at is not null and public.pw_role() in(''parent'',''student'')',
 'p.published_at is not null and public.pw_role() in(''parent'',''student'') and (p.audience_parent_id is null or p.audience_parent_id=public.pw_guardian_id())');
 execute definition;
end;
$migration$;
