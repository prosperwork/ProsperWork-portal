do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.pw_manage_student(text)'::regprocedure) into definition;
 if position('select public.pw_active()' in definition)=0 then raise exception 'Unexpected administration permission definition';end if;
 definition:=replace(definition,'select public.pw_active()','select (public.pw_active() and public.pw_role() in(''admin'',''head_admin'') and exists(select 1 from public.pw_leave_covers c join public.pw_leaves l on l.id=c.leave_id join public.pw_students s on s.id=c.student_id where c.student_id=target and c.duty=''admin'' and c.original_id=s.admin_id and c.cover_id=auth.uid() and l.state in(''approved'',''active'') and clock_timestamp()>=l.starts_at and clock_timestamp()<l.ends_at)) or public.pw_active()');
 execute definition;
 select pg_get_functiondef('public.pw_can_student(text)'::regprocedure) into definition;
 definition:=replace(definition,'c.student_id=target and c.cover_id=auth.uid()','c.student_id=target and c.cover_id=auth.uid() and exists(select 1 from public.pw_students z where z.id=target and(case c.duty when ''teacher'' then z.teacher_id else z.admin_id end)=c.original_id)');
 execute definition;
 select pg_get_functiondef('public.pw_validate_schedule()'::regprocedure) into definition;
 definition:=replace(definition,'''scheduled'',''teacher_done'',''completed''','''scheduled'',''rescheduled'',''teacher_done'',''completed''');
 execute definition;
 -- Covering staff cannot take another overlapping leave without first resolving
 -- their existing cover duty; HR can review but cannot activate an unsafe plan.
 select pg_get_functiondef('public.pw_leave_action(text,uuid,uuid,text,text,timestamptz,timestamptz,text,text,uuid)'::regprocedure) into definition;
 definition:=replace(definition,'if l.starts_at<=clock_timestamp() then raise exception ''Leave must be ready before it starts''',
  'if exists(select 1 from public.pw_leave_covers x join public.pw_leaves y on y.id=x.leave_id where x.cover_id=l.staff_id and y.state in(''approved'',''active'') and y.starts_at<l.ends_at and y.ends_at>l.starts_at) then raise exception ''Existing covering duties must be resolved before this leave is activated'' using errcode=''23514'';end if;
  if l.starts_at<=clock_timestamp() then raise exception ''Leave must be ready before it starts''');
 execute definition;
end $migration$;
