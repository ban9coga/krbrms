-- Add jersey size on riders
alter table riders
  add column if not exists jersey_size text;

alter table riders
  drop constraint if exists ck_rider_jersey_size;

alter table riders
  add constraint ck_rider_jersey_size
  check (jersey_size is null or jersey_size in ('XS','S','M','L','XL'));
