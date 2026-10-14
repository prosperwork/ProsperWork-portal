create table public.pw_emails(
 id uuid primary key default gen_random_uuid(),
 dedup_key text not null unique,
 recipient_id uuid not null references public.pw_profiles(id),
 category text not null check(category in ('admin','admissions','support','payments','contact','automated')),
 subject text not null,
 template text not null,
 payload jsonb not null,
 source_table text,
 source_id text,
 status text not null default 'queued' check(status in ('queued','sending','sent','failed','cancelled')),
 scheduled_at timestamptz not null,
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 attempts integer not null default 0,
 lease_id uuid,
 leased_at timestamptz,
 last_error text
);
create index pw_emails_due on public.pw_emails(scheduled_at) where status in ('queued','sending');
alter table public.pw_emails enable row level security;
revoke all on public.pw_emails from anon,authenticated;
grant select on public.pw_emails to authenticated;
create policy pw_email_owner_log on public.pw_emails for select to authenticated
 using(public.pw_role()='super_admin' and public.pw_active());

create function public.pw_enqueue_lesson_email() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.pw_students; p public.pw_profiles; start_time timestamptz;
begin
 if tg_op='UPDATE' then
   if new.payload->>'startsAt' is not distinct from old.payload->>'startsAt'
   and new.teacher_id is not distinct from old.teacher_id and new.admin_id is not distinct from old.admin_id
   and new.payload->>'status' is not distinct from old.payload->>'status' then return new;end if;
 end if;
 if new.payload->>'status'<>'scheduled' then return new;end if;
 start_time:=(new.payload->>'startsAt')::timestamptz;
 if start_time<=now() then return new;end if;
 select * into s from public.pw_students where id=new.student_id;
 for p in select * from public.pw_profiles where id in (s.parent_id,s.student_user_id,new.teacher_id,new.admin_id) and status='active' loop
   insert into public.pw_emails(dedup_key,recipient_id,category,subject,template,payload,source_table,source_id,scheduled_at)
   values('class:'||new.id||':'||start_time::text||':'||p.id::text,p.id,'automated','Your ProsperWork class starts soon','class_reminder',
     jsonb_build_object('lessonId',new.id,'title',new.payload->>'title','studentName',s.payload->>'name','startsAt',start_time,
       'timezone',case when p.role in ('parent','student') then s.payload->>'timezone' else p.timezone end),
     'pw_lessons',new.id,start_time-interval '15 minutes') on conflict(dedup_key) do nothing;
 end loop;
 return new;
end $$;
create trigger pw_email_lesson after insert or update on public.pw_lessons for each row execute function public.pw_enqueue_lesson_email();

create function public.pw_enqueue_payment_email() returns trigger language plpgsql security definer set search_path='' as $$
declare due_time timestamptz; reminder integer; status_name text;
begin
 status_name:=new.payload->>'status';
 if status_name='due' then
   due_time:=((new.payload->>'dueDate')::date+time '09:00') at time zone 'Africa/Lagos';
   for reminder in select unnest(array[-1,0,1]) loop
     insert into public.pw_emails(dedup_key,recipient_id,category,subject,template,payload,source_table,source_id,scheduled_at)
     values('payment:'||new.id||':'||(new.payload->>'dueDate')||':'||reminder,new.parent_id,'payments',
       case when reminder=1 then 'ProsperWork payment is overdue' else 'ProsperWork payment reminder' end,
       'payment_reminder',new.payload||jsonb_build_object('reminderDay',reminder),'pw_payments',new.id,due_time+make_interval(days=>reminder))
     on conflict(dedup_key) do update set payload=excluded.payload,recipient_id=excluded.recipient_id
       where pw_emails.status='queued';
   end loop;
 elsif status_name='paid' and (tg_op='INSERT' or old.payload->>'status' is distinct from 'paid') then
   insert into public.pw_emails(dedup_key,recipient_id,category,subject,template,payload,source_table,source_id,scheduled_at)
   values('payment-verified:'||new.id,new.parent_id,'payments','ProsperWork payment verified','payment_verified',new.payload,'pw_payments',new.id,now())
   on conflict(dedup_key) do nothing;
 end if;
 return new;
end $$;
create trigger pw_email_payment after insert or update on public.pw_payments for each row execute function public.pw_enqueue_payment_email();

create function public.pw_enqueue_homework_email() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.payload->>'status'='submitted' and (tg_op='INSERT' or old.payload->>'status' is distinct from 'submitted') then
   insert into public.pw_emails(dedup_key,recipient_id,category,subject,template,payload,source_table,source_id,scheduled_at)
   values('homework:'||new.id||':'||new.revision,new.teacher_id,'admin','Homework is awaiting your review','homework_review',
     jsonb_build_object('title',new.payload->>'title','studentName',new.payload->>'studentName'),'pw_homework',new.id,now()+interval '48 hours')
   on conflict(dedup_key) do nothing;
 end if;
 return new;
end $$;
create trigger pw_email_homework after insert or update on public.pw_homework for each row execute function public.pw_enqueue_homework_email();

