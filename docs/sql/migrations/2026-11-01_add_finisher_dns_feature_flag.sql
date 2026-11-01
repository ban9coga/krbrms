do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'event_feature_flags'
      and column_name = 'finisher_dns_enabled'
  ) then
    alter table public.event_feature_flags
      add column finisher_dns_enabled boolean not null default false;

    -- Preserve the legacy shared DNS setting for existing events on rollout.
    update public.event_feature_flags
    set finisher_dns_enabled = dns_enabled;
  end if;
end;
$$;

comment on column public.event_feature_flags.finisher_dns_enabled is
  'Controls the manual Set DNS action on the Jury Finisher screen. Does not control Checker DNS actions.';

-- Rollback: alter table public.event_feature_flags drop column if exists finisher_dns_enabled;
