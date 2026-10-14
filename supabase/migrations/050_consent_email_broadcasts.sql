-- Marketing consent is separate from referrals, class reminders and social-media consent.
create table public.pw_marketing_contacts(
 id uuid primary key default gen_random_uuid(),guardian_id uuid unique references public.pw_profiles(id),
 lead_id text unique references public.pw_leads(id),email text not null,
 consent boolean not null default false,evidence text not null,recorded_by uuid references public.pw_profiles(id),
 changed_at timestamptz not null default now(),unsubscribe_token uuid not null unique default gen_random_uuid(),
 check((guardian_id is null)<>(lead_id is null)),check(length(evidence)>=5)
);
create table public.pw_email_campaigns(
 id uuid primary key default gen_random_uuid(),created_by uuid not null references public.pw_profiles(id),request_key uuid not null,
 subject text not null check(length(subject) between 1 and 160),body text not null check(length(body) between 5 and 5000),
 audience text not null check(audience in('families','leads','all')),reason text not null,
 status text not null default 'queued' check(status in('queued','completed','cancelled')),
 created_at timestamptz not null default now(),unique(created_by,request_key)
);
create table public.pw_campaign_deliveries(
 id uuid primary key default gen_random_uuid(),campaign_id uuid not null references public.pw_email_campaigns(id),
 contact_id uuid not null references public.pw_marketing_contacts(id),status text not null default 'queued',
 attempts integer not null default 0,next_attempt timestamptz not null default now(),
 lease_id uuid,leased_until timestamptz,sent_at timestamptz,last_error text,
 unique(campaign_id,contact_id),check(status in('queued','sending','sent','failed','cancelled'))
);
create index pw_campaign_claim on public.pw_campaign_deliveries(status,next_attempt);
alter table public.pw_marketing_contacts enable row level security;
alter table public.pw_email_campaigns enable row level security;
alter table public.pw_campaign_deliveries enable row level security;
revoke all on public.pw_marketing_contacts,public.pw_email_campaigns,public.pw_campaign_deliveries from anon,authenticated;
-- Access only through projections: raw unsubscribe tokens are never in a staff snapshot.
create function public.pw_communications_action(p_action text,p_data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();r text:=public.pw_role();lid text:=p_data->>'leadId';address text;cid uuid;n integer;why text:=trim(p_data->>'reason');
begin
 if not coalesce(public.pw_active(),false) then raise exception 'Active account required' using errcode='42501';end if;
 if why is null or length(why) not between 5 and 2000 then raise exception 'Evidence required' using errcode='22023';end if;
 if p_action='consent' then
  if lid is null then
   if r<>'parent' then raise exception 'Guardian preference only' using errcode='42501';end if;
   select email into address from public.pw_profiles where id=actor;
   insert into public.pw_marketing_contacts(guardian_id,email,consent,evidence,recorded_by)
   values(actor,address,(p_data->>'enabled')::boolean,why,actor)
   on conflict(guardian_id) do update set email=excluded.email,consent=excluded.consent,evidence=excluded.evidence,recorded_by=actor,changed_at=now()
   returning id into cid;
  else
   if r not in('super_admin','sales_marketing') or not exists(select 1 from public.pw_leads where id=lid and(r='super_admin' or owner_id=actor))
    then raise exception 'Assigned Sales consent evidence only' using errcode='42501';end if;
   select payload->>'email' into address from public.pw_leads where id=lid;
   if address is null or address!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Valid contact email required' using errcode='22023';end if;
   insert into public.pw_marketing_contacts(lead_id,email,consent,evidence,recorded_by)
   values(lid,address,(p_data->>'enabled')::boolean,why,actor)
   on conflict(lead_id) do update set email=excluded.email,consent=excluded.consent,evidence=excluded.evidence,recorded_by=actor,changed_at=now()
   returning id into cid;
  end if;
  if not(p_data->>'enabled')::boolean then update public.pw_campaign_deliveries set status='cancelled',lease_id=null where contact_id=cid and status in('queued','failed','sending');end if;
 elsif p_action='campaign' then
  if r not in('super_admin','sales_marketing') then raise exception 'Sales or owner required' using errcode='42501';end if;
  if p_data->>'confirm' is distinct from 'SEND' or length(trim(p_data->>'subject')) not between 1 and 160
   or length(trim(p_data->>'body')) not between 5 and 5000 or p_data->>'audience' not in('families','leads','all')
   or(r='sales_marketing' and p_data->>'audience'<>'leads') then raise exception 'Complete authorized campaign required' using errcode='22023';end if;
  if p_data->>'requestId' is null then raise exception 'Request identity required' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||((p_data->>'requestId')::uuid)::text,0));
  select id into cid from public.pw_email_campaigns where created_by=actor and request_key=(p_data->>'requestId')::uuid;
  if cid is not null then
   if not exists(select 1 from public.pw_email_campaigns where id=cid and subject=trim(p_data->>'subject') and body=trim(p_data->>'body') and audience=p_data->>'audience')
   then raise exception 'Request identity already used for different content' using errcode='PW409';end if;
   return jsonb_build_object('id',cid,'recipients',(select count(*) from public.pw_campaign_deliveries where campaign_id=cid));
  end if;
  insert into public.pw_email_campaigns(created_by,request_key,subject,body,audience,reason)
   values(actor,(p_data->>'requestId')::uuid,trim(p_data->>'subject'),trim(p_data->>'body'),p_data->>'audience',why) returning id into cid;
  insert into public.pw_campaign_deliveries(campaign_id,contact_id)
  select cid,c.id from public.pw_marketing_contacts c
  left join public.pw_leads l on l.id=c.lead_id
  left join public.pw_profiles p on p.id=c.guardian_id
  left join auth.users u on u.id=p.id
  where c.consent and(
   (c.lead_id is not null and p_data->>'audience' in('leads','all') and(r='super_admin' or l.owner_id=actor) and c.email=l.payload->>'email')
   or(c.guardian_id is not null and r='super_admin' and p_data->>'audience' in('families','all') and p.status='active' and u.email_confirmed_at is not null and c.email=p.email)
  ) order by c.id;
  get diagnostics n=row_count;
  if n=0 then raise exception 'No eligible consented recipients' using errcode='22023';end if;
 elsif p_action='cancel' then
  select id into cid from public.pw_email_campaigns where id=(p_data->>'id')::uuid and status='queued' and(r='super_admin' or created_by=actor) for update;
  if cid is null or r not in('super_admin','sales_marketing') then raise exception 'Open own campaign required' using errcode='42501';end if;
  update public.pw_email_campaigns set status='cancelled' where id=cid;
  update public.pw_campaign_deliveries set status='cancelled',lease_id=null where campaign_id=cid and status in('queued','sending','failed');
 else raise exception 'Unknown action' using errcode='22023';end if;
 insert into public.pw_audit(actor_id,actor_name,actor_role,entity_type,entity_id,action,changed_fields)
 values(actor,(select name from public.pw_profiles where id=actor),r,'communications',cid::text,p_action||': '||why,array[p_action]);
 return jsonb_build_object('id',cid,'recipients',n);
