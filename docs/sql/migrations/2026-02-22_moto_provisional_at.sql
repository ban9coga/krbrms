alter table motos
  add column if not exists provisional_at timestamptz;
