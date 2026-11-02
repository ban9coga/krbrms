begin;

-- Fixes the deferred Moto 2 generator. The RETURNS TABLE output variable is
-- named moto_id, so the rider-count query must qualify the table's moto_id.
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
  if v_rider_count = 0 or (
    select count(distinct requested.rider_id)
    from unnest(p_ordered_rider_ids) as requested(rider_id)
  ) <> v_rider_count then
    raise exception 'Moto 2 rider order is empty or contains duplicates';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || ':' || p_category_id::text, 0));
  if not exists (
    select 1
    from public.race_stage_config
    where event_id = p_event_id
      and category_id = p_category_id
      and single_batch_two_moto_final_enabled = true
  ) then
    raise exception 'Deferred one-batch final mode is not enabled';
  end if;

  select m.id into v_moto1_id
  from public.motos m
  where m.event_id = p_event_id
    and m.category_id = p_category_id
    and lower(m.moto_name) = 'moto 1 - batch 1'
  for update;
  if v_moto1_id is null then
    raise exception 'Moto 1 - Batch 1 not found';
  end if;

  select m.id into v_moto2_id
  from public.motos m
  where m.event_id = p_event_id
    and m.category_id = p_category_id
    and lower(m.moto_name) = 'moto 2 - batch 1';
  if v_moto2_id is not null then
    return query select v_moto2_id, false;
    return;
  end if;

  if exists (
    select 1
    from public.moto_riders mr
    left join public.results r on r.moto_id = mr.moto_id and r.rider_id = mr.rider_id
    where mr.moto_id = v_moto1_id
      and r.rider_id is null
  ) then
    raise exception 'All Moto 1 results must be submitted before creating Moto 2';
  end if;

  if (
      select count(*)
      from public.moto_riders assigned_moto_rider
      where assigned_moto_rider.moto_id = v_moto1_id
    ) <> v_rider_count
    or exists (
      select 1
      from public.moto_riders mr
      where mr.moto_id = v_moto1_id
        and not (mr.rider_id = any(p_ordered_rider_ids))
    ) then
    raise exception 'Moto 2 must contain every Moto 1 rider exactly once';
  end if;

  select coalesce(max(m.moto_order), 0) into v_base_order
  from public.motos m
  where m.event_id = p_event_id;

  insert into public.motos (event_id, category_id, moto_name, moto_order, status)
  values (p_event_id, p_category_id, 'Moto 2 - Batch 1', v_base_order + 1, 'UPCOMING')
  returning id into v_moto2_id;

  insert into public.moto_riders (moto_id, rider_id)
  select v_moto2_id, requested.rider_id
  from unnest(p_ordered_rider_ids) with ordinality as requested(rider_id, gate_position);

  insert into public.moto_gate_positions (moto_id, rider_id, gate_position)
  select v_moto2_id, requested.rider_id, requested.gate_position::integer
  from unnest(p_ordered_rider_ids) with ordinality as requested(rider_id, gate_position);

  return query select v_moto2_id, true;
end;
$$;

revoke all on function public.create_single_batch_moto2_from_results(uuid, uuid, uuid[]) from public;
grant execute on function public.create_single_batch_moto2_from_results(uuid, uuid, uuid[]) to service_role;

comment on function public.create_single_batch_moto2_from_results(uuid, uuid, uuid[]) is
  'Creates deferred Moto 2 only after every Moto 1 rider result is present, using the validated points order.';

commit;
