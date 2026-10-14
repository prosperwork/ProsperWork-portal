-- Parents may follow their request, but cannot update the senior review task.
-- Keep the original action function private and preserve the rules action.
create or replace function public.pw_management_action(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.pw_desk_items; actor uuid:=auth.uid(); r text:=public.pw_role();
begin
 if p_action='update' then
  select * into d from public.pw_desk_items where id=(p_data->>'id')::uuid for update;
  if d.kind='priority' and not coalesce(
   public.pw_active() and (r='super_admin' or (r='head_admin' and d.assigned_to=actor)),false
  ) then
   raise exception 'Assigned senior staff must review this escalation' using errcode='42501';
  end if;
 end if;
 if p_action='rules' then
  if not coalesce(public.pw_active() and r='super_admin',false) then raise exception 'Owner required' using errcode='42501';end if;
  if length(trim(p_data->>'notes'))<5 then raise exception 'Reason required' using errcode='22023';end if;
  update public.pw_management_rules set stagnant_days=(p_data->>'stagnantDays')::integer,empty_board_classes=(p_data->>'emptyBoardClasses')::integer,
   followup_hours=(p_data->>'followupHours')::integer,escalation_hours=(p_data->>'escalationHours')::integer,late_grace_minutes=(p_data->>'lateGraceMinutes')::integer;
  insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,action,changed_fields)
  values(actor,(select name from public.pw_profiles where id=actor),'super_admin','management_rules','singleton','Rules updated: '||trim(p_data->>'notes'),array['rules']);
  return jsonb_build_object('updated',true);
 end if;
 return public.pw_management_action_base(p_action,p_data);
end $$;
revoke all on function public.pw_management_action(text,jsonb) from public,anon;
revoke all on function public.pw_management_action_base(text,jsonb) from public,anon,authenticated;
grant execute on function public.pw_management_action(text,jsonb) to authenticated;
