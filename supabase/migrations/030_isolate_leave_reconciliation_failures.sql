alter table public.pw_leaves add column synchronization_error text;
alter table public.pw_leaves add column synchronization_attempts integer not null default 0;
create or replace function public.pw_reconcile_leaves() returns void language plpgsql security definer set search_path='' as $$
declare l public.pw_leaves;
begin
 for l in select * from public.pw_leaves where state in('approved','active') and starts_at<=clock_timestamp() for update skip locked loop
  begin
   if l.ends_at<=clock_timestamp() then
    update public.pw_leaves set state='completed',closed_at=l.ends_at where id=l.id;
    perform public.pw_restore_leave_lessons(l.id);perform public.pw_leave_audit(l.id,'Leave ended; unverified assignments restored');
   elsif l.state='approved' then
    perform public.pw_apply_leave_lessons(l.id);
    update public.pw_profiles set status='on_leave' where id=l.staff_id and status='active';
    update public.pw_leaves set state='active',activated_at=clock_timestamp() where id=l.id;
    update public.pw_leave_covers set applied_at=clock_timestamp() where leave_id=l.id;
    perform public.pw_leave_audit(l.id,'Leave started; temporary cover active');
   end if;
   update public.pw_leaves set synchronization_error=null where id=l.id;
  exception when others then
   update public.pw_leaves set synchronization_error='Leave plan could not be applied. Head Admin or Owner must review classroom assignments and capacity.',
    synchronization_attempts=synchronization_attempts+1 where id=l.id;
  end;
 end loop;
end $$;
revoke all on function public.pw_reconcile_leaves() from public,anon,authenticated;
grant execute on function public.pw_reconcile_leaves() to service_role;
