-- Require jersey size setting per event
alter table event_settings
  add column if not exists require_jersey_size boolean not null default false;
