create table if not exists race_category_custom_split_rule (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid not null references categories(id) on delete cascade,
  source_stage race_stage not null default 'QUALIFICATION',
  rank_from int not null check (rank_from >= 1),
  rank_to int not null check (rank_to >= rank_from),
  target_stage race_stage not null,
  target_final_class final_class,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_race_category_custom_split_rule_category
  on race_category_custom_split_rule(category_id);

create unique index if not exists uq_race_category_custom_split_rule_category_source_sort
  on race_category_custom_split_rule(category_id, source_stage, sort_order);
