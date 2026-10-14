do $fix$
declare definition text;
begin
 select pg_get_functiondef('public.pw_quality_sales_action(text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'where student_id=s.id and active)','where student_id=s.id and active and not billing_hold)');
 execute definition;
end $fix$;
