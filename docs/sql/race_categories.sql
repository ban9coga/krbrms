-- Add description to events
alter table events
  add column if not exists description text;

-- Race categories per event + year
create table if not exists race_categories (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  year text not null,
  name text not null,
  status text not null check (status in ('LIVE','FINISHED')),
  created_at timestamptz not null default now()
);

create index if not exists idx_race_categories_event_year on race_categories(event_id, year);
create index if not exists idx_race_categories_status on race_categories(status);

-- Link batches to race categories
alter table batches
  add column if not exists race_category_id uuid references race_categories(id) on delete set null;
