-- Continue cumulative rounding across late-verified installments, using the
-- original approved rates rather than treating an already-paid part as zero.
do $migration$
declare definition text; old_fragment text;
begin
 select pg_get_functiondef('public.pw_calculate_salary(date,uuid)'::regprocedure) into definition;
 old_fragment:='previous_raw:=coalesce((raw_totals->>raw_key)::numeric,0);';
 if position(old_fragment in definition)=0 then raise exception 'Unexpected salary rounding definition'; end if;
 definition:=replace(definition,old_fragment,$replacement$
 if raw_totals->raw_key is null then
  select coalesce(sum((r.terms->>'monthlyStudentRate')::numeric/4),0) into previous_raw
  from public.pw_salary_claims c join public.pw_salary_rates r on r.id=(c.meta->>'rateId')::uuid
  where c.staff_id=staff.id and c.meta->>'groupKey'=group_key and c.currency=cur
   and (c.source_key like 'salary:%' or c.source_key like 'advance:%');
 else previous_raw:=(raw_totals->>raw_key)::numeric; end if;
 $replacement$);
 old_fragment:='''statements'',results,''issues'',issues);';
 if position(old_fragment in definition)=0 then raise exception 'Unexpected salary snapshot definition'; end if;
 definition:=replace(definition,old_fragment,'''statements'',results,''issues'',issues,''rules'',jsonb_build_object(''weekAnchor'',cfg->>''payrollWeekAnchor'',''advanceEligibility'',cfg->>''advanceEligibility''));');
 execute definition;
end;
$migration$;
