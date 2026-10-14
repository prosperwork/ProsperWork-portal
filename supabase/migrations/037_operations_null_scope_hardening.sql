do $hardening$
declare definition text;
begin
 select pg_get_functiondef('public.pw_quality_sales_action(text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'not(r=''super_admin'' or(r=''qc'' and t.qc_id=auth.uid() and t.id<>auth.uid()))',
 'not coalesce((r=''super_admin'' or(r=''qc'' and t.qc_id=auth.uid() and t.id<>auth.uid())),false)');
 execute definition;
end $hardening$;
