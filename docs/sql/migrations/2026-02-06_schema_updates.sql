-- Migration: Rider photo support + event-scoped results + schedule/settings tables
-- Safe to run multiple times, but some steps will fail if existing data violates new constraints.

create extension if not exists "uuid-ossp";

-- Shared helper to keep updated_at consistent
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- EVENTS: ensure updated_at exists + trigger
alter table events
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_events_updated_at on events;
create trigger trg_events_updated_at
before update on events
for each row execute function set_updated_at();

-- RIDERS: add photo + updated_at + birth_year (generated) + tighter constraints
alter table riders
  add column if not exists photo_url text;

alter table riders
  add column if not exists photo_thumbnail_url text;

alter table riders
  add column if not exists updated_at timestamptz not null default now();

-- birth_year as generated column (based on existing date_of_birth)
alter table riders
  add column if not exists birth_year int generated always as (extract(year from date_of_birth)::int) stored;

-- Enforce riders only BOY/GIRL
alter table riders
  drop constraint if exists ck_rider_gender;
alter table riders
  add constraint ck_rider_gender check (gender in ('BOY','GIRL'));

-- Enforce allowed birth years (2017-2023)
alter table riders
  drop constraint if exists ck_birth_year;
alter table riders
  add constraint ck_birth_year check (birth_year >= 2017 and birth_year <= 2023);

drop trigger if exists trg_riders_updated_at on riders;
create trigger trg_riders_updated_at
before update on riders
for each row execute function set_updated_at();

-- RESULTS: rename status -> result_status, add event_id + updated_at + indexes
-- Postgres doesn't support RENAME COLUMN IF EXISTS, so we guard it manually.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'results'
      and column_name = 'status'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'results'
      and column_name = 'result_status'
  ) then
    execute 'alter table public.results rename column status to result_status';
  end if;
end$$;

alter table results
  add column if not exists event_id uuid;

-- Backfill event_id from motos (only affects existing rows)
update results r
set event_id = m.event_id
from motos m
where r.moto_id = m.id
  and r.event_id is null;

-- Make event_id required + FK (will fail if you still have NULL event_id)
alter table results
  alter column event_id set not null;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_name = 'results_event_id_fkey'
      and table_name = 'results'
  ) then
    alter table results
      add constraint results_event_id_fkey foreign key (event_id) references events(id) on delete cascade;
  end if;
end$$;

alter table results
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_results_updated_at on results;
create trigger trg_results_updated_at
before update on results
for each row execute function set_updated_at();

create index if not exists idx_results_event on results(event_id);
create unique index if not exists uq_results_moto_finish_order on results(moto_id, finish_order) where finish_order is not null;

-- RACE SCHEDULE
create table if not exists race_schedules (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  moto_id uuid not null references motos(id) on delete cascade,
  schedule_time timestamptz,
  track_number int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_race_schedules_event_moto on race_schedules(event_id, moto_id);
create index if not exists idx_race_schedules_event_time on race_schedules(event_id, schedule_time);

drop trigger if exists trg_race_schedules_updated_at on race_schedules;
create trigger trg_race_schedules_updated_at
before update on race_schedules
for each row execute function set_updated_at();

-- EVENT SETTINGS
create table if not exists event_settings (
  event_id uuid primary key references events(id) on delete cascade,
  event_logo_url text,
  sponsor_logo_urls text[] not null default '{}',
  scoring_rules jsonb not null default '{}'::jsonb,
  display_theme jsonb not null default '{}'::jsonb,
  race_format_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_event_settings_updated_at on event_settings;
create trigger trg_event_settings_updated_at
before update on event_settings
for each row execute function set_updated_at();
