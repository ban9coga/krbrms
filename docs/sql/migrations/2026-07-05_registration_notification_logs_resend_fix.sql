-- Allow notification resend history.
-- The first version used a unique index to block duplicate notifications.
-- We now keep every send/resend as a log row, and the app only uses this table
-- to warn admins before sending again.
drop index if exists public.registration_notification_logs_once;
drop index if exists registration_notification_logs_once;

create index if not exists idx_registration_notification_logs_lookup
  on public.registration_notification_logs (registration_id, notification_kind, channel, performed_at desc);

