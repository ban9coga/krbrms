alter table if exists public.race_stage_config
  add column if not exists repechage_max_riders_per_race integer,
  add column if not exists quarter_final_max_riders_per_race integer,
  add column if not exists semi_final_max_riders_per_race integer;

alter table if exists public.race_stage_config
  drop constraint if exists race_stage_config_repechage_max_riders_per_race_check,
  drop constraint if exists race_stage_config_quarter_final_max_riders_per_race_check,
  drop constraint if exists race_stage_config_semi_final_max_riders_per_race_check;

alter table if exists public.race_stage_config
  add constraint race_stage_config_repechage_max_riders_per_race_check
    check (repechage_max_riders_per_race is null or repechage_max_riders_per_race >= 4),
  add constraint race_stage_config_quarter_final_max_riders_per_race_check
    check (quarter_final_max_riders_per_race is null or quarter_final_max_riders_per_race >= 4),
  add constraint race_stage_config_semi_final_max_riders_per_race_check
    check (semi_final_max_riders_per_race is null or semi_final_max_riders_per_race >= 4);
