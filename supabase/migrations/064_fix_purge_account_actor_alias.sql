-- Migration 064: Disambiguate pw_operations_events.actor column reference inside pw_purge_account
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef('public.pw_purge_account(uuid,uuid,text)'::regprocedure) into definition;
  if position('from public.pw_operations_events where actor = target' in definition) = 0 then
    raise exception 'Unexpected pw_operations_events query in pw_purge_account';
  end if;
  definition := replace(
    definition,
    'from public.pw_operations_events where actor = target',
    'from public.pw_operations_events oe where oe.actor = target'
  );
  execute definition;
end $migration$;
