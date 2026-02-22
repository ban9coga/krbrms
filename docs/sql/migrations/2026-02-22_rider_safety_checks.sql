-- Per rider safety checklist state per moto
create table if not exists rider_safety_checks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  moto_id uuid not null references motos(id) on delete cascade,
  rider_id uuid not null references riders(id) on delete cascade,
  requirement_id uuid not null references event_safety_requirements(id) on delete cascade,
  is_checked boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text null
);

create unique index if not exists rider_safety_checks_unique
  on rider_safety_checks(event_id, moto_id, rider_id, requirement_id);

create index if not exists rider_safety_checks_moto_idx
  on rider_safety_checks(moto_id);
