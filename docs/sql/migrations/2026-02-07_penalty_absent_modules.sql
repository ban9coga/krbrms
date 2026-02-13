-- Optional modules: Event-scoped penalties + absent resolution + awards
-- Non-destructive: adds new enums/tables only. Existing logic unaffected.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'penalty_stage') then
    create type penalty_stage as enum ('MOTO','QUARTER','SEMI','FINAL','ALL');
  end if;
  if not exists (select 1 from pg_type where typname = 'participation_status') then
    create type participation_status as enum ('ACTIVE','DNS','DNF','ABSENT');
  end if;
  if not exists (select 1 from pg_type where typname = 'rank_type') then
    create type rank_type as enum ('COMPETITIVE','ADMINISTRATIVE');
  end if;
  if not exists (select 1 from pg_type where typname = 'award_type') then
    create type award_type as enum (
      'PARTICIPATION',
      'BEGINNER','AMATEUR','ACADEMY','ROOKIE','PRO','NOVICE','ELITE'
    );
  end if;
end$$;

-- Event-scoped penalty rules
create table if not exists event_penalty_rules (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  code text not null,
  description text,
  penalty_point int not null,
  applies_to_stage penalty_stage not null default 'ALL',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_event_penalty_code
  on event_penalty_rules(event_id, code);
create index if not exists idx_event_penalty_event
  on event_penalty_rules(event_id);

-- Rider penalty snapshots (additive)
create table if not exists rider_penalties (
  id uuid primary key default uuid_generate_v4(),
  rider_id uuid not null references riders(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  stage penalty_stage not null default 'ALL',
  rule_code text not null,
  penalty_point int not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_rider_penalties_event
  on rider_penalties(event_id);
create index if not exists idx_rider_penalties_rider
  on rider_penalties(rider_id);

-- Optional per-event absent config (default 99)
create table if not exists event_absent_config (
  event_id uuid primary key references events(id) on delete cascade,
  absent_point int not null default 99,
  created_at timestamptz not null default now()
);

-- Optional administrative rankings + awards storage (non-invasive)
create table if not exists race_awards (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  rider_id uuid not null references riders(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  stage penalty_stage not null default 'ALL',
  rank_type rank_type not null default 'COMPETITIVE',
  award_type award_type not null default 'PARTICIPATION',
  position int,
  created_at timestamptz not null default now()
);

create index if not exists idx_race_awards_event
  on race_awards(event_id);
create index if not exists idx_race_awards_rider
  on race_awards(rider_id);
