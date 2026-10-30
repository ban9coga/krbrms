alter table if exists public.race_stage_config
  add column if not exists single_batch_final_enabled boolean not null default false;

comment on column public.race_stage_config.single_batch_final_enabled is
  'When enabled, a category drawn into exactly one qualification batch creates Moto 3 at draw time and generates Final motos from qualification results.';
