alter table if exists public.event_feature_flags
  add column if not exists dq_retains_final_classification boolean not null default false;

alter table if exists public.results
  add column if not exists dq_reason text,
  add column if not exists is_auto_dq boolean not null default false;

comment on column public.event_feature_flags.dq_retains_final_classification is
  'When enabled, a DQ rider remains in the lowest eligible final classification as a non-starter DQ row.';

comment on column public.results.dq_reason is
  'Required operational explanation for a Race Director DQ decision.';

comment on column public.results.is_auto_dq is
  'True when a DQ result was carried automatically into a final classification and cannot be scored by Finisher.';
