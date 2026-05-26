do $$
begin
  if exists (select 1 from pg_type where typname = 'race_stage') then
    begin
      alter type race_stage add value if not exists 'REPECHAGE' after 'QUARTER_FINAL';
    exception
      when others then
        null;
    end;
  end if;

  if exists (select 1 from pg_type where typname = 'penalty_stage') then
    begin
      alter type penalty_stage add value if not exists 'REPECHAGE' after 'QUARTER';
    exception
      when others then
        null;
    end;
  end if;
end$$;
