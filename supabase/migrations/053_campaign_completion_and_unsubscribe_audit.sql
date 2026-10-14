do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.pw_claim_campaign_emails(integer)'::regprocedure);
 definition:=replace(definition,'with eligible as(',
 'update public.pw_email_campaigns a set status=''completed'' where a.status=''queued'' and not exists(
  select 1 from public.pw_campaign_deliveries d where d.campaign_id=a.id and(d.status in(''queued'',''sending'') or(d.status=''failed'' and d.attempts<5)));
 with eligible as(');
 execute definition;
end $$;
create or replace function public.pw_marketing_unsubscribe(p_token uuid) returns void language plpgsql security definer set search_path='' as $$
declare contact uuid;
begin
 update public.pw_marketing_contacts set consent=false,evidence='Recipient withdrew using private unsubscribe link',recorded_by=null,changed_at=now()
 where unsubscribe_token=p_token and consent returning id into contact;
 if contact is null then return;end if;
 update public.pw_campaign_deliveries set status='cancelled',lease_id=null where contact_id=contact and status in('queued','sending','failed');
 insert into public.pw_audit(actor_name,actor_role,entity_type,entity_id,action,changed_fields)
 values('Unsubscribed recipient','recipient','communications',contact::text,'Recipient withdrew marketing consent',array['consent']);
end $$;
notify pgrst,'reload schema';
