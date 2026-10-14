-- QC has educator capabilities only when actually assigned as that class's tutor.
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.pw_guard_record()'::regprocedure);
 if strpos(definition,'if r=''teacher'' and (not changed')=0 then raise exception 'Expected educator guard missing';end if;
 definition:=replace(definition,'if r=''teacher'' and (not changed','if r in(''teacher'',''qc'') and (not changed');
 execute definition;
 definition:=pg_get_functiondef('public.pw_classroom_participant_allowed(uuid,uuid)'::regprocedure);
 if strpos(definition,'p.role=''qc'' and t.qc_id=p.id')=0 then raise exception 'Expected QC classroom guard missing';end if;
 definition:=replace(definition,'p.role=''qc'' and t.qc_id=p.id','p.role=''qc'' and (t.qc_id=p.id or l.teacher_id=p.id)');
 execute definition;
end $$;
create function public.pw_sales_callback_notice() returns trigger language plpgsql security definer set search_path='' as $$
declare due timestamptz;task uuid;k text;hours integer;
begin
 if new.owner_id is null or not exists(select 1 from public.pw_profiles where id=new.owner_id and role='sales_marketing' and status='active') then return new;end if;
 if new.payload->>'status'='callback' then
  if nullif(new.payload->>'callbackAt','') is null then raise exception 'Callback date required' using errcode='22023';end if;
  begin due:=(new.payload->>'callbackAt')::timestamptz;exception when others then raise exception 'Valid callback date required' using errcode='22023';end;
  if due<=now() then raise exception 'Future callback date required' using errcode='22023';end if;
  if tg_op='UPDATE' and old.owner_id is not distinct from new.owner_id and old.payload->>'status'='callback'
   and old.payload->>'callbackAt'=new.payload->>'callbackAt' then return new;end if;
  k:='callback';
 elsif new.payload->>'status'='nursery' then
  if tg_op='UPDATE' and old.owner_id is not distinct from new.owner_id and old.payload->>'status'='nursery' then return new;end if;
  select followup_hours into hours from public.pw_management_rules;
  due:=now()+make_interval(hours=>hours);k:='nursery';
 else
  update public.pw_desk_items set status='cancelled',revision=revision+1,notes='Lead moved out of its prior callback/nursery state',updated_at=now()
   where lead_id=new.id and dedup_key like 'lead-desk:%' and status in('open','in_progress');
  return new;
 end if;
 update public.pw_desk_items set status='cancelled',revision=revision+1,notes='Callback date or responsible Sales changed',updated_at=now()
 where lead_id=new.id and dedup_key like 'lead-desk:%' and status in('open','in_progress');
 insert into public.pw_desk_items(kind,lead_id,assigned_to,created_by,due_at,notes,dedup_key)
 values(k,new.id,new.owner_id,new.owner_id,due,'Contact the assigned prospect and record the actual outcome.',
 'lead-desk:'||new.id||':'||new.revision||':'||k) returning id into task;
 perform public.pw_queue_notice(new.owner_id,'Sales '||k||' follow-up','A prospect follow-up is due. Open your private Management desk for the assigned contact.',
 'pw_desk_items',task::text,'sales-lead-due:'||task,due);
 return new;
end $$;
create trigger pw_sales_callback_notice after insert or update on public.pw_leads for each row execute function public.pw_sales_callback_notice();
create function public.pw_reconcile_cold_leads() returns integer language plpgsql security definer set search_path='' as $$
declare lead public.pw_leads;hours integer;count_updated integer:=0;
begin
 if not pg_try_advisory_xact_lock(1791819741) then return 0;end if;
 select followup_hours into hours from public.pw_management_rules;
 for lead in select l.* from public.pw_leads l join public.pw_profiles p on p.id=l.owner_id
  where l.payload->>'status' in('new','contacted') and l.trial_lesson_id is null
  and p.status='active' and p.role='sales_marketing' and l.updated_at<=now()-make_interval(hours=>hours)
  order by l.updated_at,l.id for update of l skip locked limit 100 loop
  update public.pw_leads set payload=jsonb_set(payload,'{status}','"nursery"') where id=lead.id;
  insert into public.pw_audit(actor_name,actor_role,entity_type,entity_id,action,changed_fields)
  values('Academy automation','system','leads',lead.id,'Unbooked inactive prospect moved to consent-aware nursery',array['status']);
  count_updated:=count_updated+1;
 end loop;
 return count_updated;
end $$;
revoke all on function public.pw_reconcile_cold_leads() from public,anon,authenticated;
grant execute on function public.pw_reconcile_cold_leads() to service_role;
notify pgrst,'reload schema';
