create or replace function public.pw_bootstrap_owner(target uuid, designated_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(1791819737);
  if not exists(select 1 from auth.users where id=target and email_confirmed_at is not null and lower(email)=lower(designated_email)) then
    raise exception 'Verified designated owner required' using errcode='42501';
  end if;
  if exists(select 1 from public.pw_profiles where role='super_admin' and id<>target) then return; end if;
  update public.pw_profiles set role='super_admin',status='active',department='Leadership' where id=target and role<>'super_admin';
  if found then
    insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,subject_id,action,changed_fields)
    values(target,(select name from public.pw_profiles where id=target),'super_admin','pw_profiles',target::text,target,'Designated owner activated',array['role','status']);
  end if;
end $$;
-- Finance needs billing names and identifiers, not DOB, curriculum, or private notes.
create function public.pw_billing_directory()
returns table(id text,parent_id uuid,name text,parent_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.pw_role() not in ('super_admin','general_manager','finance') or public.pw_role() is null then
    raise exception 'Billing department required' using errcode='42501';
  end if;
  return query select s.id,s.parent_id,s.payload->>'name',s.payload->>'parentName' from public.pw_students s order by s.payload->>'name';
end $$;
revoke all on function public.pw_billing_directory() from public,anon;
grant execute on function public.pw_billing_directory() to authenticated;
