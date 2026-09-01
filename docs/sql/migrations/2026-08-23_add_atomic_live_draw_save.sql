-- Save all draw output atomically. A failed rider or gate insert rolls back the
-- created motos as well, and the advisory lock prevents concurrent draw saves
-- from reusing the same event moto order.
create or replace function public.save_live_draw_motos(
  p_event_id uuid,
  p_category_id uuid,
  p_batches jsonb,
  p_moto2_batches jsonb
)
returns table (
  batch_count integer,
  moto_count integer,
  gate_positions_saved integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_count integer;
  v_base_order integer;
  v_batch_index integer;
  v_batch jsonb;
  v_moto2_batch jsonb;
  v_moto1_ids uuid[] := '{}'::uuid[];
  v_moto2_ids uuid[] := '{}'::uuid[];
  v_moto_id uuid;
  v_rider_id uuid;
  v_gate_position integer;
  v_gate_count integer := 0;
begin
  if jsonb_typeof(p_batches) <> 'array' or jsonb_array_length(p_batches) = 0 then
    raise exception 'At least one draw batch is required';
  end if;

  if jsonb_typeof(p_moto2_batches) <> 'array' then
    raise exception 'Moto 2 batches must be an array';
  end if;

  v_batch_count := jsonb_array_length(p_batches);
  if jsonb_array_length(p_moto2_batches) <> v_batch_count then
    raise exception 'Moto 2 batch count must match Moto 1 batch count';
  end if;

  -- Serialize all new moto creation in one event so moto_order remains unique
  -- in practice even when two category draws are saved from different devices.
  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text, 0));

  if exists (
    select 1
    from public.motos
    where event_id = p_event_id
      and category_id = p_category_id
  ) then
    raise exception using
      errcode = '23505',
      message = 'Motos already exist for this category. Live Draw skipped.';
  end if;

  select coalesce(max(moto_order), 0)
  into v_base_order
  from public.motos
  where event_id = p_event_id;

  for v_batch_index in 1..v_batch_count loop
    v_batch := p_batches -> (v_batch_index - 1);
    v_moto2_batch := p_moto2_batches -> (v_batch_index - 1);
    if jsonb_typeof(v_batch) <> 'array' or jsonb_array_length(v_batch) = 0 then
      raise exception 'Moto 1 batch % must contain riders', v_batch_index;
    end if;
    if jsonb_typeof(v_moto2_batch) <> 'array'
      or jsonb_array_length(v_moto2_batch) <> jsonb_array_length(v_batch) then
      raise exception 'Moto 2 batch % must match Moto 1 rider count', v_batch_index;
    end if;

    insert into public.motos (event_id, category_id, moto_name, moto_order, status)
    values (
      p_event_id,
      p_category_id,
      format('Moto 1 - Batch %s', v_batch_index),
      v_base_order + v_batch_index,
      'UPCOMING'
    )
    returning id into v_moto_id;
    v_moto1_ids := array_append(v_moto1_ids, v_moto_id);
  end loop;

  for v_batch_index in 1..v_batch_count loop
    insert into public.motos (event_id, category_id, moto_name, moto_order, status)
    values (
      p_event_id,
      p_category_id,
      format('Moto 2 - Batch %s', v_batch_index),
      v_base_order + v_batch_count + v_batch_index,
      'UPCOMING'
    )
    returning id into v_moto_id;
    v_moto2_ids := array_append(v_moto2_ids, v_moto_id);
  end loop;

  for v_batch_index in 1..v_batch_count loop
    v_batch := p_batches -> (v_batch_index - 1);
    v_moto2_batch := p_moto2_batches -> (v_batch_index - 1);

    for v_rider_id, v_gate_position in
      select value::uuid, ordinality::integer
      from jsonb_array_elements_text(v_batch) with ordinality
    loop
      insert into public.moto_riders (moto_id, rider_id)
      values (v_moto1_ids[v_batch_index], v_rider_id);

      insert into public.moto_gate_positions (moto_id, rider_id, gate_position)
      values (v_moto1_ids[v_batch_index], v_rider_id, v_gate_position);
      v_gate_count := v_gate_count + 1;
    end loop;

    for v_rider_id, v_gate_position in
      select value::uuid, ordinality::integer
      from jsonb_array_elements_text(v_moto2_batch) with ordinality
    loop
      insert into public.moto_riders (moto_id, rider_id)
      values (v_moto2_ids[v_batch_index], v_rider_id);

      insert into public.moto_gate_positions (moto_id, rider_id, gate_position)
      values (v_moto2_ids[v_batch_index], v_rider_id, v_gate_position);
      v_gate_count := v_gate_count + 1;
    end loop;
  end loop;

  return query
  select v_batch_count, v_batch_count * 2, v_gate_count;
end;
$$;

revoke all on function public.save_live_draw_motos(uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.save_live_draw_motos(uuid, uuid, jsonb, jsonb) to service_role;

comment on function public.save_live_draw_motos(uuid, uuid, jsonb, jsonb) is
  'Atomically saves qualification Moto 1/Moto 2, rider assignments, and gate positions for one category.';
