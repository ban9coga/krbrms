-- Add optional quota per category
alter table categories
  add column if not exists capacity int;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_categories_capacity') then
    alter table categories
      add constraint ck_categories_capacity
      check (capacity is null or capacity >= 0);
  end if;
end $$;
