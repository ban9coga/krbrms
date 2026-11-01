alter table public.race_stage_result
  add column if not exists qualification_next_outcome text,
  add column if not exists qualification_next_stage race_stage,
  add column if not exists qualification_next_final_class final_class;

alter table public.race_stage_result
  drop constraint if exists ck_race_stage_result_qualification_next_outcome;

alter table public.race_stage_result
  add constraint ck_race_stage_result_qualification_next_outcome
  check (
    (qualification_next_outcome is null and qualification_next_stage is null and qualification_next_final_class is null)
    or (
      stage = 'QUALIFICATION'
      and (
        (qualification_next_outcome = 'STAGE' and qualification_next_stage is not null and qualification_next_stage <> 'QUALIFICATION' and (qualification_next_stage = 'FINAL' or qualification_next_final_class is null))
        or (qualification_next_outcome in ('FINISHER', 'UNASSIGNED') and qualification_next_stage is null and qualification_next_final_class is null)
      )
    )
  );

comment on column public.race_stage_result.qualification_next_outcome is
  'Frozen Qualification destination outcome: STAGE, FINISHER, or UNASSIGNED. Null means the row predates destination persistence.';
comment on column public.race_stage_result.qualification_next_stage is
  'Frozen next race stage for a Qualification result row when qualification_next_outcome is STAGE.';
comment on column public.race_stage_result.qualification_next_final_class is
  'Frozen destination final class for a Qualification result row when qualification_next_stage is FINAL.';
