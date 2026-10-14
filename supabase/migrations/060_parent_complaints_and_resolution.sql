-- Migration 060: Parent Complaints and Resolution Workflow
create table public.pw_complaints (
  id uuid primary key default gen_random_uuid(),
  ticket_number text unique not null default ('CMP-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 6))),
  parent_id uuid not null references public.pw_profiles(id),
  parent_name text not null,
  parent_email text not null,
  student_id text references public.pw_students(id),
  student_name text,
  category text not null check(category in ('lesson_quality', 'punctuality', 'scheduling', 'billing', 'technical', 'customer_service', 'other')),
  urgency text not null default 'normal' check(urgency in ('normal', 'high', 'urgent')),
  subject text not null check(length(trim(subject)) between 3 and 200),
  message text not null check(length(trim(message)) between 10 and 5000),
  status text not null default 'open' check(status in ('open', 'in_progress', 'resolved')),
  resolution_notes text,
  resolved_by uuid references public.pw_profiles(id),
  resolved_by_name text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pw_complaints_parent_idx on public.pw_complaints(parent_id);
create index pw_complaints_status_idx on public.pw_complaints(status);
create index pw_complaints_created_idx on public.pw_complaints(created_at desc);

alter table public.pw_complaints enable row level security;
revoke all on public.pw_complaints from anon, authenticated;
grant select, insert, update on public.pw_complaints to authenticated;

create policy pw_complaints_select on public.pw_complaints for select to authenticated
  using (
    public.pw_active() and public.pw_portal_allowed() and (
      parent_id = auth.uid() or
      public.pw_role() in ('super_admin', 'general_manager', 'head_admin', 'admin', 'qc')
    )
  );

create policy pw_complaints_insert on public.pw_complaints for insert to authenticated
  with check (
    public.pw_active() and public.pw_portal_allowed() and (
      parent_id = auth.uid() or
      public.pw_role() in ('super_admin', 'general_manager', 'head_admin', 'admin')
    )
  );

create policy pw_complaints_update on public.pw_complaints for update to authenticated
  using (
    public.pw_active() and public.pw_portal_allowed() and (
      public.pw_role() in ('super_admin', 'general_manager', 'head_admin', 'admin', 'qc')
    )
  )
  with check (
    public.pw_active() and public.pw_portal_allowed() and (
      public.pw_role() in ('super_admin', 'general_manager', 'head_admin', 'admin', 'qc')
    )
  );
