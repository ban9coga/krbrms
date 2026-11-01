alter table if exists public.race_stage_config
  drop constraint if exists race_stage_config_draw_moto3_order_check;

alter table if exists public.race_stage_config
  add constraint race_stage_config_draw_moto3_order_check
    check (draw_moto3_order in ('REVERSE', 'SAME', 'ODD_EVEN', 'EVEN_ODD'));

comment on column public.race_stage_config.draw_moto3_order is
  'Automatic Moto 3 gate order: REVERSE, SAME, or EVEN_ODD (even gate positions followed by odd gate positions). ODD_EVEN is retained for compatibility.';
