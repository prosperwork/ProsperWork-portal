do $migration$
declare definition text;needle text:='if not public.pw_active() then';
begin
 select pg_get_functiondef('public.pw_policy_change(text,uuid,text,text,uuid[])'::regprocedure) into definition;
 if position(needle in definition)=0 then raise exception 'Unexpected policy gate definition';end if;
 definition:=replace(definition,needle,
 'if not ((p_action=''accept'' and r=''parent'' and public.pw_session_allowed() and exists(select 1 from public.pw_profiles where id=auth.uid() and status=''active'')) or public.pw_active()) then');
 execute definition;
end;
$migration$;
