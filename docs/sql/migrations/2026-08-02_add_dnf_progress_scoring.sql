alter table if exists public.results
  add column if not exists dnf_progress_percent numeric(5,2);

alter table if exists public.results
  drop constraint if exists results_dnf_progress_percent_check;

alter table if exists public.results
  add constraint results_dnf_progress_percent_check
    check (dnf_progress_percent is null or (dnf_progress_percent >= 0 and dnf_progress_percent <= 100));

alter table if exists public.event_feature_flags
  add column if not exists dnf_progress_enabled boolean not null default false;

comment on column public.results.dnf_progress_percent is
  'Progress 0-100 recorded only for DNF results when distance-based DNF scoring is enabled.';
