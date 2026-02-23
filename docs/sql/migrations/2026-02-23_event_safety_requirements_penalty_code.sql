-- Link safety requirements to event penalty rules
alter table if exists event_safety_requirements
  add column if not exists penalty_code text;

-- Optional FK to ensure penalty_code exists for the same event
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_safety_requirements_penalty_code_fkey'
  ) then
    alter table event_safety_requirements
      add constraint event_safety_requirements_penalty_code_fkey
      foreign key (event_id, penalty_code)
      references event_penalty_rules(event_id, code)
      on update cascade
      on delete set null;
  end if;
end$$;
