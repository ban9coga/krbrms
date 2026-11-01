alter table if exists public.race_stage_config
  drop constraint if exists race_stage_config_draw_moto2_order_check;

alter table if exists public.race_stage_config
  add constraint race_stage_config_draw_moto2_order_check
    check (draw_moto2_order in ('REVERSE', 'SAME', 'MIDDLE'));

comment on column public.race_stage_config.draw_moto2_order is
  'Automatic Moto 2 gate order: REVERSE, SAME, or MIDDLE (rotate the Moto 1 order by half its batch size).';
