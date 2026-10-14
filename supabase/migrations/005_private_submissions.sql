insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pw-private','pw-private',false,52428800,array['application/pdf','image/png','image/jpeg','video/mp4','video/webm'])
on conflict(id) do nothing;
do $$ begin
  if exists(select 1 from storage.buckets where id='pw-private' and public) then
    raise exception 'ProsperWork requires a private storage bucket';
  end if;
end $$;

create table public.pw_files(
  id uuid primary key default gen_random_uuid(),
  uploader_id uuid not null references public.pw_profiles(id),
  category text not null check(category in ('receipt','homework')),
  target_id text not null,
  path text not null unique,
  original_name text not null,
  mime text not null,
  bytes bigint not null check(bytes>0 and bytes<=52428800),
  complete boolean not null default false,
  created_at timestamptz not null default now()
);
create function public.pw_file_allowed(p_category text,p_target text,p_write boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(public.pw_role() is not null and case
    when p_category='receipt' then exists(
      select 1 from public.pw_payments p where p.id=p_target
      and (p.parent_id=auth.uid() or public.pw_role() in ('super_admin','general_manager','finance'))
      and (not p_write or p.payload->>'status'<>'paid'))
    when p_category='homework' then exists(
      select 1 from public.pw_homework h join public.pw_students s on s.id=h.student_id
      where h.id=p_target and public.pw_can_student(h.student_id)
      and (not p_write or ((s.parent_id=auth.uid() or s.student_user_id=auth.uid())
        and h.payload->>'status' in ('assigned','submitted'))))
    else false end,false)
$$;
alter table public.pw_files enable row level security;
revoke all on public.pw_files from anon,authenticated;
grant select on public.pw_files to authenticated;
create policy pw_file_read on public.pw_files for select to authenticated
using(public.pw_file_allowed(category,target_id) and (complete or uploader_id=auth.uid()));
revoke all on function public.pw_file_allowed(text,text,boolean) from public;
grant execute on function public.pw_file_allowed(text,text,boolean) to authenticated,anon;

create function public.pw_reserve_file(p_category text,p_target text,p_name text,p_mime text,p_bytes bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare fid uuid:=gen_random_uuid(); object_path text;
begin
  if not coalesce(public.pw_active(),false) or not public.pw_file_allowed(p_category,p_target,true) then
    raise exception 'Unauthorized submission' using errcode='42501';
  end if;
  if length(p_name) not between 1 and 200 or p_bytes<=0 or p_bytes>52428800
    or p_mime not in ('application/pdf','image/png','image/jpeg','video/mp4','video/webm')
    or (p_category='receipt' and (p_bytes>10485760 or p_mime not in ('application/pdf','image/png','image/jpeg'))) then
    raise exception 'Invalid file' using errcode='22023';
  end if;
  object_path:=auth.uid()::text||'/'||fid::text;
  insert into public.pw_files(id,uploader_id,category,target_id,path,original_name,mime,bytes)
  values(fid,auth.uid(),p_category,p_target,object_path,p_name,p_mime,p_bytes);
  return jsonb_build_object('id',fid,'path',object_path);
end $$;
create function public.pw_storage_allowed(p_path text,p_write boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.pw_files f where f.path=p_path
    and public.pw_file_allowed(f.category,f.target_id,p_write)
    and case when p_write then public.pw_active() and f.uploader_id=auth.uid() and not f.complete
      else f.complete or f.uploader_id=auth.uid() end)
$$;
revoke all on function public.pw_storage_allowed(text,boolean) from public;
grant execute on function public.pw_storage_allowed(text,boolean) to authenticated,anon;
create policy pw_storage_read on storage.objects for select to authenticated
using(bucket_id='pw-private' and public.pw_storage_allowed(name));
create policy pw_storage_insert on storage.objects for insert to authenticated
with check(bucket_id='pw-private' and public.pw_storage_allowed(name,true));
create policy pw_storage_remove_incomplete on storage.objects for delete to authenticated
using(bucket_id='pw-private' and public.pw_storage_allowed(name,true));
-- Restrictive policies protect our bucket even if an older project-wide permissive policy exists.
create policy pw_storage_private_read on storage.objects as restrictive for select to public
using(bucket_id<>'pw-private' or public.pw_storage_allowed(name));
create policy pw_storage_private_insert on storage.objects as restrictive for insert to public
with check(bucket_id<>'pw-private' or public.pw_storage_allowed(name,true));
create policy pw_storage_private_update on storage.objects as restrictive for update to public
using(bucket_id<>'pw-private') with check(bucket_id<>'pw-private');
create policy pw_storage_private_delete on storage.objects as restrictive for delete to public
using(bucket_id<>'pw-private' or public.pw_storage_allowed(name,true));

create function public.pw_submit_homework(p_id text,p_note text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not coalesce(public.pw_active(),false) or not public.pw_file_allowed('homework',p_id,true) then
    raise exception 'Unauthorized submission' using errcode='42501';
  end if;
  if length(trim(p_note)) not between 1 and 4000 then raise exception 'A practice note is required' using errcode='22023'; end if;
  update public.pw_homework set payload=payload||jsonb_build_object('status','submitted','submissionNote',trim(p_note)) where id=p_id;
end $$;
create function public.pw_finish_file(p_id uuid,p_note text default '')
returns void language plpgsql security definer set search_path='' as $$
declare f public.pw_files;
begin
  select * into f from public.pw_files where id=p_id for update;
  if f.id is null or f.uploader_id<>auth.uid() or not coalesce(public.pw_active(),false)
    or not public.pw_file_allowed(f.category,f.target_id,true) then
    raise exception 'Unauthorized submission' using errcode='42501';
  end if;
  if f.complete then return; end if;
  if length(p_note)>4000 then raise exception 'Note too long' using errcode='22023'; end if;
  if not exists(select 1 from storage.objects where bucket_id='pw-private' and name=f.path
    and (metadata->>'size')::bigint=f.bytes and metadata->>'mimetype'=f.mime) then
    raise exception 'Actual uploaded file required' using errcode='22023';
  end if;
  update public.pw_files set complete=true where id=f.id;
  if f.category='receipt' then
    update public.pw_payments set payload=payload||jsonb_build_object('status','receipt_uploaded','receiptPath',f.path,'receiptName',f.original_name)
    where id=f.target_id;
  else
    update public.pw_homework set payload=payload||jsonb_build_object('status','submitted','mediaPath',f.path,'mediaName',f.original_name,'submissionNote',trim(p_note))
    where id=f.target_id;
  end if;
end $$;
create function public.pw_abort_file(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin delete from public.pw_files where id=p_id and uploader_id=auth.uid() and not complete; end $$;
create function public.pw_review_homework(p_id text,p_feedback text) returns void
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
  update public.pw_homework set payload=payload||jsonb_build_object('status','reviewed','note',trim(p_feedback)) where id=p_id;
end $$;
create function public.pw_attachment_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare field_name text; kind text;
begin
  if tg_table_name='pw_payments' then field_name:='receiptPath';kind:='receipt';
  else field_name:='mediaPath';kind:='homework'; end if;
  if coalesce(new.payload->>field_name,'')<>'' and not exists(
    select 1 from public.pw_files f join storage.objects o on o.bucket_id='pw-private' and o.name=f.path
    where f.category=kind and f.target_id=new.id and f.path=new.payload->>field_name and f.complete
  ) then raise exception 'Uploaded attachment required' using errcode='22023'; end if;
  if tg_table_name='pw_payments' and new.payload->>'status'='receipt_uploaded'
    and coalesce(new.payload->>'receiptPath','')='' then
    raise exception 'Uploaded receipt required' using errcode='22023';
  end if;
  if tg_table_name='pw_homework' and tg_op='UPDATE' and old.payload->>'status'='reviewed'
    and new.payload->>'status'<>'reviewed' then
    raise exception 'Reviewed work cannot be ungraded' using errcode='22023';
  end if;
  return new;
end $$;
create trigger pw_attachment before insert or update on public.pw_payments for each row execute function public.pw_attachment_guard();
create trigger pw_attachment before insert or update on public.pw_homework for each row execute function public.pw_attachment_guard();
revoke all on function public.pw_reserve_file(text,text,text,text,bigint), public.pw_finish_file(uuid,text),
 public.pw_abort_file(uuid),public.pw_submit_homework(text,text),public.pw_review_homework(text,text) from public,anon;
grant execute on function public.pw_reserve_file(text,text,text,text,bigint),public.pw_finish_file(uuid,text),
 public.pw_abort_file(uuid),public.pw_submit_homework(text,text),public.pw_review_homework(text,text) to authenticated;
