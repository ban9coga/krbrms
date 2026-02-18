-- Add year range support for categories
alter table categories
  add column if not exists year_min int,
  add column if not exists year_max int;

update categories
set
  year_min = coalesce(year_min, year),
  year_max = coalesce(year_max, year)
where year_min is null or year_max is null;

alter table categories
  alter column year_min set not null,
  alter column year_max set not null;

-- Optional safety check
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_categories_year_range') then
    alter table categories
      add constraint ck_categories_year_range check (year_min <= year_max);
  end if;
end$$;
