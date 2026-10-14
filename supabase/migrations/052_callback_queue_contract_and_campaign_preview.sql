do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.pw_sales_callback_notice()'::regprocedure);
 definition:=replace(definition,'public.pw_queue_notice(new.owner_id,','public.pw_queue_notice(''sales-lead-due:''||task,new.owner_id,');
 definition:=replace(definition,'task::text,''sales-lead-due:''||task,due','task::text,due');
 execute definition;
 definition:=pg_get_functiondef('public.pw_communications_snapshot()'::regprocedure);
 definition:=replace(definition,
  '''consent'',c.consent,''evidence'',c.evidence',
  '''consent'',c.consent,''eligible'',case when c.guardian_id is not null then exists(
    select 1 from public.pw_profiles p join auth.users u on u.id=p.id where p.id=c.guardian_id and p.status=''active'' and p.email=c.email and u.email_confirmed_at is not null)
    else c.email=l.payload->>''email'' end,''evidence'',c.evidence');
 execute definition;
end $$;
notify pgrst,'reload schema';
