alter table public.pw_finance_rules add column referral_percent numeric not null default 0 check(referral_percent between 0 and 100);
alter table public.pw_leads add column referral_parent_id uuid references public.pw_profiles;
create table public.pw_referral_requests(id uuid primary key default gen_random_uuid(),parent_id uuid not null references public.pw_profiles,lead_id text unique not null references public.pw_leads,created_at timestamptz default now());
create table public.pw_referral_credits(id uuid primary key default gen_random_uuid(),referral_id uuid unique not null references public.pw_referral_requests,qualifying_payment_id text unique not null references public.pw_payments,parent_id uuid not null references public.pw_profiles,amount numeric(12,2) not null check(amount>0),remaining numeric(12,2) not null check(remaining>=0 and remaining<=amount),currency text not null check(currency in('GBP','USD','EUR','CAD','NGN')),earned_at timestamptz default now());
alter table public.pw_referral_requests enable row level security;
alter table public.pw_referral_credits enable row level security;
revoke all on public.pw_referral_requests,public.pw_referral_credits from anon,authenticated;
grant select on public.pw_referral_requests,public.pw_referral_credits to authenticated;
create policy pw_referral_read on public.pw_referral_requests for select to authenticated using(public.pw_active() and(public.pw_role() in('super_admin','finance') or(parent_id=auth.uid() and public.pw_portal_allowed())));
create policy pw_credit_read on public.pw_referral_credits for select to authenticated using(public.pw_active() and(public.pw_role() in('super_admin','finance') or(parent_id=auth.uid() and public.pw_portal_allowed())));
do $hardening$
declare definition text;
begin
 select pg_get_functiondef('public.pw_operations_action(text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'finance_profit=(p_data->>''financeProfit'')::boolean','finance_profit=(p_data->>''financeProfit'')::boolean,referral_percent=coalesce((p_data->>''referralPercent'')::numeric,0)');
 definition:=replace(definition,'elsif p_action=''recurrence'' then','elsif p_action=''recurrence'' then
  if(p_data->>''weekday'')::integer not between 0 and 6 or(p_data->>''duration'')::integer not between 45 and 180 then raise exception ''Invalid recurrence limits'' using errcode=''22023'';end if;');
 execute definition;
 select pg_get_functiondef('public.pw_lead_clock_guard()'::regprocedure) into definition;
 definition:=replace(definition,'if TG_OP=''INSERT'' then','if TG_OP=''UPDATE'' and (new.trial_student_id,new.trial_lesson_id,new.trial_verified_at,new.converted_at,new.referral_parent_id) is distinct from(old.trial_student_id,old.trial_lesson_id,old.trial_verified_at,old.converted_at,old.referral_parent_id) and coalesce(current_setting(''pw.sales_workflow'',true),'''')<>''on'' then raise exception ''Pipeline records are server controlled'' using errcode=''42501'';end if;
 if TG_OP=''INSERT'' and(new.trial_student_id is not null or new.trial_lesson_id is not null or new.trial_verified_at is not null or new.converted_at is not null or new.referral_parent_id is not null) and coalesce(current_setting(''pw.sales_workflow'',true),'''')<>''on'' then raise exception ''Pipeline records are server controlled'' using errcode=''42501'';end if;
 if TG_OP=''INSERT'' then');
 definition:=replace(definition,'if new.payload->>''status''=''converted'' and new.converted_at is null','if new.payload->>''status''=''converted'' and new.converted_at is null and(TG_OP=''INSERT'' or old.payload->>''status''<>''converted'')');
 execute definition;
 select pg_get_functiondef('public.pw_quality_sales_action(text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'if p_action=''observe'' then','perform set_config(''pw.sales_workflow'',''on'',true);
 if p_action=''referral'' then
  if r<>''parent'' or not public.pw_portal_allowed() or not coalesce((p_data->>''contactConsent'')::boolean,false) then raise exception ''Verified guardian and explicit contact permission required'' using errcode=''42501'';end if;
  select * into t from public.pw_profiles where role=''sales_marketing'' and status=''active'' order by id limit 1;
  pid:=''referral_''||gen_random_uuid()::text;
  insert into public.pw_leads(id,owner_id,referral_parent_id,payload) values(pid,t.id,auth.uid(),jsonb_build_object(''id'',pid,''parentName'',p_data->>''parentName'',''email'',p_data->>''email'',''phone'',p_data->>''phone'',''childName'',p_data->>''childName'',''instrument'',p_data->>''instrument'',''source'',''Guardian referral'',''status'',''new'',''arrivedAt'',now(),''owner'',coalesce(t.name,''Unassigned Sales''),''notes'',notes,''referralFrom'',(select email from public.pw_profiles where id=auth.uid())));
  insert into public.pw_referral_requests(parent_id,lead_id) values(auth.uid(),pid) returning id into uid;
 elsif p_action=''observe'' then');
 execute definition;
 select pg_get_functiondef('public.pw_trial_verified()'::regprocedure) into definition;
 definition:=replace(definition,'update public.pw_leads','perform set_config(''pw.sales_workflow'',''on'',true);
  update public.pw_leads');
 execute definition;
 select pg_get_functiondef('public.pw_emit_contract_invoices(uuid)'::regprocedure) into definition;
 definition:=replace(definition,'parent_name text;','parent_name text;credit record;discount numeric;take numeric;');
 definition:=replace(definition,'insert into public.pw_payments','discount:=0;
  for credit in select * from public.pw_referral_credits where parent_id=s.parent_id and currency=c.currency and remaining>0 order by earned_at,id for update loop
   take:=least(credit.remaining,c.amount-discount);
   exit when take<=0;
   update public.pw_referral_credits set remaining=remaining-take where id=credit.id;
   discount:=discount+take;
  end loop;
  insert into public.pw_payments');
 definition:=replace(definition,'''amount'',c.amount,','''amount'',c.amount-discount,');
 definition:=replace(definition,'''referralDiscount'',0','''referralDiscount'',discount');
 execute definition;
end $hardening$;

create function public.pw_earn_referral() returns trigger language plpgsql security definer set search_path='' as $$
declare ref public.pw_referral_requests;c public.pw_billing_contracts;percent numeric;amount numeric;
begin
 if new.verified_at is null or old.verified_at is not null or new.payload->>'status'<>'paid' then return new;end if;
 if exists(select 1 from public.pw_payments where student_id=new.student_id and id<>new.id and verified_at is not null and verified_at<=new.verified_at) then return new;end if;
 select q.* into ref from public.pw_referral_requests q join public.pw_leads l on l.id=q.lead_id where l.trial_student_id=new.student_id and q.parent_id<>new.parent_id order by q.created_at limit 1;
 if ref.id is null or exists(select 1 from public.pw_referral_credits where referral_id=ref.id) then return new;end if;
 select * into c from public.pw_billing_contracts where student_id=new.student_id and active;
 select referral_percent into percent from public.pw_finance_rules;
 if c.id is null or percent<=0 then return new;end if;
 amount:=round(c.amount*percent/100,2);
 if amount>0 then insert into public.pw_referral_credits(referral_id,qualifying_payment_id,parent_id,amount,remaining,currency) values(ref.id,new.id,ref.parent_id,amount,amount,c.currency);end if;
 return new;
end $$;
create trigger pw_qualified_referral_credit after update on public.pw_payments for each row execute function public.pw_earn_referral();