create function public.pw_queue_owner_test() returns uuid language plpgsql security definer set search_path='' as $$
declare job uuid;
begin
 if not coalesce(public.pw_active() and public.pw_role()='super_admin',false)
   or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null)
 then raise exception 'Verified owner required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,79));
 if exists(select 1 from public.pw_emails where recipient_id=auth.uid() and template='owner_test' and created_at>now()-interval '60 seconds')
 then raise exception 'Please wait before another test' using errcode='PW429';end if;
 insert into public.pw_emails(dedup_key,recipient_id,category,subject,template,payload,scheduled_at)
 values('test:'||gen_random_uuid()::text,auth.uid(),'automated','ProsperWork application email verification','owner_test','{}',now())
 returning id into job;
 return job;
end $$;
revoke all on function public.pw_queue_owner_test() from public,anon;
grant execute on function public.pw_queue_owner_test() to authenticated;

create function public.pw_email_current(p_job uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare e public.pw_emails; row_data jsonb; teacher uuid; admin uuid;s public.pw_students;
begin
 select * into e from public.pw_emails where id=p_job;
 if e.id is null or not exists(select 1 from public.pw_profiles p join auth.users u on u.id=p.id
   where p.id=e.recipient_id and p.status='active' and u.email_confirmed_at is not null and u.email is not null)
 then return false;end if;
 if e.template='owner_test' then return exists(select 1 from public.pw_profiles where id=e.recipient_id and role='super_admin');end if;
 if e.source_table='pw_lessons' then
   select payload,teacher_id,admin_id into row_data,teacher,admin from public.pw_lessons where id=e.source_id;
   select * into s from public.pw_students where id=row_data->>'studentId';
   return coalesce(row_data->>'status'='scheduled' and s.payload->>'status'='active'
     and (row_data->>'startsAt')::timestamptz=(e.payload->>'startsAt')::timestamptz
     and (row_data->>'startsAt')::timestamptz>clock_timestamp()
     and e.recipient_id in (s.parent_id,s.student_user_id,teacher,admin),false);
 elsif e.source_table='pw_payments' then
   select payload into row_data from public.pw_payments where id=e.source_id and parent_id=e.recipient_id;
   return coalesce(case when e.template='payment_verified' then row_data->>'status'='paid'
     else row_data->>'status'='due' and row_data->>'dueDate'=e.payload->>'dueDate'
       and row_data->>'amount'=e.payload->>'amount' and row_data->>'currency'=e.payload->>'currency' end,false);
 elsif e.source_table='pw_homework' then
   return exists(select 1 from public.pw_homework where id=e.source_id and teacher_id=e.recipient_id and payload->>'status'='submitted');
 end if;
 return false;
end $$;

create function public.pw_claim_emails(p_id uuid default null) returns table(id uuid,lease_id uuid,email text,category text,subject text,template text,payload jsonb)
language plpgsql security definer set search_path='' as $$
declare job public.pw_emails; recipient text; ticket uuid;
begin
 for job in select e.* from public.pw_emails e
   where (p_id is null or e.id=p_id) and e.scheduled_at<=now() and e.attempts<5
   and (e.status='queued' or (e.status='sending' and e.leased_at<now()-interval '3 minutes'))
   order by e.scheduled_at for update skip locked limit 10
 loop
   if not public.pw_email_current(job.id) then
     update public.pw_emails set status='cancelled',last_error='SOURCE_NO_LONGER_CURRENT' where pw_emails.id=job.id;
     continue;
   end if;
   select u.email into recipient from auth.users u where u.id=job.recipient_id;
   ticket:=gen_random_uuid();
   update public.pw_emails set status='sending',attempts=attempts+1,lease_id=ticket,leased_at=now() where pw_emails.id=job.id;
   id:=job.id;lease_id:=ticket;email:=recipient;category:=job.category;subject:=job.subject;template:=job.template;payload:=job.payload;
   return next;
 end loop;
end $$;
create function public.pw_finish_email(p_id uuid,p_lease uuid,p_success boolean,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.pw_emails set
   status=case when p_success then 'sent' when p_error='SOURCE_NO_LONGER_CURRENT' then 'cancelled' when attempts>=5 then 'failed' else 'queued' end,
   sent_at=case when p_success then now() else null end,
   last_error=case when p_success then null else left(coalesce(p_error,'DELIVERY_FAILED'),100) end,
   scheduled_at=case when p_success then scheduled_at else now()+make_interval(mins=>least(60,attempts*attempts)) end,
   lease_id=null,leased_at=null
 where id=p_id and lease_id=p_lease and status='sending';
 if not found then raise exception 'Stale delivery lease' using errcode='40001';end if;
end $$;
revoke all on function public.pw_email_current(uuid),public.pw_claim_emails(uuid),public.pw_finish_email(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.pw_email_current(uuid),public.pw_claim_emails(uuid),public.pw_finish_email(uuid,uuid,boolean,text) to service_role;
