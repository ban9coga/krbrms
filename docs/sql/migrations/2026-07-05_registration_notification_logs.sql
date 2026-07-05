-- Registration notification delivery/open tracking for admin actions.
-- Used to prevent duplicate guardian notifications across admins/devices.
create table if not exists registration_notification_logs (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  registration_id uuid not null references registrations(id) on delete cascade,
  notification_kind text not null,
  channel text not null,
  recipient text,
  performed_by uuid,
  performed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint ck_registration_notification_logs_kind
    check (
      notification_kind in (
        'STATUS_ACCESS',
        'EMAIL_STATUS_ACCESS',
        'APPROVED',
        'REJECTED',
        'PAYMENT_REJECTED'
      )
    ),
  constraint ck_registration_notification_logs_channel
    check (channel in ('WHATSAPP', 'EMAIL'))
);

drop index if exists registration_notification_logs_once;

create index if not exists idx_registration_notification_logs_lookup
  on registration_notification_logs (registration_id, notification_kind, channel, performed_at desc);

create index if not exists idx_registration_notification_logs_event
  on registration_notification_logs (event_id, performed_at desc);
