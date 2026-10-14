create table public.pw_lesson_boards(
 lesson_id text primary key references public.pw_lessons(id), original_notes text not null,
 notes text not null, next_topics text not null, completed_topics jsonb not null default '[]',
 revision integer not null default 1, updated_by uuid not null default auth.uid(), updated_at timestamptz not null default clock_timestamp()
);
alter table public.pw_lesson_boards enable row level security;
revoke all on public.pw_lesson_boards from anon,authenticated;
grant select on public.pw_lesson_boards to authenticated;
create policy pw_board_read on public.pw_lesson_boards for select to authenticated using(
 exists(select 1 from public.pw_lessons l where l.id=lesson_id and public.pw_can_student(l.student_id))
);
create function public.pw_save_board(p_lesson text,p_revision integer,p_notes text,p_next text,p_topics jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.pw_lessons; b public.pw_lesson_boards; r text:=public.pw_role();
begin
 select * into l from public.pw_lessons where id=p_lesson;
 if l.id is null or not public.pw_active() or not public.pw_can_student(l.student_id)
  or not (r='super_admin' or (r='teacher' and l.teacher_id=auth.uid()) or r='qc')
 then raise exception 'Assigned teaching staff only' using errcode='42501'; end if;
 if length(p_notes)>20000 or length(p_next)>20000 or jsonb_typeof(p_topics)<>'array' or jsonb_array_length(p_topics)>200
  or exists(select 1 from jsonb_array_elements(p_topics) x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 500)
 then raise exception 'Invalid lesson board' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_lesson,120));
 select * into b from public.pw_lesson_boards where lesson_id=p_lesson for update;
 if coalesce(b.revision,0)<>p_revision then raise exception 'Board changed; reload before saving' using errcode='40001'; end if;
 insert into public.pw_lesson_boards(lesson_id,original_notes,notes,next_topics,completed_topics)
 values(p_lesson,coalesce(l.payload->>'notes',''),p_notes,p_next,p_topics)
 on conflict(lesson_id) do update set notes=excluded.notes,next_topics=excluded.next_topics,completed_topics=excluded.completed_topics,
 revision=p_revision+1,updated_by=auth.uid(),updated_at=clock_timestamp()
 returning * into b;
 insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,subject_id,action)
 select auth.uid(),name,role,'lesson_board',p_lesson,l.teacher_id,'Lesson board saved' from public.pw_profiles where id=auth.uid();
 return to_jsonb(b);
end $$;
revoke all on function public.pw_save_board(text,integer,text,text,jsonb) from public,anon;
grant execute on function public.pw_save_board(text,integer,text,text,jsonb) to authenticated;

alter table public.pw_resources add column archived_at timestamptz;
drop policy pw_resource_read on public.pw_resources;
create policy pw_resource_read on public.pw_resources for select to authenticated using(
 public.pw_role() in('super_admin','qc') or (archived_at is null and public.pw_role() in('teacher','parent','student'))
);
create function public.pw_save_resource(p_id text,p_revision integer,p_payload jsonb,p_archive boolean default false) returns integer
language plpgsql security definer set search_path='' as $$
declare old public.pw_resources; result integer;
begin
 if public.pw_role() not in('super_admin','qc') or not coalesce(public.pw_active(),false)
 then raise exception 'Owner or QC only' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id,121));
 select * into old from public.pw_resources where id=p_id for update;
 if coalesce(old.revision,0)<>p_revision or old.archived_at is not null then raise exception 'Resource changed' using errcode='40001'; end if;
 if p_archive then
  if old.id is null then raise exception 'Resource missing' using errcode='22023'; end if;
  update public.pw_resources set archived_at=clock_timestamp(),revision=revision+1 where id=p_id returning revision into result;
 else
  if p_payload->>'id' is distinct from p_id or length(p_id) not between 1 and 100
   or length(p_payload->>'title') not between 1 and 120 or p_payload->>'type' not in('song','guide','exercise','video')
   or length(p_payload->>'instrument') not between 1 and 120 or length(p_payload->>'level') not between 1 and 120
   or length(p_payload->>'summary')>4000 or p_payload ? 'fileId' or p_payload ? 'fileName'
   or not p_payload ?& array['id','title','type','instrument','level','summary']
  then raise exception 'Invalid resource' using errcode='22023'; end if;
  p_payload:=p_payload||case when old.payload ? 'fileId' then jsonb_build_object('fileId',old.payload->>'fileId','fileName',old.payload->>'fileName') else '{}'::jsonb end;
  insert into public.pw_resources(id,payload) values(p_id,p_payload)
  on conflict(id) do update set payload=excluded.payload,revision=p_revision+1,updated_at=clock_timestamp()
  returning revision into result;
 end if;
 insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,action)
 select auth.uid(),name,role,'curriculum',p_id,case when p_archive then 'Curriculum resource removed' else 'Curriculum resource saved' end from public.pw_profiles where id=auth.uid();
 return result;
