alter table event_settings
  add column if not exists registration_open boolean not null default true;
