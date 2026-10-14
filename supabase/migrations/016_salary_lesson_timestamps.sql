-- Core lessons persist their start timestamp in the validated JSON payload.
-- Attendance retains a separate immutable financial timestamp. Correct only
-- the named calculator; earlier applied migration checksums remain immutable.
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.pw_calculate_salary(date,uuid)'::regprocedure) into definition;
 if position('l.starts_at' in definition)=0 then
  raise exception 'Unexpected salary calculator definition';
 end if;
 definition:=replace(definition,'l.starts_at','(l.payload->>''startsAt'')::timestamptz');
 execute definition;
end;
$migration$;
