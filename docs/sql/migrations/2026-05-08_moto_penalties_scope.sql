alter table rider_penalties
  add column if not exists moto_id uuid references motos(id) on delete cascade;

create index if not exists idx_rider_penalties_moto
  on rider_penalties(moto_id);
