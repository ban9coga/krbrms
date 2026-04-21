alter table registration_items
  drop constraint if exists ck_registration_items_jersey_size;

alter table registration_items
  add constraint ck_registration_items_jersey_size
  check (jersey_size is null or jersey_size in ('XS','S','M','L','XL','2XL','3XL'));

alter table riders
  drop constraint if exists ck_rider_jersey_size;

alter table riders
  add constraint ck_rider_jersey_size
  check (jersey_size is null or jersey_size in ('XS','S','M','L','XL','2XL','3XL'));
