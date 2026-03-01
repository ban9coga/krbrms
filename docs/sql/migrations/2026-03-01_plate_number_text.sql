-- Store plate numbers as text so leading zeros are preserved (e.g. 007).

alter table riders
  drop column if exists no_plate_display;

alter table riders
  alter column plate_number type text
  using plate_number::text;

alter table riders
  drop constraint if exists ck_plate_number;

alter table riders
  add constraint ck_plate_number check (
    plate_number ~ '^[0-9]+$'
  );

alter table riders
  add column no_plate_display text generated always as (
    plate_number || coalesce(plate_suffix::text, '')
  ) stored;

alter table registration_items
  alter column requested_plate_number type text
  using requested_plate_number::text;

alter table registration_items
  drop constraint if exists ck_registration_items_requested_plate_number;

alter table registration_items
  add constraint ck_registration_items_requested_plate_number check (
    requested_plate_number is null or requested_plate_number ~ '^[0-9]+$'
  );
