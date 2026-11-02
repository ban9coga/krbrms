-- Temporarily allow the same plate number in different categories for
-- Supernova Series 2 and Sumatera Grandprix 2026, while keeping plates unique
-- within each category. Leave existing events' current plate data untouched.
-- Apply before importing riders; every imported rider must have a category.

begin;

drop index if exists public.uq_riders_plate_per_event;
drop index if exists public.uq_riders_plate_per_event_except_supernova;
drop index if exists public.uq_riders_plate_per_category_supernova;
drop index if exists public.uq_riders_unassigned_plate_supernova;
drop index if exists public.uq_riders_plate_per_event_except_sn2_sgp;
drop index if exists public.uq_riders_plate_per_category_sn2_sgp;
drop index if exists public.uq_riders_unassigned_plate_sn2_sgp;

create unique index uq_riders_plate_per_category_sn2_sgp
  on public.riders (event_id, primary_category_id, plate_number, coalesce(plate_suffix, ''))
  where event_id in (
    'ace137c2-a812-43f8-88e2-474c51c348e4'::uuid,
    'f2c9cb1f-88ab-4b59-9c67-de3599ff0bbb'::uuid
  )
    and primary_category_id is not null;

create unique index uq_riders_unassigned_plate_sn2_sgp
  on public.riders (event_id, plate_number, plate_suffix)
  where event_id in (
    'ace137c2-a812-43f8-88e2-474c51c348e4'::uuid,
    'f2c9cb1f-88ab-4b59-9c67-de3599ff0bbb'::uuid
  )
    and primary_category_id is null;

comment on index public.uq_riders_plate_per_category_sn2_sgp is
  'Temporary Supernova Series 2 and Sumatera Grandprix 2026 rule: plate uniqueness is scoped to category.';

commit;

-- Rollback: this removes only the temporary event-specific indexes.
-- Do not recreate event-wide uniqueness: legacy events already contain
-- repeated plate numbers across categories.
-- begin;
-- drop index if exists public.uq_riders_plate_per_category_sn2_sgp;
-- drop index if exists public.uq_riders_unassigned_plate_sn2_sgp;
-- commit;
