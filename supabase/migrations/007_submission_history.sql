create function public.pw_storage_cleanup_allowed(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.pw_files where path=p_path and uploader_id=auth.uid() and not complete)
$$;
revoke all on function public.pw_storage_cleanup_allowed(text) from public;
grant execute on function public.pw_storage_cleanup_allowed(text) to authenticated,anon;
drop policy pw_storage_remove_incomplete on storage.objects;
drop policy pw_storage_private_delete on storage.objects;
create policy pw_storage_remove_incomplete on storage.objects for delete to authenticated
using(bucket_id='pw-private' and public.pw_storage_cleanup_allowed(name));
create policy pw_storage_private_delete on storage.objects as restrictive for delete to public
using(bucket_id<>'pw-private' or public.pw_storage_cleanup_allowed(name));
create or replace function public.pw_abort_file(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 delete from public.pw_files f where id=p_id and uploader_id=auth.uid() and not complete
 and not exists(select 1 from storage.objects o where o.bucket_id='pw-private' and o.name=f.path);
end $$;
create table public.pw_homework_reviews(
 id uuid primary key default gen_random_uuid(),homework_id text not null unique references public.pw_homework(id),
 student_id text not null references public.pw_students(id),reviewer_id uuid not null references public.pw_profiles(id),
 feedback text not null check(length(trim(feedback)) between 1 and 4000),created_at timestamptz not null default now()
);
alter table public.pw_homework_reviews enable row level security;
revoke all on public.pw_homework_reviews from anon,authenticated;
grant select on public.pw_homework_reviews to authenticated;
create policy pw_review_read on public.pw_homework_reviews for select to authenticated using(public.pw_can_student(student_id));
create or replace function public.pw_review_homework(p_id text,p_feedback text) returns void
language plpgsql security definer set search_path='' as $$
declare h public.pw_homework;
begin
 select * into h from public.pw_homework where id=p_id for update;
 if h.id is null or not coalesce(public.pw_active(),false) or not public.pw_can_student(h.student_id)
   or coalesce(public.pw_role(),'') not in ('super_admin','teacher','qc')
   or (public.pw_role()='teacher' and h.teacher_id<>auth.uid()) then
   raise exception 'Authorized educator required' using errcode='42501';
 end if;
 if h.payload->>'status'<>'submitted' or length(trim(p_feedback)) not between 1 and 4000 then
   raise exception 'Submitted practice and written feedback required' using errcode='22023';
 end if;
 update public.pw_homework set payload=payload||jsonb_build_object('status','reviewed') where id=p_id;
 insert into public.pw_homework_reviews(homework_id,student_id,reviewer_id,feedback) values(h.id,h.student_id,auth.uid(),trim(p_feedback));
end $$;
create or replace function public.pw_attachment_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare field_name text; name_field text; kind text;
begin
 if tg_table_name='pw_payments' then field_name:='receiptPath';name_field:='receiptName';kind:='receipt';
 else field_name:='mediaPath';name_field:='mediaName';kind:='homework';end if;
 if coalesce(new.payload->>name_field,'')<>'' and coalesce(new.payload->>field_name,'')='' then
   raise exception 'Actual uploaded file required' using errcode='22023';
 end if;
 if coalesce(new.payload->>field_name,'')<>'' and not exists(
   select 1 from public.pw_files f join storage.objects o on o.bucket_id='pw-private' and o.name=f.path
   where f.category=kind and f.target_id=new.id and f.path=new.payload->>field_name and f.complete
 ) then raise exception 'Uploaded attachment required' using errcode='22023';end if;
 if tg_table_name='pw_payments' and new.payload->>'status'='receipt_uploaded' and coalesce(new.payload->>'receiptPath','')='' then
   raise exception 'Uploaded receipt required' using errcode='22023';
 end if;
 if tg_table_name='pw_homework' and tg_op='UPDATE' and old.payload->>'status'='reviewed' and new.payload->>'status'<>'reviewed' then
   raise exception 'Reviewed work cannot be ungraded' using errcode='22023';
 end if;
 return new;
end $$;
