-- D4: restricted or paused staff no longer accrue recurring fixed base salary
-- or the admin extra-parent capacity bonus. Verified lesson earnings (standard,
-- trial, cover), advance reconciliation and carried balances are unchanged, so
-- pay that was actually earned is never discarded. Staff on leave keep their
-- agreed base salary; leave is governed by the leave/cover workflow.
do $migration$
declare definition text; fragment text;
begin
 select pg_get_functiondef('public.pw_calculate_salary(date,uuid)'::regprocedure) into definition;

 fragment:=$old$current_rate.terms->>'managementFirstPeriod'='manual_adjustment' then amount:=0; end if;$old$;
 if position(fragment in definition)=0 then raise exception 'Unexpected base salary calculator'; end if;
 definition:=replace(definition,fragment,fragment||$new$
    if staff.status in('restricted','paused') then
     if amount>0 then
      issues:=issues||jsonb_build_array(jsonb_build_object('staffId',staff.id,'staffName',staff.name,
       'message','Base salary withheld: staff status is '||staff.status||'. Verified lesson earnings are still included.'));
     end if;
     amount:=0;
    end if;$new$);

 fragment:=$old$if staff.role='admin' then$old$;
 if position(fragment in definition)=0 then raise exception 'Unexpected admin bonus block'; end if;
 definition:=replace(definition,fragment,$new$if staff.role='admin' and staff.status not in('restricted','paused') then$new$);

 execute definition;
end $migration$;