end $$;
create function public.pw_communications_snapshot() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text:=public.pw_role();
begin
 if not coalesce(public.pw_active(),false) then raise exception 'Active account required' using errcode='42501';end if;
 return jsonb_build_object(
 'contacts',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'leadId',c.lead_id,'guardianId',c.guardian_id,'email',c.email,'consent',c.consent,'evidence',c.evidence,'changedAt',c.changed_at)),'[]')
  from public.pw_marketing_contacts c left join public.pw_leads l on l.id=c.lead_id where r='super_admin' or c.guardian_id=auth.uid() or(r='sales_marketing' and l.owner_id=auth.uid())),
 'leads',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',payload->>'parentName','email',payload->>'email')),'[]') from public.pw_leads where r='super_admin' or(r='sales_marketing' and owner_id=auth.uid())),
 'campaigns',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'subject',a.subject,'body',a.body,'status',a.status,'createdAt',a.created_at,
  'queued',(select count(*) from public.pw_campaign_deliveries where campaign_id=a.id and status in('queued','sending')),
  'sent',(select count(*) from public.pw_campaign_deliveries where campaign_id=a.id and status='sent'),
  'failed',(select count(*) from public.pw_campaign_deliveries where campaign_id=a.id and status='failed'),
  'cancelled',(select count(*) from public.pw_campaign_deliveries where campaign_id=a.id and status='cancelled'))),'[]')
  from public.pw_email_campaigns a where r='super_admin' or(r='sales_marketing' and a.created_by=auth.uid()))
 );
end $$;
create function public.pw_marketing_unsubscribe(p_token uuid) returns void language plpgsql security definer set search_path='' as $$
declare contact uuid;
begin
 update public.pw_marketing_contacts set consent=false,evidence='Recipient withdrew using private unsubscribe link',changed_at=now()
 where unsubscribe_token=p_token returning id into contact;
 update public.pw_campaign_deliveries set status='cancelled',lease_id=null where contact_id=contact and status in('queued','sending','failed');
