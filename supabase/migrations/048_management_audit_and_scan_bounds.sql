-- Keep the audited account subject typed as UUID, not the generic entity text.
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.pw_management_action_base(text,jsonb)'::regprocedure);
 if strpos(definition,'newid::text,newid::text')=0 or strpos(definition,'target::text,target::text')=0
 then raise exception 'Expected management audit definition missing';end if;
 definition:=replace(definition,'newid::text,newid::text','newid::text,newid');
 definition:=replace(definition,'target::text,target::text','target::text,target');
 execute definition;
end $$;
alter table public.pw_song_activity add column last_scan timestamptz;
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.pw_reconcile_management()'::regprocedure);
 definition:=replace(definition,
  'for student in select * from public.pw_students where payload->>''status''=''active'' loop',
  'if not pg_try_advisory_xact_lock(1791819739) then return 0;end if;
   for student in select s.* from public.pw_students s join public.pw_song_activity a on a.student_id=s.id
    where s.payload->>''status''=''active'' order by a.last_scan nulls first,s.id limit 100 loop
    update public.pw_song_activity set last_scan=clock_timestamp() where student_id=student.id;');
 execute definition;
end $$;
notify pgrst,'reload schema';
