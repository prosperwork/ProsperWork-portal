do $fix$
declare definition text;
begin
 select pg_get_functiondef('public.pw_emit_contract_invoices(uuid)'::regprocedure) into definition;
 definition:=replace(definition,'''amount'',c.amount-discount,','''amount'',c.amount,');
 execute definition;
 select pg_get_functiondef('public.pw_financial_summary()'::regprocedure) into definition;
 definition:=replace(definition,'(payload->>''amount'')::numeric amount,''income'' kind',
  '((payload->>''amount'')::numeric-coalesce((payload->>''referralDiscount'')::numeric,0)) amount,''income'' kind');
 execute definition;
end $fix$;
