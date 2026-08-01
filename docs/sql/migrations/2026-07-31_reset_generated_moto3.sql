-- Include the dynamically generated single-batch qualification Moto 3 in an event race reset.
-- Live Draw creates only Moto 1 and Moto 2. Moto 3 - Batch 1 is added later after Moto 2 is complete.

create or replace function public.reset_event_race_data(
  p_event_id uuid,
  p_performed_by text,
  p_reason text default 'Reset data race untuk simulasi'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_status text;
  v_reset_moto_ids uuid[] := array[]::uuid[];
  v_advanced_moto_count integer := 0;
  v_generated_moto_count integer := 0;
  v_result_count integer := 0;
  v_penalty_count integer := 0;
begin
  select upper(coalesce(status::text, ''))
    into v_event_status
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Event tidak ditemukan.';
  end if;
  if v_event_status <> 'UPCOMING' then
    raise exception 'Reset hanya dapat dijalankan pada event UPCOMING.';
  end if;

  -- Advanced stages are always generated. Under the current draw flow, Moto 3 is also
  -- generated only for a single-batch qualification after Moto 2 has complete results.
  select coalesce(array_agg(m.id), array[]::uuid[])
    into v_reset_moto_ids
  from public.motos m
  where m.event_id = p_event_id
    and (
      upper(m.moto_name) ~ '^(REPECHAGE|QUARTER[[:space:]]+FINAL|SEMI[[:space:]]+FINAL|FINAL[[:space:]])'
      or (
        upper(m.moto_name) ~ '^MOTO[[:space:]]*3[[:space:]]*-[[:space:]]*BATCH[[:space:]]*1[[:space:]]*$'
        and 1 = (
          select count(distinct (regexp_match(upper(q.moto_name), '^MOTO[[:space:]]*[0-9]+[[:space:]]*-[[:space:]]*BATCH[[:space:]]*([0-9]+)'))[1])
          from public.motos q
          where q.event_id = p_event_id
            and q.category_id = m.category_id
            and upper(q.moto_name) ~ '^MOTO[[:space:]]*[0-9]+[[:space:]]*-[[:space:]]*BATCH[[:space:]]*[0-9]+[[:space:]]*$'
        )
      )
    );

  select count(*) into v_advanced_moto_count
  from public.motos
  where id = any(v_reset_moto_ids)
    and upper(moto_name) ~ '^(REPECHAGE|QUARTER[[:space:]]+FINAL|SEMI[[:space:]]+FINAL|FINAL[[:space:]])';

  select count(*) into v_generated_moto_count
  from public.motos
  where id = any(v_reset_moto_ids)
    and upper(moto_name) ~ '^MOTO[[:space:]]*3[[:space:]]*-[[:space:]]*BATCH[[:space:]]*1[[:space:]]*$';

  select count(*) into v_result_count from public.results where event_id = p_event_id;
  select count(*) into v_penalty_count from public.rider_penalties where event_id = p_event_id;

  delete from public.protests where event_id = p_event_id;
  delete from public.race_awards where event_id = p_event_id;
  delete from public.rider_status_updates where event_id = p_event_id;
  delete from public.rider_participation_status where event_id = p_event_id;
  delete from public.rider_safety_checks where event_id = p_event_id;
  delete from public.results where event_id = p_event_id;

  delete from public.rider_penalty_approvals
  where penalty_id in (select id from public.rider_penalties where event_id = p_event_id);
  delete from public.rider_penalties where event_id = p_event_id;
  delete from public.moto_locks where event_id = p_event_id;

  delete from public.race_stage_result
  where category_id in (select id from public.categories where event_id = p_event_id);

  delete from public.moto_gate_positions where moto_id = any(v_reset_moto_ids);
  delete from public.moto_riders where moto_id = any(v_reset_moto_ids);
  delete from public.motos where id = any(v_reset_moto_ids);

  update public.motos
  set status = 'UPCOMING',
      provisional_at = null,
      published_at = null,
      is_published = false,
      checker_prep_ready_at = null,
      checker_prep_ready_by = null
  where event_id = p_event_id;

  insert into public.audit_log (action_type, performed_by, event_id, reason)
  values ('RESULT_OVERRIDE', p_performed_by, p_event_id, coalesce(nullif(trim(p_reason), ''), 'Reset data race untuk simulasi'));

  return jsonb_build_object(
    'motos_deleted', cardinality(v_reset_moto_ids),
    'advanced_motos_deleted', v_advanced_moto_count,
    'generated_qualification_motos_deleted', v_generated_moto_count,
    'results_deleted', v_result_count,
    'penalties_deleted', v_penalty_count
  );
end;
$$;

revoke all on function public.reset_event_race_data(uuid, text, text) from public;
grant execute on function public.reset_event_race_data(uuid, text, text) to service_role;
