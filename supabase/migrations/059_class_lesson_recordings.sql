-- Migration 059: Class Lesson Recordings for Classroom, Learning Hub & QC Video Queue
-- Adds 'lesson_recording' to pw_files category constraint
alter table public.pw_files drop constraint pw_files_category_check;
alter table public.pw_files add constraint pw_files_category_check check(
  category in(
    'receipt',
    'homework',
    'curriculum',
    'policy',
    'avatar',
    'practice',
    'hiring_evidence',
    'hiring_guidelines',
    'hiring_agreement',
    'lesson_recording'
  )
);

-- Update public.pw_file_allowed to include 'lesson_recording'
create or replace function public.pw_file_allowed(p_category text, p_target text, p_write boolean default false)
returns boolean
language sql
stable security definer
set search_path to ''
as $function$
  select (p_category in('hiring_evidence','hiring_guidelines','hiring_agreement') and public.pw_hiring_file_allowed(p_category,p_target,p_write)) or coalesce(public.pw_role() is not null and (p_category='policy' or public.pw_portal_allowed()) and case
    when p_category='receipt' then exists(
      select 1 from public.pw_payments p where p.id=p_target
      and (p.parent_id=auth.uid() or public.pw_role() in ('super_admin','general_manager','finance'))
      and (not p_write or p.payload->>'status'<>'paid'))
    when p_category='homework' then exists(
      select 1 from public.pw_homework h join public.pw_students s on s.id=h.student_id
      where h.id=p_target and public.pw_can_student(h.student_id)
      and (not p_write or ((s.parent_id=auth.uid() or s.student_user_id=auth.uid())
        and h.payload->>'status' in ('assigned','submitted'))))
    when p_category='curriculum' then exists(select 1 from public.pw_resources r where r.id=p_target and r.archived_at is null)
      and case when p_write then public.pw_role() in('super_admin','qc') else public.pw_role() in('super_admin','qc','teacher','parent','student') end
    when p_category='policy' then exists(select 1 from public.pw_policy_versions p where p.id::text=p_target and
      case when p_write then public.pw_role()='super_admin' and p.published_at is null
       else public.pw_role()='super_admin' or (p.published_at is not null and public.pw_role() in('parent','student') and (p.audience_parent_id is null or p.audience_parent_id=public.pw_guardian_id())) end)
    when p_category='avatar' then case when p_write then auth.uid()::text=p_target and public.pw_role() is not null
      else exists(select 1 from public.pw_profiles p
       where p.id::text=p_target and public.pw_profile_visible(p.id)) end
    when p_category='practice' then exists(select 1 from public.pw_practice s where s.id::text=p_target and public.pw_can_student(s.student_id)
      and public.pw_role() in('super_admin','teacher','qc','parent','student') and(not p_write or s.created_by=auth.uid()))
    when p_category='lesson_recording' then exists(
      select 1 from public.pw_lessons l
      where l.id=p_target and public.pw_can_student(l.student_id)
      and (not p_write or public.pw_role() in ('super_admin','teacher','qc','head_admin','admin'))
    )
    else false end,false)
$function$;

-- Create completion function for lesson recording
create or replace function public.pw_finish_recording_file(p_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare f public.pw_files;
begin
  select * into f from public.pw_files where id=p_id for update;
  if f.id is null or f.complete or f.category<>'lesson_recording' or f.uploader_id<>auth.uid() or not public.pw_file_allowed(f.category,f.target_id,true) then
    raise exception 'Unauthorized recording upload' using errcode='42501';
  end if;
  if not exists(
    select 1 from storage.objects
    where bucket_id='pw-private' and name=f.path
    and (metadata->>'size')::bigint=f.bytes and metadata->>'mimetype'=f.mime
  ) then
    raise exception 'Actual uploaded video recording required' using errcode='22023';
  end if;
  update public.pw_files set complete=true where id=f.id;
end $$;

revoke all on function public.pw_finish_recording_file(uuid) from public,anon;
grant execute on function public.pw_finish_recording_file(uuid) to authenticated;

