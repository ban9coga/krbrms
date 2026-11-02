begin;

alter table if exists public.race_stage_config
  add column if not exists single_batch_two_moto_final_enabled boolean not null default false;

comment on column public.race_stage_config.single_batch_two_moto_final_enabled is
  'For one-batch categories, draw Moto 1 first, create Moto 2 after Moto 1 results are complete and seed its gates from Moto 1 points; generate configured Final motos after qualification is locked.';

-- Save only Moto 1 for the deferred one-batch mode. The transaction prevents
-- a partially saved draw and the advisory lock protects concurrent draw screens.
create or replace function public.save_live_draw_moto1_only(
  p_event_id uuid,
  p_category_id uuid,
  p_rider_ids uuid[]
)
returns table (moto_id uuid, rider_count integer, gate_positions_saved integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moto_id uuid;
  v_rider_count integer;
  v_base_order integer;
begin
  v_rider_count := coalesce(array_length(p_rider_ids, 1), 0);
  if v_rider_count = 0 then
    raise exception 'Moto 1 must contain riders';
  end if;
  if (select count(distinct requested.rider_id) from unnest(p_rider_ids) as requested(rider_id)) <> v_rider_count then
    raise exception 'Moto 1 contains duplicate riders';
  end if;
  if not exists (
    select 1 from public.race_stage_config
    where event_id = p_event_id and category_id = p_category_id
      and single_batch_two_moto_final_enabled = true
  ) then
    raise exception 'Deferred one-batch final mode is not enabled';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || ':' || p_category_id::text, 0));
  if exists (select 1 from public.motos where event_id = p_event_id and category_id = p_category_id) then
    raise exception using errcode = '23505', message = 'Motos already exist for this category. Live Draw skipped.';
  end if;
  if not exists (select 1 from public.categories where id = p_category_id and event_id = p_event_id)
    or exists (
      select 1 from unnest(p_rider_ids) as requested(rider_id)
      where not exists (select 1 from public.riders r where r.id = requested.rider_id and r.event_id = p_event_id)
    ) then
    raise exception 'Moto 1 contains a rider outside this event';
  end if;

  select coalesce(max(moto_order), 0) into v_base_order
  from public.motos where event_id = p_event_id;
  insert into public.motos (event_id, category_id, moto_name, moto_order, status)
  values (p_event_id, p_category_id, 'Moto 1 - Batch 1', v_base_order + 1, 'UPCOMING')
  returning id into v_moto_id;

  insert into public.moto_riders (moto_id, rider_id)
  select v_moto_id, requested.rider_id from unnest(p_rider_ids) with ordinality as requested(rider_id, gate_position);
  insert into public.moto_gate_positions (moto_id, rider_id, gate_position)
  select v_moto_id, requested.rider_id, requested.gate_position::integer
  from unnest(p_rider_ids) with ordinality as requested(rider_id, gate_position);

  return query select v_moto_id, v_rider_count, v_rider_count;
end;
$$;

revoke all on function public.save_live_draw_moto1_only(uuid, uuid, uuid[]) from public;
grant execute on function public.save_live_draw_moto1_only(uuid, uuid, uuid[]) to service_role;

-- Create Moto 2 once every Moto 1 rider has a submitted result. The caller
-- supplies the score order; this RPC validates the full rider set atomically.
create or replace function public.create_single_batch_moto2_from_results(
  p_event_id uuid,
  p_category_id uuid,
  p_ordered_rider_ids uuid[]
)
returns table (moto_id uuid, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moto1_id uuid;
  v_moto2_id uuid;
  v_rider_count integer;
  v_base_order integer;
begin
  v_rider_count := coalesce(array_length(p_ordered_rider_ids, 1), 0);
  if v_rider_count = 0 or (select count(distinct requested.rider_id) from unnest(p_ordered_rider_ids) as requested(rider_id)) <> v_rider_count then
    raise exception 'Moto 2 rider order is empty or contains duplicates';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || ':' || p_category_id::text, 0));
  if not exists (
    select 1 from public.race_stage_config
    where event_id = p_event_id and category_id = p_category_id
      and single_batch_two_moto_final_enabled = true
  ) then
    raise exception 'Deferred one-batch final mode is not enabled';
  end if;

  select id into v_moto1_id from public.motos
  where event_id = p_event_id and category_id = p_category_id and lower(moto_name) = 'moto 1 - batch 1'
  for update;
  if v_moto1_id is null then raise exception 'Moto 1 - Batch 1 not found'; end if;

  select id into v_moto2_id from public.motos
  where event_id = p_event_id and category_id = p_category_id and lower(moto_name) = 'moto 2 - batch 1';
  if v_moto2_id is not null then
    return query select v_moto2_id, false;
    return;
  end if;

  if exists (
    select 1 from public.moto_riders mr
    left join public.results r on r.moto_id = mr.moto_id and r.rider_id = mr.rider_id
    where mr.moto_id = v_moto1_id and r.rider_id is null
  ) then
    raise exception 'All Moto 1 results must be submitted before creating Moto 2';
  end if;
  if (select count(*) from public.moto_riders where moto_id = v_moto1_id) <> v_rider_count
    or exists (
      select 1 from public.moto_riders mr
      where mr.moto_id = v_moto1_id
        and not (mr.rider_id = any(p_ordered_rider_ids))
    ) then
    raise exception 'Moto 2 must contain every Moto 1 rider exactly once';
  end if;

  select coalesce(max(moto_order), 0) into v_base_order from public.motos where event_id = p_event_id;
  insert into public.motos (event_id, category_id, moto_name, moto_order, status)
  values (p_event_id, p_category_id, 'Moto 2 - Batch 1', v_base_order + 1, 'UPCOMING')
  returning id into v_moto2_id;
  insert into public.moto_riders (moto_id, rider_id)
  select v_moto2_id, requested.rider_id from unnest(p_ordered_rider_ids) with ordinality as requested(rider_id, gate_position);
  insert into public.moto_gate_positions (moto_id, rider_id, gate_position)
  select v_moto2_id, requested.rider_id, requested.gate_position::integer
  from unnest(p_ordered_rider_ids) with ordinality as requested(rider_id, gate_position);

  return query select v_moto2_id, true;
end;
$$;

revoke all on function public.create_single_batch_moto2_from_results(uuid, uuid, uuid[]) from public;
grant execute on function public.create_single_batch_moto2_from_results(uuid, uuid, uuid[]) to service_role;

commit;
