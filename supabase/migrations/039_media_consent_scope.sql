create function public.pw_social_media_allowed(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.pw_active() and public.pw_role()='social_media' and public.pw_portal_allowed() and exists(
  select 1 from public.pw_media_reviews m join public.pw_students s on s.id=m.student_id where m.id=p_id and(
   m.status='withdrawn' or(m.status in('approved','published') and coalesce((s.payload->>'consent')::boolean,false))
  )
 ),false);
$$;
revoke all on function public.pw_social_media_allowed(uuid) from public,anon;
grant execute on function public.pw_social_media_allowed(uuid) to authenticated;
drop policy pw_media_read on public.pw_media_reviews;
create policy pw_media_read on public.pw_media_reviews for select to authenticated using(public.pw_active() and public.pw_portal_allowed() and(
 public.pw_role()='super_admin' or submitted_by=auth.uid() or(public.pw_role() in('admin','head_admin','qc') and public.pw_can_student(student_id)) or public.pw_social_media_allowed(id)));
