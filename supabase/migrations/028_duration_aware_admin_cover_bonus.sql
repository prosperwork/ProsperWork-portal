-- Cover bonuses use distinct active families, archived roster states, real
-- interval boundaries and the existing approved monthly quota/rate. Fixed
-- salaries are not reduced for leave.
create function public.pw_admin_leave_bonus(p_staff uuid,p_date date,p_quota integer,p_rate numeric,p_baseline integer)
 returns numeric language plpgsql security definer set search_path='' as $$
declare a timestamptz:=(p_date-interval '1 month')::timestamp at time zone 'Africa/Lagos';
 b timestamptz:=p_date::timestamp at time zone 'Africa/Lagos';t timestamptz;n timestamptz;used integer;total numeric:=0;epoch timestamptz;
begin
 if p_rate=0 then return 0;end if;
 if not exists(select 1 from public.pw_leaves l join public.pw_leave_covers c on c.leave_id=l.id where c.duty='admin' and(c.cover_id=p_staff or c.original_id=p_staff)
  and l.state in('approved','active','completed','cancelled') and l.starts_at<b and least(l.ends_at,coalesce(l.closed_at,l.ends_at))>a)
 then return greatest(0,p_baseline-p_quota)*p_rate;end if;
 select begins_at into epoch from public.pw_salary_history_epoch where singleton;
 if epoch>a then return null;end if;
 for t,n in
  with points as(
   select a point union select b union select recorded_at from public.pw_salary_roster_history where recorded_at>a and recorded_at<b
   union select greatest(a,l.starts_at) from public.pw_leaves l where l.state in('approved','active','completed','cancelled') and l.starts_at<b and least(l.ends_at,coalesce(l.closed_at,l.ends_at))>a
   union select least(b,l.ends_at,coalesce(l.closed_at,l.ends_at)) from public.pw_leaves l where l.state in('approved','active','completed','cancelled') and l.starts_at<b and least(l.ends_at,coalesce(l.closed_at,l.ends_at))>a
  ) select point,lead(point) over(order by point) from points order by point
 loop
  if n is null or n<=t then continue;end if;
  with roster as(
   select distinct on(student_id) student_id,parent_id,admin_id,student_status,parent_status
   from public.pw_salary_roster_history where recorded_at<=t order by student_id,recorded_at desc,id desc
  ),families as(
   select h.parent_id from roster h where h.admin_id=p_staff and h.student_status='active' and h.parent_status='active'
    and not exists(select 1 from public.pw_leaves l where l.staff_id=p_staff and l.state in('approved','active','completed','cancelled') and l.starts_at<=t and least(l.ends_at,coalesce(l.closed_at,l.ends_at))>t)
   union
   select h.parent_id from roster h join public.pw_leave_covers c on c.student_id=h.student_id join public.pw_leaves l on l.id=c.leave_id
    where c.cover_id=p_staff and c.duty='admin' and h.admin_id=c.original_id and h.student_status='active' and h.parent_status='active'
    and l.state in('approved','active','completed','cancelled') and l.starts_at<=t and least(l.ends_at,coalesce(l.closed_at,l.ends_at))>t
  ) select count(distinct parent_id) into used from families;
  total:=total+greatest(0,used-p_quota)*p_rate*extract(epoch from(n-t))/extract(epoch from(b-a));
 end loop;
 return round(total,2);
end $$;
revoke all on function public.pw_admin_leave_bonus(uuid,date,integer,numeric,integer) from public,anon,authenticated;

create function public.pw_admin_cover_evidence(p_staff uuid,p_date date) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('leaveId',l.id,'coverId',c.id,'originalAdminId',c.original_id,'coverAdminId',c.cover_id,
 'studentId',c.student_id,'from',l.starts_at,'to',least(l.ends_at,coalesce(l.closed_at,l.ends_at))) order by c.id),'[]')
 from public.pw_leave_covers c join public.pw_leaves l on l.id=c.leave_id where c.duty='admin' and(c.cover_id=p_staff or c.original_id=p_staff)
 and l.state in('approved','active','completed','cancelled') and l.starts_at<(p_date::timestamp at time zone 'Africa/Lagos')
 and least(l.ends_at,coalesce(l.closed_at,l.ends_at))>((p_date-interval '1 month')::timestamp at time zone 'Africa/Lagos');
$$;
revoke all on function public.pw_admin_cover_evidence(uuid,date) from public,anon,authenticated;
do $migration$
declare definition text;fragment text;
begin
 select pg_get_functiondef('public.pw_calculate_salary(date,uuid)'::regprocedure) into definition;
 fragment:=$old$amount:=greatest(0,used-(current_rate.terms->>'adminQuota')::integer)*(current_rate.terms->>'adminExtraParentRate')::numeric;$old$;
 if position(fragment in definition)=0 then raise exception 'Unexpected admin bonus calculator';end if;
 definition:=replace(definition,fragment,$new$
    amount:=public.pw_admin_leave_bonus(staff.id,p_date,(current_rate.terms->>'adminQuota')::integer,(current_rate.terms->>'adminExtraParentRate')::numeric,used);
    if amount is null then
     issues:=issues||jsonb_build_array(jsonb_build_object('staffId',staff.id,'staffName',staff.name,'message','Exact-duration cover bonus needs historical roster states for the whole salary period; do not substitute a guessed monthly count'));
     amount:=0;
    end if;$new$);
 definition:=replace(definition,'''rateId'',current_rate.id)));','''rateId'',current_rate.id,''coverIntervals'',public.pw_admin_cover_evidence(staff.id,p_date))));');
 execute definition;
 select pg_get_functiondef('public.pw_apply_leave_lessons(uuid)'::regprocedure) into definition;
 definition:=replace(definition,'jsonb_build_object(''kind'',''cover'')','jsonb_build_object(''kind'',case when r.payload->>''kind''=''trial'' then ''trial'' else ''cover'' end)');
 execute definition;
 select pg_get_functiondef('public.pw_leave_schedule_guard()'::regprocedure) into definition;
 definition:=replace(definition,'jsonb_build_object(''kind'',''cover'')','jsonb_build_object(''kind'',case when new.payload->>''kind''=''trial'' then ''trial'' else ''cover'' end)');
 execute definition;
end $migration$;
