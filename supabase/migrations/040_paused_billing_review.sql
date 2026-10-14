alter table public.pw_billing_contracts add column billing_hold boolean not null default false;
do $fix$
declare definition text;
begin
 select pg_get_functiondef('public.pw_emit_contract_invoices(uuid)'::regprocedure) into definition;
 definition:=replace(definition,'if c.id is null then return 0;end if;','if c.id is null or c.billing_hold then return 0;end if;');
 execute definition;
 select pg_get_functiondef('public.pw_operations_action(text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'cid:=(p_data->>''id'')::uuid;perform public.pw_emit_contract_invoices(cid);',
  'cid:=(p_data->>''id'')::uuid;
   if exists(select 1 from public.pw_billing_contracts where id=cid and billing_hold and active) then raise exception ''Paused billing requires Finance review: stop held contract and agree a new restart anchor before generation'' using errcode=''23514'';end if;
   perform public.pw_emit_contract_invoices(cid);');
 definition:=replace(definition,'elsif p_action=''resume'' then',
  'update public.pw_billing_contracts set billing_hold=true where student_id=s.id and active;
  elsif p_action=''resume'' then');
 execute definition;
end $fix$;
