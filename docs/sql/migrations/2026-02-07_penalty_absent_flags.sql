-- Optional module flags + rider participation status
-- Non-destructive: adds new tables only. Existing logic unaffected.

create table if not exists event_feature_flags (
  event_id uuid primary key references events(id) on delete cascade,
  penalty_enabled boolean not null default false,
  absent_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists rider_participation_status (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  rider_id uuid not null references riders(id) on delete cascade,
  participation_status participation_status not null default 'ACTIVE',
  registration_order int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_rider_participation_event_rider
  on rider_participation_status(event_id, rider_id);
