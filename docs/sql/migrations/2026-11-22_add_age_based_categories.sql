begin;

alter table public.categories
  add column if not exists category_basis text not null default 'BIRTH_YEAR',
  add column if not exists age_min integer,
  add column if not exists age_max integer;

-- Age categories share an event-year compatibility value, so they must not
-- collide with the existing event/year/gender uniqueness rule.
drop index if exists public.uq_categories_event_year_gender;
create unique index uq_categories_event_year_gender
  on public.categories(event_id, year, gender)
  where category_basis = 'BIRTH_YEAR';
create unique index if not exists uq_categories_event_age_range_gender
  on public.categories(event_id, age_min, age_max, gender)
  where category_basis = 'AGE';

alter table public.categories
  drop constraint if exists ck_categories_category_basis,
  drop constraint if exists ck_categories_age_range;

alter table public.categories
  add constraint ck_categories_category_basis
    check (category_basis in ('BIRTH_YEAR', 'AGE')),
  add constraint ck_categories_age_range
    check (
      (category_basis = 'BIRTH_YEAR' and age_min is null and age_max is null)
      or (category_basis = 'AGE' and age_min is not null and age_max is not null and age_min >= 0 and age_min <= age_max)
    );

comment on column public.categories.category_basis is
  'Determines whether eligibility uses birth-year range or age on the event date.';
comment on column public.categories.age_min is
  'Inclusive minimum age in completed years on the event date when category_basis is AGE.';
comment on column public.categories.age_max is
  'Inclusive maximum age in completed years on the event date when category_basis is AGE.';

commit;

-- Rollback only after deleting AGE categories and resolving any conflicts
-- between their compatibility year and existing BIRTH_YEAR categories:
-- begin;
-- drop index if exists public.uq_categories_event_age_range_gender;
-- drop index if exists public.uq_categories_event_year_gender;
-- create unique index uq_categories_event_year_gender
--   on public.categories(event_id, year, gender);
-- alter table public.categories
--   drop constraint if exists ck_categories_age_range,
--   drop constraint if exists ck_categories_category_basis,
--   drop column if exists age_max,
--   drop column if exists age_min,
--   drop column if exists category_basis;
-- commit;
