create table public.pw_currencies(
 code text primary key check(code ~ '^[A-Z]{3}$'),
 name text not null check(length(name) between 2 and 80),
 symbol text not null check(length(symbol) between 1 and 12),
 enabled boolean not null default true,
 created_at timestamptz not null default now()
);
insert into public.pw_currencies(code,name,symbol) values
 ('GBP','British pound','£'),('USD','US dollar','$'),('EUR','Euro','€'),('CAD','Canadian dollar','C$'),('NGN','Nigerian naira','₦');
alter table public.pw_currencies enable row level security;
create policy pw_currency_read on public.pw_currencies for select to authenticated using(true);
grant select on public.pw_currencies to authenticated;
revoke insert,update,delete on public.pw_currencies from authenticated,anon;

create function public.pw_currency_known(p_code text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.pw_currencies where code=p_code);
$$;
revoke all on function public.pw_currency_known(text) from public,anon;
grant execute on function public.pw_currency_known(text) to authenticated,service_role;

create function public.pw_currency_action(p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c text:=upper(p_data->>'code');n text:=btrim(p_data->>'name');s text:=btrim(p_data->>'symbol');reason text:=btrim(p_data->>'notes');enabled boolean:=coalesce((p_data->>'enabled')::boolean,true);
begin
 if not coalesce(public.pw_active() and public.pw_role()='super_admin',false) then raise exception 'Owner only' using errcode='42501';end if;
 if c is null or c!~'^[A-Z]{3}$' or length(n) not between 2 and 80 or length(s) not between 1 and 12 or coalesce(length(reason),0)<5 then raise exception 'Currency code, name, symbol and reason required' using errcode='22023';end if;
 if c='NGN' and not enabled then raise exception 'The NGN reporting base cannot be disabled' using errcode='23514';end if;
 insert into public.pw_currencies(code,name,symbol,enabled) values(c,n,s,enabled)
 on conflict(code) do update set name=excluded.name,symbol=excluded.symbol,enabled=excluded.enabled;
 insert into public.pw_operations_events(action,subject,actor,notes) values('currency_setting',c,auth.uid(),reason);
 return jsonb_build_object('code',c);
end $$;
revoke all on function public.pw_currency_action(jsonb) from public,anon;
grant execute on function public.pw_currency_action(jsonb) to authenticated;

-- Currency history is never deleted. Existing agreements remain payable if a
-- code is disabled; only fresh agreements are blocked.
do $change$
declare t text;c record;f record;definition text;
begin
 for t in select table_name from information_schema.columns where table_schema='public' and table_name like 'pw_%' and column_name='currency' loop
  for c in select conname from pg_constraint where conrelid=('public.'||t)::regclass and contype='c' and pg_get_constraintdef(oid) like '%currency%ARRAY%' loop
   execute format('alter table public.%I drop constraint %I',t,c.conname);
  end loop;
  execute format('alter table public.%I add constraint %I foreign key(currency) references public.pw_currencies(code)',t,t||'_currency_catalog');
 end loop;
 -- Preserve all non-currency status/amount checks.
 for c in select conrelid::regclass::text tablename,conname,pg_get_constraintdef(oid) definition from pg_constraint
  where conrelid in('public.pw_payments'::regclass,'public.pw_payroll'::regclass) and contype='c' and pg_get_constraintdef(oid) like '%currency%ARRAY%' loop
  definition:=regexp_replace(c.definition,$pattern$\(\(payload ->> 'currency'::text\) = ANY \(ARRAY\['GBP'::text, 'USD'::text, 'EUR'::text, 'CAD'::text, 'NGN'::text\]\)\)$pattern$,'public.pw_currency_known(payload->>''currency'')');
  if definition=c.definition then raise exception 'Currency constraint rewrite failed';end if;
  execute format('alter table %s drop constraint %I',c.tablename,c.conname);
  execute format('alter table %s add constraint %I %s',c.tablename,c.conname,definition);
 end loop;
 for f in select oid from pg_proc where pronamespace='public'::regnamespace and prokind='f' loop
  definition:=pg_get_functiondef(f.oid);
  if definition ~ $pattern$in\s*\(\s*'GBP'\s*,\s*'USD'\s*,\s*'EUR'\s*,\s*'CAD'\s*,\s*'NGN'\s*\)$pattern$ then
   definition:=regexp_replace(definition,$pattern$in\s*\(\s*'GBP'\s*,\s*'USD'\s*,\s*'EUR'\s*,\s*'CAD'\s*,\s*'NGN'\s*\)$pattern$,'in(select code from public.pw_currencies)','g');execute definition;
  end if;
 end loop;
 select pg_get_functiondef('public.pw_operations_action(text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,$old$not(p_data->>'currency' in('GBP','USD','EUR','CAD'))$old$,$new$not(public.pw_currency_known(p_data->>'currency') and p_data->>'currency'<>'NGN')$new$);
 execute definition;
end $change$;

alter table public.pw_fx_rates add constraint pw_fx_reporting_base check(currency<>'NGN');
alter table public.pw_expenses add constraint pw_expense_currency_catalog check(public.pw_currency_known(payload->>'currency'));
create function public.pw_currency_agreement_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare c text:=new.currency;
begin
 if not exists(select 1 from public.pw_currencies where code=c and enabled) then raise exception 'Choose an enabled configured currency for a new agreement' using errcode='23514';end if;
 return new;
end $$;
create trigger pw_contract_currency_enabled before insert on public.pw_billing_contracts for each row execute function public.pw_currency_agreement_guard();
create trigger pw_compensation_currency_enabled before insert on public.pw_staff_compensation for each row execute function public.pw_currency_agreement_guard();
