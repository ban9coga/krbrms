do $$
begin
  if not exists (select 1 from pg_type where typname = 'protest_decision') then
    create type protest_decision as enum ('PENDING','ACCEPTED','REJECTED');
  end if;
end$$;

create table if not exists protests (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  moto_id uuid references motos(id) on delete set null,
  rider_id uuid references riders(id) on delete set null,
  reason text,
  note text,
  decision protest_decision not null default 'PENDING',
  created_by text,
  resolved_by text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_protests_event
  on protests(event_id, created_at desc);

create index if not exists idx_protests_moto
  on protests(moto_id, created_at desc);
