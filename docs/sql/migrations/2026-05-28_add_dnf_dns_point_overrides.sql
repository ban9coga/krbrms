alter table if exists public.race_stage_config
  add column if not exists dnf_point_override integer,
  add column if not exists dns_point_override integer;

alter table if exists public.race_stage_config
  drop constraint if exists race_stage_config_dnf_point_override_check,
  drop constraint if exists race_stage_config_dns_point_override_check;

alter table if exists public.race_stage_config
  add constraint race_stage_config_dnf_point_override_check
    check (dnf_point_override is null or dnf_point_override >= 1),
  add constraint race_stage_config_dns_point_override_check
    check (dns_point_override is null or dns_point_override >= 1);
