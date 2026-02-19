-- Add rider nickname to registration items and riders
alter table registration_items
  add column if not exists rider_nickname text;

alter table riders
  add column if not exists rider_nickname text;
