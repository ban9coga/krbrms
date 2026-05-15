alter table event_penalty_rules
  add column if not exists checker_enabled boolean not null default true;

alter table event_penalty_rules
  add column if not exists rd_enabled boolean not null default true;
