create extension if not exists "pgcrypto";

alter table event_settings
  drop column if exists ffa_mix_min_year,
  drop column if exists ffa_mix_max_year;
