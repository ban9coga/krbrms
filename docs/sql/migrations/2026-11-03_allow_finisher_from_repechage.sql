begin;

-- A rider routed to FINISHER by Repechage rules is terminal and receives no
-- further moto, matching the existing Qualification FINISHER behavior.
alter table public.race_category_custom_split_rule
  drop constraint if exists race_category_custom_split_rule_finisher_source_check;

alter table public.race_category_custom_split_rule
  add constraint race_category_custom_split_rule_finisher_source_check
  check (target_outcome <> 'FINISHER' or source_stage in ('QUALIFICATION', 'REPECHAGE'));

comment on column public.race_category_custom_split_rule.target_outcome is
  'STAGE routes a rider to a later race stage; FINISHER is a terminal Qualification or Repechage outcome without creating another moto.';

commit;

-- Rollback after changing/removing any Repechage FINISHER rules:
-- begin;
-- alter table public.race_category_custom_split_rule
--   drop constraint if exists race_category_custom_split_rule_finisher_source_check;
-- alter table public.race_category_custom_split_rule
--   add constraint race_category_custom_split_rule_finisher_source_check
--   check (target_outcome <> 'FINISHER' or source_stage = 'QUALIFICATION');
-- comment on column public.race_category_custom_split_rule.target_outcome is
--   'STAGE routes the rider to a later race stage; FINISHER records a terminal Qualification outcome without creating a moto.';
-- commit;
