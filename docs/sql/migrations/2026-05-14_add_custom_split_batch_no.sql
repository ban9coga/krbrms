alter table race_category_custom_split_rule
  add column if not exists batch_no int;

alter table race_category_custom_split_rule
  drop constraint if exists race_category_custom_split_rule_split_basis_check;

alter table race_category_custom_split_rule
  add constraint race_category_custom_split_rule_split_basis_check
  check (split_basis in ('COMBINED', 'PER_BATCH', 'CUSTOM_PER_BATCH'));
