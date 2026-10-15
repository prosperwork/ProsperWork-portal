-- Migration 062: Complaint Email Two-Way Sync Idempotency Key
-- Adds email_message_id to pw_complaint_messages to prevent duplicate message ingestion from IMAP email replies.

alter table public.pw_complaint_messages 
  add column if not exists email_message_id text;

create unique index if not exists pw_complaint_messages_email_msg_idx 
  on public.pw_complaint_messages(email_message_id) 
  where email_message_id is not null;

