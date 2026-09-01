alter table if exists public.race_stage_config
  add column if not exists draw_batch_mode text not null default 'AUTO_BY_GATE',
  add column if not exists draw_batch_size integer,
  add column if not exists draw_batch_count integer,
  add column if not exists draw_custom_batch_sizes jsonb not null default '[]'::jsonb,
  add column if not exists draw_moto2_order text not null default 'REVERSE';

alter table if exists public.race_stage_config
  drop constraint if exists race_stage_config_draw_batch_mode_check,
  drop constraint if exists race_stage_config_draw_batch_size_check,
  drop constraint if exists race_stage_config_draw_batch_count_check,
  drop constraint if exists race_stage_config_draw_custom_batch_sizes_check,
  drop constraint if exists race_stage_config_draw_moto2_order_check;

alter table if exists public.race_stage_config
  add constraint race_stage_config_draw_batch_mode_check
    check (draw_batch_mode in ('AUTO_BY_GATE', 'MANUAL_BATCH_COUNT', 'CUSTOM_BATCH_SIZES')),
  add constraint race_stage_config_draw_batch_size_check
    check (draw_batch_size is null or draw_batch_size >= 1),
  add constraint race_stage_config_draw_batch_count_check
    check (draw_batch_count is null or draw_batch_count >= 1),
  add constraint race_stage_config_draw_custom_batch_sizes_check
    check (jsonb_typeof(draw_custom_batch_sizes) = 'array'),
  add constraint race_stage_config_draw_moto2_order_check
    check (draw_moto2_order in ('REVERSE', 'SAME'));

comment on column public.race_stage_config.draw_batch_mode is
  'Drawing batch distribution per category: AUTO_BY_GATE, MANUAL_BATCH_COUNT, or CUSTOM_BATCH_SIZES.';
