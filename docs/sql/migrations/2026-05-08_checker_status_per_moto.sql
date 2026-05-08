alter table rider_participation_status
  add column if not exists moto_id uuid references motos(id) on delete cascade;

alter table rider_status_updates
  add column if not exists moto_id uuid references motos(id) on delete cascade;

create unique index if not exists uq_rider_participation_event_moto_rider
  on rider_participation_status(event_id, moto_id, rider_id);

create index if not exists idx_rider_participation_moto
  on rider_participation_status(moto_id);

create index if not exists idx_rider_status_updates_moto
  on rider_status_updates(moto_id);