end $$;
create function public.pw_claim_campaign_emails(p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 -- Cancel stale ownership, changed addresses, withdrawn consent and expired leases safely.
 update public.pw_campaign_deliveries d set status='cancelled',lease_id=null
 from public.pw_marketing_contacts c,public.pw_email_campaigns a
 where d.contact_id=c.id and d.campaign_id=a.id and d.status in('queued','sending','failed')
 and(not c.consent or a.status<>'queued'
 or(c.lead_id is not null and not exists(select 1 from public.pw_leads l where l.id=c.lead_id and l.payload->>'email'=c.email and(l.owner_id=a.created_by or exists(select 1 from public.pw_profiles where id=a.created_by and role='super_admin' and status='active'))))
 or(c.guardian_id is not null and not exists(select 1 from public.pw_profiles p join auth.users u on u.id=p.id where p.id=c.guardian_id and p.status='active' and p.email=c.email and u.email_confirmed_at is not null))
 or not exists(select 1 from public.pw_profiles where id=a.created_by and status='active' and role in('super_admin','sales_marketing')));
 with eligible as(
  select id from public.pw_campaign_deliveries where attempts<5 and next_attempt<=now()
  and(status in('queued','failed') or(status='sending' and leased_until<now()))
  order by next_attempt,id for update skip locked limit greatest(1,least(p_limit,25))
 ),leased as(
  update public.pw_campaign_deliveries d set status='sending',attempts=attempts+1,lease_id=gen_random_uuid(),leased_until=now()+interval '5 minutes'
  from eligible e where d.id=e.id returning d.*
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'lease_id',d.lease_id,'email',c.email,'category','contact','template','marketing_update','subject',a.subject,
  'payload',jsonb_build_object('body',a.body,'unsubscribeToken',c.unsubscribe_token))),'[]') into result
 from leased d join public.pw_marketing_contacts c on c.id=d.contact_id join public.pw_email_campaigns a on a.id=d.campaign_id;
 return result;
end $$;
create function public.pw_campaign_email_current(p_id uuid,p_lease uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.pw_campaign_deliveries d join public.pw_marketing_contacts c on c.id=d.contact_id
 join public.pw_email_campaigns a on a.id=d.campaign_id join public.pw_profiles creator on creator.id=a.created_by
 left join public.pw_leads l on l.id=c.lead_id left join public.pw_profiles p on p.id=c.guardian_id left join auth.users u on u.id=p.id
 where d.id=p_id and d.lease_id=p_lease and d.status='sending' and d.leased_until>now() and c.consent and a.status='queued'
 and creator.status='active' and creator.role in('super_admin','sales_marketing')
 and((c.lead_id is not null and c.email=l.payload->>'email' and(creator.role='super_admin' or l.owner_id=creator.id))
 or(c.guardian_id is not null and creator.role='super_admin' and p.status='active' and p.email=c.email and u.email_confirmed_at is not null)))
$$;
create function public.pw_finish_campaign_email(p_id uuid,p_lease uuid,p_success boolean,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.pw_campaign_deliveries set status=case when p_success then 'sent' else 'failed' end,
 sent_at=case when p_success then now() else null end,last_error=left(p_error,160),
 next_attempt=now()+make_interval(mins=>least(60,attempts*attempts)),lease_id=null,leased_until=null
 where id=p_id and lease_id=p_lease and status='sending' and leased_until>now();
 update public.pw_email_campaigns a set status='completed' where a.status='queued' and not exists(
 select 1 from public.pw_campaign_deliveries d where d.campaign_id=a.id and(d.status in('queued','sending') or(d.status='failed' and d.attempts<5)));
end $$;
revoke all on function public.pw_communications_action(text,jsonb),public.pw_communications_snapshot(),public.pw_marketing_unsubscribe(uuid),
 public.pw_claim_campaign_emails(integer),public.pw_campaign_email_current(uuid,uuid),public.pw_finish_campaign_email(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.pw_communications_action(text,jsonb),public.pw_communications_snapshot() to authenticated;
grant execute on function public.pw_marketing_unsubscribe(uuid) to anon,authenticated;
grant execute on function public.pw_claim_campaign_emails(integer),public.pw_campaign_email_current(uuid,uuid),public.pw_finish_campaign_email(uuid,uuid,boolean,text) to service_role;
notify pgrst,'reload schema';
