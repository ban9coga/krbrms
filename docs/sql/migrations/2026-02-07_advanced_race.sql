-- Advanced Multi-Stage Race Extension (NON-DESTRUCTIVE)
-- Adds optional tables/enums for multi-stage format. Disabled by default.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'race_stage') then
    create type race_stage as enum ('QUALIFICATION','QUARTER_FINAL','SEMI_FINAL','FINAL');
  end if;
  if not exists (select 1 from pg_type where typname = 'final_class') then
    create type final_class as enum ('BEGINNER','AMATEUR','ACADEMY','ROOKIE','PRO','NOVICE','ELITE');
  end if;
end$$;

-- Enable advanced scheme per category (disabled by default)
create table if not exists race_stage_config (
  id uuid primary key default uuid_generate_v4(),
  event_id uuid not null references events(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  enabled boolean not null default false,
  max_riders_per_race int not null default 8,
  qualification_moto_count int not null default 2,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_race_stage_config_event_category
  on race_stage_config(event_id, category_id);

-- Dynamic resolver configuration per category
create table if not exists race_category_rule (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid not null references categories(id) on delete cascade,
  min_riders int not null,
  enable_qualification boolean not null default false,
  enable_quarter_final boolean not null default false,
  enable_semi_final boolean not null default false,
  enabled_final_classes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_race_category_rule_category
  on race_category_rule(category_id);

create unique index if not exists uq_race_category_rule_category_min
  on race_category_rule(category_id, min_riders);

-- Non-destructive result storage for advanced stages
create table if not exists race_stage_result (
  id uuid primary key default uuid_generate_v4(),
  rider_id uuid not null references riders(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  stage race_stage not null,
  batch_id uuid,
  final_class final_class,
  position int,
  points int,
  created_at timestamptz not null default now()
);

create index if not exists idx_race_stage_result_category_stage
  on race_stage_result(category_id, stage);

create index if not exists idx_race_stage_result_rider
  on race_stage_result(rider_id);
