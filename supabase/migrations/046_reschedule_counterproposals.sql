alter table public.pw_reschedules add column counter_slots jsonb,add column counter_reason text,
 add column counter_accepted_at timestamptz,add column counter_selected timestamptz;
create table public.pw_reschedule_counters(
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.pw_reschedules(id),
 teacher_id uuid not null references public.pw_profiles(id),slots jsonb not null,reason text not null,
 created_at timestamptz not null default now(),accepted_by uuid references public.pw_profiles(id),
 accepted_at timestamptz,selected_slot timestamptz
);
alter table public.pw_reschedule_counters enable row level security;
revoke all on public.pw_reschedule_counters from anon,authenticated;
grant select on public.pw_reschedule_counters to authenticated;
create policy pw_counter_read on public.pw_reschedule_counters for select to authenticated
 using(public.pw_active() and exists(select 1 from public.pw_reschedules r where r.id=request_id and public.pw_can_student(r.student_id)));
create function public.pw_counter_reschedule(p_id uuid,p_slots jsonb,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.pw_reschedules;l public.pw_lessons;v jsonb;
begin
 select * into r from public.pw_reschedules where id=p_id for update;
 select * into l from public.pw_lessons where id=r.lesson_id;
 if not public.pw_active() or l.teacher_id<>auth.uid() or public.pw_role() not in('teacher','qc') or r.status<>'pending' or r.teacher_approved
 then raise exception 'Assigned teacher and pending request required' using errcode='42501';end if;
 if length(trim(p_reason)) not between 5 and 4000 or jsonb_typeof(p_slots)<>'array' or jsonb_array_length(p_slots) not between 1 and 10
 then raise exception 'Reason and alternative times required' using errcode='22023';end if;
 for v in select value from jsonb_array_elements(p_slots) loop
  if(v#>>'{}')::timestamptz<=now() then raise exception 'Future alternative required' using errcode='22023';end if;
 end loop;
 insert into public.pw_reschedule_counters(request_id,teacher_id,slots,reason) values(r.id,auth.uid(),p_slots,trim(p_reason));
 update public.pw_reschedules set counter_slots=p_slots,counter_reason=trim(p_reason),counter_selected=null,counter_accepted_at=null where id=r.id;
 insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,student_id,action,changed_fields)
 values(auth.uid(),(select name from public.pw_profiles where id=auth.uid()),public.pw_role(),'pw_reschedules',r.id::text,r.student_id,'Teacher offered alternatives: '||trim(p_reason),array['counter_slots','counter_reason']);
end $$;
create function public.pw_accept_counter(p_id uuid,p_slot timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare r public.pw_reschedules;counter_id uuid;
begin
 select * into r from public.pw_reschedules where id=p_id for update;
 if not public.pw_active() or not exists(select 1 from public.pw_students where id=r.student_id and parent_id=auth.uid())
  or r.status<>'pending' or r.counter_slots is null or r.counter_accepted_at is not null
 then raise exception 'Linked guardian and pending alternative required' using errcode='42501';end if;
 if p_slot<=now() or not exists(select 1 from jsonb_array_elements_text(r.counter_slots) x where x::timestamptz=p_slot)
 then raise exception 'Choose an offered future time' using errcode='22023';end if;
 select id into counter_id from public.pw_reschedule_counters where request_id=r.id order by created_at desc,id desc limit 1;
 update public.pw_reschedule_counters set accepted_by=auth.uid(),accepted_at=now(),selected_slot=p_slot where id=counter_id;
 update public.pw_reschedules set slots=jsonb_build_array(p_slot),counter_accepted_at=now(),counter_selected=p_slot where id=r.id;
 insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,student_id,action,changed_fields)
 values(auth.uid(),(select name from public.pw_profiles where id=auth.uid()),public.pw_role(),'pw_reschedules',r.id::text,r.student_id,'Guardian accepted teacher alternative',array['counter_accepted_at','slots']);
end $$;
alter function public.pw_decide_reschedule(uuid,text,timestamptz,text) rename to pw_decide_reschedule_base;
create function public.pw_decide_reschedule(p_id uuid,p_decision text,p_slot timestamptz default null,p_note text default '') returns void
language plpgsql security definer set search_path='' as $$
declare r public.pw_reschedules;
begin
 select * into r from public.pw_reschedules where id=p_id for update;
 if p_decision='reject' and length(trim(coalesce(p_note,'')))<5 then raise exception 'Written refusal reason required' using errcode='22023';end if;
 if p_decision='approve' and r.counter_slots is not null and(r.counter_accepted_at is null or p_slot is distinct from r.counter_selected)
 then raise exception 'Guardian must accept an offered alternative first' using errcode='22023';end if;
 perform public.pw_decide_reschedule_base(p_id,p_decision,p_slot,p_note);
end $$;
revoke all on function public.pw_decide_reschedule_base(uuid,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.pw_counter_reschedule(uuid,jsonb,text),public.pw_accept_counter(uuid,timestamptz),public.pw_decide_reschedule(uuid,text,timestamptz,text) from public,anon;
grant execute on function public.pw_counter_reschedule(uuid,jsonb,text),public.pw_accept_counter(uuid,timestamptz),public.pw_decide_reschedule(uuid,text,timestamptz,text) to authenticated;
