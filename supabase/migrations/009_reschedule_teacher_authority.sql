create function public.pw_check_reschedule_teacher() returns trigger
language plpgsql security definer set search_path='' as $$
declare assigned_teacher uuid;
begin
 if new.status='approved' then
   select teacher_id into assigned_teacher from public.pw_lessons where id=new.lesson_id;
   if not new.teacher_approved or new.teacher_approved_by is distinct from assigned_teacher then
     raise exception 'The currently assigned teacher must confirm this slot' using errcode='PW002';
   end if;
 end if;
 return new;
end $$;
create trigger pw_reschedule_teacher_authority before update on public.pw_reschedules
for each row execute function public.pw_check_reschedule_teacher();
