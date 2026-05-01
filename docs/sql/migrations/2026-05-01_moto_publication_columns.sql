alter table motos
  add column if not exists is_published boolean not null default false,
  add column if not exists published_at timestamptz;
