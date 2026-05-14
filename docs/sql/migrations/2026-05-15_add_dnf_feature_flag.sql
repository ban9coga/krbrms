alter table event_feature_flags
  add column if not exists dnf_enabled boolean not null default false;