end $$;
revoke all on function public.pw_save_resource(text,integer,jsonb,boolean) from public,anon;
grant execute on function public.pw_save_resource(text,integer,jsonb,boolean) to authenticated;

alter table public.pw_files drop constraint pw_files_category_check;
alter table public.pw_files add constraint pw_files_category_check check(category in('receipt','homework','curriculum'));
do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.pw_file_allowed(text,text,boolean)'::regprocedure) into definition;
 if position('else false end,false)' in definition)=0 then raise exception 'Unexpected private-file policy'; end if;
 definition:=replace(definition,'else false end,false)',$new$
 when p_category='curriculum' then exists(select 1 from public.pw_resources r where r.id=p_target and r.archived_at is null)
  and case when p_write then public.pw_role() in('super_admin','qc') else public.pw_role() in('super_admin','qc','teacher','parent','student') end
 else false end,false)$new$);
 execute definition;
end;
$migration$;
create function public.pw_finish_curriculum_file(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare f public.pw_files;
begin
 select * into f from public.pw_files where id=p_id for update;
 if f.id is null or f.complete or f.uploader_id<>auth.uid() or f.category<>'curriculum' or not public.pw_file_allowed(f.category,f.target_id,true)
 then raise exception 'Invalid resource upload' using errcode='42501'; end if;
 if not exists(select 1 from storage.objects where bucket_id='pw-private' and name=f.path and (metadata->>'size')::bigint=f.bytes and metadata->>'mimetype'=f.mime)
 then raise exception 'Actual stored object required' using errcode='22023'; end if;
 update public.pw_files set complete=true where id=f.id;
 update public.pw_resources set payload=payload||jsonb_build_object('fileId',f.id,'fileName',f.original_name),revision=revision+1 where id=f.target_id;
end $$;
revoke all on function public.pw_finish_curriculum_file(uuid) from public,anon;
grant execute on function public.pw_finish_curriculum_file(uuid) to authenticated;
create function public.pw_guard_curriculum_attachment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.payload ? 'fileId' and not exists(
  select 1 from public.pw_files f where f.id::text=new.payload->>'fileId' and f.category='curriculum'
   and f.target_id=new.id and f.complete and f.original_name=new.payload->>'fileName'
 ) then raise exception 'Only verified curriculum uploads can be attached' using errcode='22023'; end if;
 return new;
end $$;
create trigger pw_resource_attachment before insert or update on public.pw_resources for each row execute function public.pw_guard_curriculum_attachment();
revoke all on function public.pw_guard_curriculum_attachment() from public,anon,authenticated;
do $migration$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime' and not puballtables) then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='pw_lesson_boards') then
   alter publication supabase_realtime add table public.pw_lesson_boards;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='pw_resources') then
   alter publication supabase_realtime add table public.pw_resources;
  end if;
 end if;
end;
$migration$;
