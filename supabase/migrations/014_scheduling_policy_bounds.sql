-- Preserve the document's minimum notice and 2–3 concurrent-admin-class bounds.
alter table public.pw_settings add constraint pw_document_schedule_bounds check(
 (settings->>'adminConcurrentClasses')::integer between 2 and 3
 and (settings->>'rescheduleNoticeHours')::integer>=2
);
