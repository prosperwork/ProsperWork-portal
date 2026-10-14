create table public.pw_signup_consents (
  user_id uuid primary key references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default clock_timestamp()
);

alter table public.pw_signup_consents enable row level security;
revoke all on public.pw_signup_consents from public, anon, authenticated;
grant all on public.pw_signup_consents to service_role;
