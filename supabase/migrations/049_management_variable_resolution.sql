do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.pw_management_action_base(text,jsonb)'::regprocedure);
 -- In correlated previews, s/l are table aliases. Elsewhere they are local
 -- records. Resolve actual SQL columns first and leave procedural records intact.
 definition:=replace(definition,'AS $function$',E'AS $function$\n#variable_conflict use_column');
 execute definition;
 definition:=pg_get_functiondef('public.pw_reconcile_management()'::regprocedure);
 definition:=replace(definition,
  'and(q.kind=''class_not_started'' or q.created_at<=now()-make_interval(hours=>rule.escalation_hours)) loop',
  'and(q.kind=''class_not_started'' or q.created_at<=now()-make_interval(hours=>rule.escalation_hours))
   and not exists(select 1 from public.pw_desk_items d where d.dedup_key=''escalation:''||q.id)
   order by q.created_at limit 100 loop');
 execute definition;
end $$;
notify pgrst,'reload schema';
