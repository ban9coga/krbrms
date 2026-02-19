-- Hide event from public listing
alter table events
  add column if not exists is_public boolean not null default true;
