alter table public.pw_hiring_cases add column agreed_rate_id uuid references public.pw_salary_rates;
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.pw_hiring_action(text,uuid,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'update public.pw_hiring_cases set agreement_file=fid,accepted_at=null',
  'select * into rate from public.pw_salary_rates where staff_id=c.staff_id and status=''approved'' order by decided_at desc,id desc limit 1;
   if rate.id is null then raise exception ''Approve the initial salary proposal before publishing the agreement'' using errcode=''23514'';end if;
   update public.pw_hiring_cases set agreed_rate_id=rate.id,agreement_file=fid,accepted_at=null');
 definition:=replace(definition,'if rate.id is null or not exists(select 1 from public.pw_salary_banks',
  'if rate.id is null or rate.id is distinct from c.agreed_rate_id or not exists(select 1 from public.pw_salary_banks');
 definition:=replace(definition,'elsif p_action=''reject'' then',
  'elsif p_action=''return'' then
   if r not in(''super_admin'',''hr'') or c.stage<>''ready'' then raise exception ''HR or Owner returns finalized onboarding for correction'' using errcode=''42501'';end if;
   update public.pw_hiring_cases set stage=''selected'',accepted_at=null,accepted_by=null,signed_name=null,agreement_file=null,agreed_rate_id=null,finalized_at=null,finalized_by=null,start_date=null where id=c.id;
  elsif p_action=''reject'' then');
 execute definition;
 select pg_get_functiondef('public.pw_hiring_subject(uuid)'::regprocedure) into definition;
 definition:=replace(definition,'s.role=c.desired_role','(s.role=c.desired_role or c.stage=''activated'')');
 execute definition;
end $migration$;
create function public.pw_hiring_activation_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.pw_hiring_cases;rate public.pw_salary_rates;
begin
 if new.status='active' and(old.status is distinct from 'active' or old.role is distinct from new.role) then
  select * into c from public.pw_hiring_cases where staff_id=new.id;
  if c.id is not null then
   if c.stage<>'activated' and(c.stage<>'ready' or new.role<>c.desired_role or c.accepted_at is null)
    then raise exception 'Complete the linked hiring workflow before activating this staff identity' using errcode='23514';end if;
   select * into rate from public.pw_salary_rates where staff_id=new.id and status='approved' and effective_from<=c.start_date order by effective_from desc,decided_at desc limit 1;
   if c.stage='ready' and(rate.id is distinct from c.agreed_rate_id or not exists(select 1 from public.pw_salary_banks where staff_id=new.id and currency=rate.terms->>'currency'))
    then raise exception 'The accepted salary or matching bank instructions changed; review onboarding before activation' using errcode='23514';end if;
  end if;
 end if;
 return new;
end $$;
create trigger pw_hiring_activation before update on public.pw_profiles for each row execute function public.pw_hiring_activation_guard();
