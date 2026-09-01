-- Immutable public race archive captured when an event is marked FINISHED.
create table if not exists public.event_public_snapshots (
  event_id uuid primary key references public.events(id) on delete cascade,
  schema_version integer not null default 1,
  payload jsonb not null,
  captured_at timestamptz not null default now()
);

create index if not exists idx_event_public_snapshots_captured_at
  on public.event_public_snapshots(captured_at desc);

comment on table public.event_public_snapshots is
  'Immutable public-facing event data captured once when an event is marked FINISHED.';
