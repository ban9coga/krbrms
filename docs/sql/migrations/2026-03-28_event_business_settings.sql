alter table event_settings
  add column if not exists business_settings jsonb not null default '{}'::jsonb;

comment on column event_settings.business_settings is
  'Per-event business metadata: public brand, event owner, operating committee, scoring support, and control flags.';