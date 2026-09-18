-- 1. Push Subscriptions Table (Public Rider Tracking)
create table if not exists push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  rider_id uuid not null references riders(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  subscribed_at timestamptz not null default now(),
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_push_subscriptions_event_rider_endpoint unique (event_id, rider_id, endpoint)
);

-- RLS for push_subscriptions (Strictly no public read of endpoint/keys)
alter table push_subscriptions enable row level security;

-- 2. Push Notification Log Table (For idempotency and audit)
create table if not exists push_notification_log (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  rider_id uuid not null references riders(id) on delete cascade,
  subscription_id uuid references push_subscriptions(id) on delete cascade,
  event_type text not null,
  idempotency_key text not null,
  status text not null default 'PENDING',
  attempt_count int not null default 0,
  last_attempted_at timestamptz,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  constraint ck_push_notification_log_status check (status in ('PENDING', 'SENT', 'FAILED')),
  constraint uq_push_notification_log_idempotency unique (idempotency_key, subscription_id)
);

-- RLS for push_notification_log
alter table push_notification_log enable row level security;

-- Index for processing pending pushes
create index if not exists idx_push_notification_log_pending on push_notification_log (status, attempt_count) where status = 'PENDING';
