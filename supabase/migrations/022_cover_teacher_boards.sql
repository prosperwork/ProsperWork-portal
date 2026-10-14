drop policy pw_board_read on public.pw_lesson_boards;
create policy pw_board_read on public.pw_lesson_boards for select to authenticated using(
 exists(select 1 from public.pw_lessons l where l.id=lesson_id and
  (public.pw_can_student(l.student_id) or (public.pw_role()='teacher' and l.teacher_id=auth.uid())))
);
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.pw_save_board(text,integer,text,text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'or not public.pw_can_student(l.student_id)','or not (public.pw_can_student(l.student_id) or (r=''teacher'' and l.teacher_id=auth.uid()))');
 execute definition;
end;
$migration$;
