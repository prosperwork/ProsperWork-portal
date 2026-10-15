-- Migration 061: Complaint Messages Thread (Two-way chat between parent and academy)
create table public.pw_complaint_messages (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.pw_complaints(id) on delete cascade,
  sender_id uuid not null references public.pw_profiles(id),
  sender_name text not null,
  sender_role text not null,
  message text not null check(length(trim(message)) >= 1 and length(trim(message)) <= 5000),
  created_at timestamptz not null default now()
);

create index pw_complaint_messages_complaint_idx on public.pw_complaint_messages(complaint_id, created_at asc);

alter table public.pw_complaint_messages enable row level security;
revoke all on public.pw_complaint_messages from anon, authenticated;
grant select, insert on public.pw_complaint_messages to authenticated;

create policy pw_complaint_messages_select on public.pw_complaint_messages for select to authenticated
  using (
    public.pw_active() and public.pw_portal_allowed() and (
      exists (
        select 1 from public.pw_complaints c
        where c.id = pw_complaint_messages.complaint_id
          and (c.parent_id = auth.uid() or public.pw_role() in ('super_admin', 'general_manager', 'head_admin', 'admin', 'qc'))
      )
    )
  );

create policy pw_complaint_messages_insert on public.pw_complaint_messages for insert to authenticated
  with check (
    public.pw_active() and public.pw_portal_allowed() and (
      sender_id = auth.uid() and (
        exists (
          select 1 from public.pw_complaints c
          where c.id = pw_complaint_messages.complaint_id
            and (c.parent_id = auth.uid() or public.pw_role() in ('super_admin', 'general_manager', 'head_admin', 'admin', 'qc'))
        )
      )
    )
  );
