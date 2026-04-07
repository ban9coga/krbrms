-- Expand final/award class enums for updated pushbike stage mapping.

do $$
begin
  if exists (select 1 from pg_type where typname = 'final_class') then
    alter type final_class add value if not exists 'INTERMEDIATE';
    alter type final_class add value if not exists 'ADVANCED';
  end if;

  if exists (select 1 from pg_type where typname = 'award_type') then
    alter type award_type add value if not exists 'INTERMEDIATE';
    alter type award_type add value if not exists 'ADVANCED';
  end if;
end$$;
