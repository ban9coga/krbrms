-- Add EXPLORER as a supported final_class enum value for existing databases.

do $$
begin
  if exists (select 1 from pg_type where typname = 'final_class') then
    alter type final_class add value if not exists 'EXPLORER';
  end if;
end$$;
