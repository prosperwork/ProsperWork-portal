-- Client clarification: normally 45–60 minutes (default 60); individually
-- requested extensions may run up to three hours. They never bypass conflicts.
alter table public.pw_settings add constraint pw_standard_lesson_lengths check(
 (settings->>'standardMinutes')::integer between 45 and 60
 and (settings->>'trialMinutes')::integer between 45 and 60
 and (settings->>'coverMinutes')::integer between 45 and 60
);
create or replace function public.pw_lesson_duration() returns trigger
language plpgsql security definer set search_path='' as $$
declare rule text; duration integer; r text:=public.pw_role();
begin
 if tg_op='UPDATE' then
  if new.duration_minutes is distinct from old.duration_minutes
   or (old.payload ? 'durationMinutes' and not (new.payload ? 'durationMinutes'))
   or (new.payload ? 'durationMinutes' and (new.payload->>'durationMinutes')::integer<>old.duration_minutes)
   or new.payload->>'durationReason' is distinct from old.payload->>'durationReason'
  then raise exception 'Duration agreement is immutable; cancel and schedule a replacement' using errcode='42501'; end if;
 else
  rule:=case new.payload->>'kind' when 'trial' then 'trialMinutes' when 'cover' then 'coverMinutes' else 'standardMinutes' end;
  select (settings->>rule)::integer into duration from public.pw_settings where singleton;
  if new.payload ? 'durationMinutes' then
   if r not in('super_admin','head_admin','admin') or r is null then raise exception 'Staff must approve a duration agreement' using errcode='42501'; end if;
   if jsonb_typeof(new.payload->'durationMinutes')<>'number' or (new.payload->>'durationMinutes')::numeric<>trunc((new.payload->>'durationMinutes')::numeric)
   then raise exception 'Whole-minute duration required' using errcode='22023'; end if;
   duration:=(new.payload->>'durationMinutes')::integer;
  end if;
  if duration not between 45 and 180 or duration is null then raise exception 'Class duration must be 45–180 minutes' using errcode='22023'; end if;
  if duration>60 and length(trim(coalesce(new.payload->>'durationReason','')))<5
  then raise exception 'Record the family request/agreement for an extended class' using errcode='22023'; end if;
  new.duration_minutes:=duration;
  new.payload:=new.payload||jsonb_build_object('durationMinutes',duration);
 end if;
 return new;
end $$;
