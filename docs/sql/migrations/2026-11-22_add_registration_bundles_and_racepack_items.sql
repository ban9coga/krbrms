begin;

-- Snapshot the optional per-rider bundle choice and surcharge on each
-- registration item so later event-setting edits do not rewrite old receipts.
alter table public.registration_items
  add column if not exists bundle_id text,
  add column if not exists bundle_name text,
  add column if not exists bundle_price integer not null default 0;

alter table public.registration_items
  drop constraint if exists ck_registration_items_bundle_price,
  add constraint ck_registration_items_bundle_price check (bundle_price >= 0);

comment on column public.registration_items.bundle_name is
  'Name of the optional registration bundle selected by this rider at submission time.';
comment on column public.registration_items.bundle_price is
  'Bundle surcharge per rider captured at submission time; included in price.';

commit;

-- Rollback only after bundle fields are no longer needed by registration
-- history or exports:
-- begin;
-- alter table public.registration_items
--   drop constraint if exists ck_registration_items_bundle_price,
--   drop column if exists bundle_price,
--   drop column if exists bundle_name,
--   drop column if exists bundle_id;
-- commit;
