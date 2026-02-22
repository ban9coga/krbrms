do $$
begin
  if exists (select 1 from pg_type where typname = 'moto_status') then
    begin
      alter type moto_status add value if not exists 'PROVISIONAL';
      alter type moto_status add value if not exists 'PROTEST_REVIEW';
      alter type moto_status add value if not exists 'LOCKED';
    exception
      when others then
        -- ignore if enum values already exist in older Postgres versions
        null;
    end;
  end if;
end$$;
