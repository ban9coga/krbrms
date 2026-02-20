-- Add jersey size per rider registration item
alter table registration_items
  add column if not exists jersey_size text;

alter table registration_items
  drop constraint if exists ck_registration_items_jersey_size;

alter table registration_items
  add constraint ck_registration_items_jersey_size
  check (jersey_size is null or jersey_size in ('XS','S','M','L','XL'));
