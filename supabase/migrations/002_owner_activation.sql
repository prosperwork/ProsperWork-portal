-- Never give the first registrant administrative privileges.
create function public.pw_bootstrap_owner(target uuid, designated_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(1791819737);
  if not exists(select 1 from auth.users where id=target and email_confirmed_at is not null and lower(email)=lower(designated_email)) then
    raise exception 'Verified designated owner required' using errcode='42501';
  end if;
  if exists(select 1 from public.pw_profiles where role='super_admin' and id<>target) then return; end if;
  update public.pw_profiles set role='super_admin',status='active',department='Leadership' where id=target and role<>'super_admin';
end $$;
revoke all on function public.pw_bootstrap_owner(uuid,text) from public,anon,authenticated;
grant execute on function public.pw_bootstrap_owner(uuid,text) to service_role;
