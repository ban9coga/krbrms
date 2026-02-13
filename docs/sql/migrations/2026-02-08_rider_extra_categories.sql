-- Optional: allow a rider to join one extra category (year above)

create table if not exists rider_extra_categories (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  rider_id uuid not null references riders(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Only one extra category per rider
create unique index if not exists uq_rider_extra_category_rider
  on rider_extra_categories(rider_id);

create index if not exists idx_rider_extra_category_event
  on rider_extra_categories(event_id);

create index if not exists idx_rider_extra_category_category
  on rider_extra_categories(category_id);
