-- Safety checklist requirements per event
create table if not exists event_safety_requirements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  label text not null,
  is_required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists event_safety_requirements_event_id_idx
  on event_safety_requirements(event_id);
