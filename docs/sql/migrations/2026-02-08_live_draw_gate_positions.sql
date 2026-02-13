-- Live Draw gate positions (optional, additive)

create table if not exists moto_gate_positions (
  id uuid primary key default uuid_generate_v4(),
  moto_id uuid not null references motos(id) on delete cascade,
  rider_id uuid not null references riders(id) on delete cascade,
  gate_position int not null,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_moto_gate_positions
  on moto_gate_positions(moto_id, rider_id);

create index if not exists idx_moto_gate_positions_moto
  on moto_gate_positions(moto_id);
