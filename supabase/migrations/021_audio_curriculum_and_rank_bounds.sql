do $migration$
declare definition text;
begin
 select pg_get_functiondef('public.pw_reserve_file(text,text,text,text,bigint)'::regprocedure) into definition;
 definition:=replace(definition,'''video/mp4'',''video/webm'')','''video/mp4'',''video/webm'',''audio/mpeg'',''audio/wav'',''audio/x-wav'',''audio/ogg'',''audio/webm'')');
 execute definition;
end;
$migration$;
update storage.buckets set allowed_mime_types=(
 select array_agg(distinct mime) from unnest(allowed_mime_types||array['audio/mpeg','audio/wav','audio/x-wav','audio/ogg','audio/webm']) mime
) where id='pw-private' and allowed_mime_types is not null;
create function public.pw_guard_rank() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.payload->>'rank' is distinct from old.payload->>'rank'
  and (public.pw_role() is null or public.pw_role() not in('super_admin','qc','teacher'))
 then raise exception 'Only assigned teachers, QC or owner may grade rank' using errcode='42501'; end if;
 return new;
end $$;
create trigger pw_student_rank before update on public.pw_students for each row execute function public.pw_guard_rank();
revoke all on function public.pw_guard_rank() from public,anon,authenticated;
