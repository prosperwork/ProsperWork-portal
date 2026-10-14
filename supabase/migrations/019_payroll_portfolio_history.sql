-- Financial portfolio history contains IDs/status only, never DOB or notes.
create table public.pw_salary_roster_history(
 id bigint generated always as identity primary key, student_id text not null,
 parent_id uuid not null, admin_id uuid, student_status text not null, parent_status text not null,
 recorded_at timestamptz not null default clock_timestamp()
);
create index pw_salary_roster_time on public.pw_salary_roster_history(student_id,recorded_at desc,id desc);
create table public.pw_salary_history_epoch(singleton boolean primary key default true check(singleton), begins_at timestamptz not null default clock_timestamp());
insert into public.pw_salary_history_epoch(singleton) values(true);
create table public.pw_salary_parent_snapshots(
 staff_id uuid not null references public.pw_profiles(id), pay_date date not null, active_parents integer not null check(active_parents between 0 and 1000),
 reason text not null, confirmed_by uuid not null default auth.uid(), confirmed_at timestamptz not null default clock_timestamp(),
 primary key(staff_id,pay_date), check(extract(day from pay_date)=28)
);
alter table public.pw_salary_roster_history enable row level security;
alter table public.pw_salary_history_epoch enable row level security;
alter table public.pw_salary_parent_snapshots enable row level security;
revoke all on public.pw_salary_roster_history,public.pw_salary_history_epoch,public.pw_salary_parent_snapshots from anon,authenticated;
grant select on public.pw_salary_roster_history,public.pw_salary_parent_snapshots to authenticated;
create policy pw_roster_history_read on public.pw_salary_roster_history for select to authenticated using(public.pw_role() in('super_admin','finance'));
create policy pw_parent_snapshot_read on public.pw_salary_parent_snapshots for select to authenticated using(public.pw_role() in('super_admin','finance'));
insert into public.pw_salary_roster_history(student_id,parent_id,admin_id,student_status,parent_status)
 select s.id,s.parent_id,s.admin_id,s.payload->>'status',p.status from public.pw_students s join public.pw_profiles p on p.id=s.parent_id;

create function public.pw_salary_roster_capture() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='pw_students' then
  if tg_op='UPDATE' and (new.parent_id,new.admin_id,new.payload->>'status') is not distinct from (old.parent_id,old.admin_id,old.payload->>'status') then return new; end if;
  insert into public.pw_salary_roster_history(student_id,parent_id,admin_id,student_status,parent_status)
   select new.id,new.parent_id,new.admin_id,new.payload->>'status',p.status from public.pw_profiles p where p.id=new.parent_id;
 else
  if new.status is not distinct from old.status then return new; end if;
  insert into public.pw_salary_roster_history(student_id,parent_id,admin_id,student_status,parent_status)
   select s.id,s.parent_id,s.admin_id,s.payload->>'status',new.status from public.pw_students s where s.parent_id=new.id;
 end if;
 return new;
end $$;
create trigger pw_salary_student_roster after insert or update on public.pw_students for each row execute function public.pw_salary_roster_capture();
create trigger pw_salary_parent_roster after update of status on public.pw_profiles for each row execute function public.pw_salary_roster_capture();
revoke all on function public.pw_salary_roster_capture() from public,anon,authenticated;

create function public.pw_confirm_salary_parent_count(p_staff uuid,p_date date,p_count integer,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if public.pw_role() is distinct from 'super_admin' then raise exception 'Owner must confirm historical parent counts' using errcode='42501'; end if;
 if p_count not between 0 and 1000 or extract(day from p_date)<>28 or p_date>(clock_timestamp() at time zone 'Africa/Lagos')::date
  or length(trim(p_reason))<5 or length(p_reason)>2000
  or not exists(select 1 from public.pw_profiles where id=p_staff and role='admin')
 then raise exception 'Valid historical payday count and source/reason required' using errcode='22023'; end if;
 if exists(select 1 from public.pw_salary_batches where pay_date=p_date and status<>'draft')
 then raise exception 'Finalized portfolio counts cannot be changed' using errcode='40001'; end if;
 insert into public.pw_salary_parent_snapshots(staff_id,pay_date,active_parents,reason)
 values(p_staff,p_date,p_count,trim(p_reason))
 on conflict(staff_id,pay_date) do update set active_parents=excluded.active_parents,reason=excluded.reason,confirmed_by=auth.uid(),confirmed_at=clock_timestamp();
 perform public.pw_salary_audit('salary_parent_count',p_staff::text,'Owner confirmed historical parent count for '||p_date::text||': '||trim(p_reason),p_staff);
end $$;
revoke all on function public.pw_confirm_salary_parent_count(uuid,date,integer,text) from public,anon;
grant execute on function public.pw_confirm_salary_parent_count(uuid,date,integer,text) to authenticated;

create function public.pw_salary_parent_count(p_staff uuid,p_date date) returns integer
language plpgsql security definer set search_path='' as $$
declare cutoff timestamptz:=least(p_date::timestamp at time zone 'Africa/Lagos',clock_timestamp()); result integer; epoch timestamptz;
begin
 select active_parents into result from public.pw_salary_parent_snapshots where staff_id=p_staff and pay_date=p_date;
 if found then return result; end if;
 select begins_at into epoch from public.pw_salary_history_epoch where singleton;
 if cutoff<epoch then return null; end if;
 select count(distinct parent_id) into result from(
  select distinct on(student_id) parent_id,admin_id,student_status,parent_status
  from public.pw_salary_roster_history where recorded_at<=cutoff order by student_id,recorded_at desc,id desc
 ) h where admin_id=p_staff and student_status='active' and parent_status='active';
 return result;
end $$;
revoke all on function public.pw_salary_parent_count(uuid,date) from public,anon,authenticated;

do $migration$
declare definition text; old_fragment text;
begin
 select pg_get_functiondef('public.pw_calculate_salary(date,uuid)'::regprocedure) into definition;
 old_fragment:=$old$select count(distinct s.parent_id) into used from public.pw_students s join public.pw_profiles p on p.id=s.parent_id
     where s.admin_id=staff.id and s.payload->>'status'='active' and p.status='active';$old$;
 if position(old_fragment in definition)=0 then raise exception 'Unexpected portfolio calculator definition'; end if;
 definition:=replace(definition,old_fragment,$new$
    used:=public.pw_salary_parent_count(staff.id,p_date);
    if used is null then
     if (current_rate.terms->>'adminExtraParentRate')::numeric>0 then
      issues:=issues||jsonb_build_array(jsonb_build_object('staffId',staff.id,'staffName',staff.name,'message','Owner must confirm the historical active-parent count; portfolio history is unavailable for this payday'));
     end if;
     used:=0;
    end if;$new$);
 execute definition;
end;
$migration$;
