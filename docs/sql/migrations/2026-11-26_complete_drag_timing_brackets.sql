begin;

-- Timing brackets store one drag_heats row per bracket match. Each rider's
-- two lane-swapped attempts (and any tie-break run) are stored as separate
-- drag_run_results rows for that match.
drop index if exists public.uq_drag_heats_timing_run_heat;
create unique index if not exists uq_drag_heats_timing_round_run_heat
  on public.drag_heats(event_id, category_id, round_number, run_number, heat_number)
  where scoring_format = 'DRAG_TIMING';

alter table public.drag_run_results
  drop constraint if exists uq_drag_run_results_heat_rider,
  drop constraint if exists drag_run_results_run_number_check,
  drop constraint if exists ck_drag_run_results_run_number_positive;
alter table public.drag_run_results
  add constraint ck_drag_run_results_run_number_positive check (run_number > 0),
  add constraint uq_drag_run_results_heat_rider_run unique (heat_id, rider_id, run_number);

create or replace function public.resolve_drag_timing_bracket_heat(
  p_heat_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_heat public.drag_heats%rowtype;
  v_next public.drag_heats%rowtype;
  v_runoff integer;
  v_complete_count integer;
  v_a_bad boolean;
  v_b_bad boolean;
  v_a_total numeric(12,3);
  v_b_total numeric(12,3);
  v_a_et numeric(12,3);
  v_b_et numeric(12,3);
  v_a_rt numeric(12,3);
  v_b_rt numeric(12,3);
  v_winner uuid;
  v_outcome text;
  v_loser_status text;
  v_next_rider uuid;
begin
  select * into v_heat
  from public.drag_heats
  where id = p_heat_id
  for update;
  if not found or v_heat.scoring_format <> 'DRAG_TIMING' or v_heat.run_number <> 1 then
    return;
  end if;

  -- Legacy timing drawings have separate heat rows for Run 1 and Run 2.
  -- Leave those rows on their existing ranking workflow.
  if exists (
    select 1 from public.drag_heats other_run
    where other_run.event_id = v_heat.event_id
      and other_run.category_id = v_heat.category_id
      and other_run.round_number = v_heat.round_number
      and other_run.heat_number = v_heat.heat_number
      and other_run.id <> v_heat.id
  ) then
    return;
  end if;
  if v_heat.status = 'COMPLETE' or v_heat.status = 'VOID'
    or v_heat.lane_a_rider_id is null or v_heat.lane_b_rider_id is null then
    return;
  end if;

  -- Before a tie-break, both riders need a submitted result for each of the
  -- two lane-swapped runs. A RERUN entry is an invalid attempt and is replaced.
  select count(*) into v_complete_count
  from public.drag_run_results r
  where r.heat_id = v_heat.id
    and r.rider_id in (v_heat.lane_a_rider_id, v_heat.lane_b_rider_id)
    and r.run_number in (1, 2)
    and r.result_status <> 'RERUN';
  if v_complete_count < 4 then
    update public.drag_heats set status = 'LIVE', updated_by = p_actor_id where id = v_heat.id;
    return;
  end if;

  if v_heat.outcome = 'RERUN' then
    select max(r.run_number) into v_runoff
    from public.drag_run_results r
    where r.heat_id = v_heat.id and r.run_number > 2;
    if v_runoff is null then
      update public.drag_heats set status = 'LIVE', updated_by = p_actor_id where id = v_heat.id;
      return;
    end if;
    select count(*) into v_complete_count
    from public.drag_run_results r
    where r.heat_id = v_heat.id and r.run_number = v_runoff and r.result_status <> 'RERUN';
    if v_complete_count < 2 then
      update public.drag_heats set status = 'LIVE', updated_by = p_actor_id where id = v_heat.id;
      return;
    end if;

    select bool_or(r.result_status <> 'FINISH') into v_a_bad
    from public.drag_run_results r
    where r.heat_id = v_heat.id and r.run_number = v_runoff and r.rider_id = v_heat.lane_a_rider_id;
    select bool_or(r.result_status <> 'FINISH') into v_b_bad
    from public.drag_run_results r
    where r.heat_id = v_heat.id and r.run_number = v_runoff and r.rider_id = v_heat.lane_b_rider_id;
    if coalesce(v_a_bad, true) <> coalesce(v_b_bad, true) then
      v_winner := case when coalesce(v_a_bad, true) then v_heat.lane_b_rider_id else v_heat.lane_a_rider_id end;
      select r.result_status into v_loser_status
      from public.drag_run_results r
      where r.heat_id = v_heat.id and r.run_number = v_runoff
        and r.rider_id = case when v_winner = v_heat.lane_a_rider_id then v_heat.lane_b_rider_id else v_heat.lane_a_rider_id end
      order by case r.result_status when 'DSQ' then 1 when 'DNS' then 2 when 'DNF' then 3 else 4 end
      limit 1;
    elsif coalesce(v_a_bad, true) then
      update public.drag_heats set status = 'LIVE', outcome = 'RERUN', updated_by = p_actor_id where id = v_heat.id;
      return;
    else
      select r.total_seconds, r.elapsed_time_seconds, r.reaction_time_seconds
        into v_a_total, v_a_et, v_a_rt
      from public.drag_run_results r
      where r.heat_id = v_heat.id and r.run_number = v_runoff and r.rider_id = v_heat.lane_a_rider_id;
      select r.total_seconds, r.elapsed_time_seconds, r.reaction_time_seconds
        into v_b_total, v_b_et, v_b_rt
      from public.drag_run_results r
      where r.heat_id = v_heat.id and r.run_number = v_runoff and r.rider_id = v_heat.lane_b_rider_id;
      if (v_a_total, v_a_et, v_a_rt) = (v_b_total, v_b_et, v_b_rt) then
        update public.drag_heats set status = 'LIVE', outcome = 'RERUN', updated_by = p_actor_id where id = v_heat.id;
        return;
      end if;
      v_winner := case when (v_a_total, v_a_et, v_a_rt) < (v_b_total, v_b_et, v_b_rt)
        then v_heat.lane_a_rider_id else v_heat.lane_b_rider_id end;
      v_loser_status := 'FINISH';
    end if;
    v_outcome := case v_loser_status when 'DSQ' then 'DSQ_ADVANCE' when 'DNS' then 'DNS_ADVANCE' when 'DNF' then 'DNF_ADVANCE' else 'FINISH' end;
  else
    select bool_or(r.result_status <> 'FINISH') into v_a_bad
    from public.drag_run_results r
    where r.heat_id = v_heat.id and r.run_number in (1, 2) and r.rider_id = v_heat.lane_a_rider_id;
    select bool_or(r.result_status <> 'FINISH') into v_b_bad
    from public.drag_run_results r
    where r.heat_id = v_heat.id and r.run_number in (1, 2) and r.rider_id = v_heat.lane_b_rider_id;

    if coalesce(v_a_bad, true) <> coalesce(v_b_bad, true) then
      v_winner := case when coalesce(v_a_bad, true) then v_heat.lane_b_rider_id else v_heat.lane_a_rider_id end;
      select r.result_status into v_loser_status
      from public.drag_run_results r
      where r.heat_id = v_heat.id
        and r.run_number in (1, 2)
        and r.rider_id = case when v_winner = v_heat.lane_a_rider_id then v_heat.lane_b_rider_id else v_heat.lane_a_rider_id end
        and r.result_status <> 'FINISH'
      order by case r.result_status when 'DSQ' then 1 when 'DNS' then 2 when 'DNF' then 3 else 4 end
      limit 1;
    elsif coalesce(v_a_bad, true) then
      update public.drag_heats set status = 'LIVE', outcome = 'RERUN', updated_by = p_actor_id where id = v_heat.id;
      return;
    else
      select round(sum(r.total_seconds), 3), round(sum(r.elapsed_time_seconds), 3), round(sum(r.reaction_time_seconds), 3)
        into v_a_total, v_a_et, v_a_rt
      from public.drag_run_results r
      where r.heat_id = v_heat.id and r.run_number in (1, 2) and r.rider_id = v_heat.lane_a_rider_id;
      select round(sum(r.total_seconds), 3), round(sum(r.elapsed_time_seconds), 3), round(sum(r.reaction_time_seconds), 3)
        into v_b_total, v_b_et, v_b_rt
      from public.drag_run_results r
      where r.heat_id = v_heat.id and r.run_number in (1, 2) and r.rider_id = v_heat.lane_b_rider_id;
      if (v_a_total, v_a_et, v_a_rt) = (v_b_total, v_b_et, v_b_rt) then
        update public.drag_heats set status = 'LIVE', outcome = 'RERUN', updated_by = p_actor_id where id = v_heat.id;
        return;
      end if;
      v_winner := case when (v_a_total, v_a_et, v_a_rt) < (v_b_total, v_b_et, v_b_rt)
        then v_heat.lane_a_rider_id else v_heat.lane_b_rider_id end;
      v_loser_status := 'FINISH';
    end if;
    v_outcome := case v_loser_status when 'DSQ' then 'DSQ_ADVANCE' when 'DNS' then 'DNS_ADVANCE' when 'DNF' then 'DNF_ADVANCE' else 'FINISH' end;
  end if;

  update public.drag_heats
  set winner_rider_id = v_winner, outcome = v_outcome, status = 'COMPLETE', updated_by = p_actor_id
  where id = v_heat.id;
  insert into public.drag_result_audit(event_id, category_id, heat_id, rider_id, action, before_value, after_value, actor_id)
  values (
    v_heat.event_id, v_heat.category_id, v_heat.id, v_winner, 'TIMING_BRACKET_ADVANCE',
    jsonb_build_object('winner_rider_id', v_heat.winner_rider_id, 'outcome', v_heat.outcome, 'status', v_heat.status),
    jsonb_build_object('winner_rider_id', v_winner, 'outcome', v_outcome, 'runoff', v_runoff), p_actor_id
  );

  if v_heat.next_heat_id is not null then
    select * into v_next from public.drag_heats
    where id = v_heat.next_heat_id and event_id = v_heat.event_id and category_id = v_heat.category_id
    for update;
    if not found then raise exception 'Next bracket heat not found in this category'; end if;
    v_next_rider := case when v_heat.next_slot = 'A' then v_next.lane_a_rider_id else v_next.lane_b_rider_id end;
    if v_heat.next_slot not in ('A', 'B') then raise exception 'Next bracket slot is not configured'; end if;
    if v_next_rider is not null and v_next_rider <> v_winner then raise exception 'Next bracket slot is already assigned'; end if;
    if v_heat.next_slot = 'A' then
      update public.drag_heats set lane_a_rider_id = v_winner, updated_by = p_actor_id where id = v_next.id;
    else
      update public.drag_heats set lane_b_rider_id = v_winner, updated_by = p_actor_id where id = v_next.id;
    end if;
  end if;
end;
$$;

revoke all on function public.resolve_drag_timing_bracket_heat(uuid, uuid) from public;
grant execute on function public.resolve_drag_timing_bracket_heat(uuid, uuid) to service_role;

-- Admin correction resets the selected timed match and every completed match
-- that consumed its winner. All removed run values are retained in the audit log.
create or replace function public.reset_drag_timing_bracket_heat(
  p_heat_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_heat public.drag_heats%rowtype;
  v_source public.drag_heats%rowtype;
  v_next public.drag_heats%rowtype;
  v_event_id uuid;
  v_category_id uuid;
  v_old_winner_id uuid;
  v_slot_rider_id uuid;
  v_invalidated integer := 0;
  v_before jsonb;
begin
  if nullif(trim(p_reason), '') is null then raise exception 'Alasan reset wajib diisi'; end if;
  select h.event_id, h.category_id into v_event_id, v_category_id
  from public.drag_heats h where h.id = p_heat_id and h.scoring_format = 'DRAG_TIMING';
  if not found then raise exception 'Timing bracket heat tidak ditemukan'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_event_id::text || ':' || v_category_id::text, 0));
  select * into v_heat from public.drag_heats h where h.id = p_heat_id for update;
  if not found or v_heat.scoring_format <> 'DRAG_TIMING' or v_heat.run_number <> 1 then raise exception 'Timing bracket heat tidak ditemukan'; end if;
  if exists (
    select 1 from public.drag_heats other_run
    where other_run.event_id = v_event_id and other_run.category_id = v_category_id
      and other_run.round_number = v_heat.round_number and other_run.heat_number = v_heat.heat_number and other_run.id <> v_heat.id
  ) then raise exception 'Reset ini hanya untuk bracket timing, bukan drawing time trial lama'; end if;
  if v_heat.outcome = 'BYE' then raise exception 'Heat bye tidak dapat direset'; end if;
  if exists (select 1 from public.drag_final_results f where f.event_id = v_event_id and f.category_id = v_category_id) then
    raise exception 'Hasil kategori sudah difinalisasi';
  end if;

  v_before := to_jsonb(v_heat);
  insert into public.drag_result_audit(event_id, category_id, heat_id, rider_id, action, before_value, after_value, actor_id)
  select v_event_id, v_category_id, p_heat_id, r.rider_id, 'TIMING_RESULT_RESET', to_jsonb(r),
    jsonb_build_object('deleted', true, 'reason', trim(p_reason)), p_actor_id
  from public.drag_run_results r where r.heat_id = p_heat_id;
  delete from public.drag_run_results r where r.heat_id = p_heat_id;
  update public.drag_heats
  set winner_rider_id = null, outcome = 'PENDING', status = 'UPCOMING', updated_by = p_actor_id
  where id = p_heat_id;
  insert into public.drag_result_audit(event_id, category_id, heat_id, rider_id, action, before_value, after_value, actor_id)
  values (v_event_id, v_category_id, p_heat_id, v_heat.winner_rider_id, 'TIMING_HEAT_RESET', v_before,
    jsonb_build_object('winner_rider_id', null, 'outcome', 'PENDING', 'status', 'UPCOMING', 'reason', trim(p_reason)), p_actor_id);

  v_source := v_heat;
  v_old_winner_id := v_heat.winner_rider_id;
  while v_source.next_heat_id is not null and v_old_winner_id is not null loop
    select * into v_next from public.drag_heats h
    where h.id = v_source.next_heat_id and h.event_id = v_event_id and h.category_id = v_category_id
      and h.scoring_format = 'DRAG_TIMING'
    for update;
    if not found then raise exception 'Heat lanjutan tidak ditemukan pada kategori ini'; end if;
    if v_source.next_slot = 'A' then v_slot_rider_id := v_next.lane_a_rider_id;
    elsif v_source.next_slot = 'B' then v_slot_rider_id := v_next.lane_b_rider_id;
    else raise exception 'Slot heat lanjutan belum diatur'; end if;
    if v_slot_rider_id is distinct from v_old_winner_id then raise exception 'Slot heat lanjutan tidak cocok dengan pemenang sebelumnya'; end if;

    insert into public.drag_result_audit(event_id, category_id, heat_id, rider_id, action, before_value, after_value, actor_id)
    select v_event_id, v_category_id, v_next.id, r.rider_id, 'TIMING_DOWNSTREAM_RESULT_RESET', to_jsonb(r),
      jsonb_build_object('deleted', true, 'reason', trim(p_reason)), p_actor_id
    from public.drag_run_results r where r.heat_id = v_next.id;
    delete from public.drag_run_results r where r.heat_id = v_next.id;
    v_before := to_jsonb(v_next);
    v_old_winner_id := v_next.winner_rider_id;
    if v_source.next_slot = 'A' then
      update public.drag_heats set lane_a_rider_id = null, winner_rider_id = null, outcome = 'PENDING', status = 'UPCOMING', updated_by = p_actor_id where id = v_next.id;
    else
      update public.drag_heats set lane_b_rider_id = null, winner_rider_id = null, outcome = 'PENDING', status = 'UPCOMING', updated_by = p_actor_id where id = v_next.id;
    end if;
    insert into public.drag_result_audit(event_id, category_id, heat_id, rider_id, action, before_value, after_value, actor_id)
    values (v_event_id, v_category_id, v_next.id, v_next.winner_rider_id, 'TIMING_DOWNSTREAM_HEAT_RESET', v_before,
      jsonb_build_object('winner_rider_id', null, 'outcome', 'PENDING', 'status', 'UPCOMING', 'reason', trim(p_reason)), p_actor_id);
    v_invalidated := v_invalidated + 1;
    v_source := v_next;
  end loop;

  return v_invalidated;
end;
$$;

revoke all on function public.reset_drag_timing_bracket_heat(uuid, uuid, text) from public;
grant execute on function public.reset_drag_timing_bracket_heat(uuid, uuid, text) to service_role;

create or replace function public.save_drag_timing_match_run_result(
  p_heat_id uuid,
  p_run_number smallint,
  p_rider_id uuid,
  p_result_status text,
  p_reaction_time_seconds numeric,
  p_elapsed_time_seconds numeric,
  p_jump_start boolean,
  p_dns_called_twice boolean,
  p_actor_id uuid,
  p_note text default null
)
returns table (heat_id uuid, run_number smallint, total_seconds numeric, heat_status text, winner_rider_id uuid, outcome text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_heat public.drag_heats%rowtype;
  v_lane text;
  v_before jsonb;
  v_total numeric(10,3);
  v_penalty numeric(7,3) := case when coalesce(p_jump_start, false) then 3 else 0 end;
  v_max_run integer;
  v_previous_run_count integer;
  v_completed_results integer;
  v_assigned_riders integer;
  v_legacy_time_trial boolean;
  v_status text;
begin
  if p_run_number < 1 or p_run_number > 32767 then raise exception 'Nomor run tidak valid'; end if;
  if p_result_status not in ('FINISH', 'DNS', 'DNF', 'DSQ', 'RERUN') then raise exception 'Status hasil timing tidak valid'; end if;
  if p_result_status = 'FINISH' and (p_reaction_time_seconds is null or p_elapsed_time_seconds is null or p_elapsed_time_seconds < 0) then
    raise exception 'RT dan ET wajib diisi untuk hasil finish';
  end if;
  if p_result_status = 'DSQ' and nullif(trim(p_note), '') is null then raise exception 'Diskualifikasi perlu alasan'; end if;
  if p_result_status = 'DNS' and not coalesce(p_dns_called_twice, false) then raise exception 'DNS dicatat setelah rider dipanggil dua kali'; end if;

  select * into v_heat from public.drag_heats where id = p_heat_id for update;
  if not found or v_heat.scoring_format <> 'DRAG_TIMING' then raise exception 'Heat timing tidak ditemukan'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_heat.event_id::text || ':' || v_heat.category_id::text, 0));
  if v_heat.status = 'VOID' then raise exception 'Heat dibatalkan'; end if;
  if exists (select 1 from public.drag_final_results f where f.category_id = v_heat.category_id) then raise exception 'Hasil kategori sudah difinalisasi'; end if;
  select exists (
    select 1 from public.drag_heats other_run
    where other_run.event_id = v_heat.event_id and other_run.category_id = v_heat.category_id
      and other_run.round_number = v_heat.round_number and other_run.heat_number = v_heat.heat_number and other_run.id <> v_heat.id
  ) into v_legacy_time_trial;
  if v_legacy_time_trial and p_run_number <> v_heat.run_number then raise exception 'Nomor run tidak cocok dengan drawing lama'; end if;
  if not v_legacy_time_trial and v_heat.run_number <> 1 then raise exception 'Bracket timing tidak ditemukan'; end if;
  if p_rider_id is distinct from v_heat.lane_a_rider_id and p_rider_id is distinct from v_heat.lane_b_rider_id then
    raise exception 'Rider tidak terdaftar di heat ini';
  end if;
  if v_heat.status = 'COMPLETE' and not v_legacy_time_trial then raise exception 'Heat sudah selesai'; end if;
  if not v_legacy_time_trial and p_run_number > 2 and v_heat.outcome <> 'RERUN' then raise exception 'Run tambahan hanya dibuka untuk tie-break'; end if;
  if not v_legacy_time_trial and p_run_number > 3 then
    select count(*) into v_previous_run_count from public.drag_run_results r
    where r.heat_id = p_heat_id and r.run_number = p_run_number - 1 and r.result_status <> 'RERUN';
    if v_previous_run_count < 2 then raise exception 'Selesaikan kedua rider pada tie-break sebelumnya dahulu'; end if;
    select coalesce(max(r.run_number), 2) into v_max_run from public.drag_run_results r where r.heat_id = p_heat_id;
    if p_run_number > v_max_run + 1 then raise exception 'Selesaikan run tie-break sebelumnya dahulu'; end if;
  end if;

  v_lane := case when v_legacy_time_trial then
    case when p_rider_id = v_heat.lane_a_rider_id then 'A' else 'B' end
    else case
      when ((p_run_number % 2) = 1 and p_rider_id = v_heat.lane_a_rider_id) or ((p_run_number % 2) = 0 and p_rider_id = v_heat.lane_b_rider_id) then 'A'
      else 'B'
    end
  end;
  select to_jsonb(r) into v_before from public.drag_run_results r
  where r.heat_id = p_heat_id and r.rider_id = p_rider_id and r.run_number = p_run_number;
  if p_result_status = 'FINISH' then
    v_total := round((0.1 * p_reaction_time_seconds + 0.9 * p_elapsed_time_seconds + v_penalty)::numeric, 3);
  end if;

  insert into public.drag_run_results(
    event_id, category_id, heat_id, rider_id, run_number, lane, reaction_time_seconds, elapsed_time_seconds,
    jump_start, dns_called_twice, jump_penalty_seconds, total_seconds, result_status, note, recorded_by
  ) values (
    v_heat.event_id, v_heat.category_id, v_heat.id, p_rider_id, p_run_number, v_lane, p_reaction_time_seconds, p_elapsed_time_seconds,
    coalesce(p_jump_start, false), coalesce(p_dns_called_twice, false), v_penalty, v_total, p_result_status, nullif(trim(p_note), ''), p_actor_id
  ) on conflict (heat_id, rider_id, run_number) do update set
    lane = excluded.lane, reaction_time_seconds = excluded.reaction_time_seconds,
    elapsed_time_seconds = excluded.elapsed_time_seconds, jump_start = excluded.jump_start,
    dns_called_twice = excluded.dns_called_twice, jump_penalty_seconds = excluded.jump_penalty_seconds,
    total_seconds = excluded.total_seconds, result_status = excluded.result_status, note = excluded.note,
    recorded_by = excluded.recorded_by, recorded_at = now();

  insert into public.drag_result_audit(event_id, category_id, heat_id, rider_id, action, before_value, after_value, actor_id)
  values (
    v_heat.event_id, v_heat.category_id, v_heat.id, p_rider_id,
    case when v_before is null then 'TIMING_RESULT' else 'TIMING_RESULT_CORRECTION' end,
    v_before, jsonb_build_object('run_number', p_run_number, 'lane', v_lane, 'reaction_time_seconds', p_reaction_time_seconds,
      'elapsed_time_seconds', p_elapsed_time_seconds, 'jump_start', coalesce(p_jump_start, false),
      'jump_penalty_seconds', v_penalty, 'total_seconds', v_total, 'result_status', p_result_status,
      'dns_called_twice', coalesce(p_dns_called_twice, false), 'note', nullif(trim(p_note), '')),
    p_actor_id
  );

  if v_legacy_time_trial then
    select count(*) into v_completed_results from public.drag_run_results r
    where r.heat_id = p_heat_id and r.result_status <> 'RERUN';
    v_assigned_riders := (case when v_heat.lane_a_rider_id is null then 0 else 1 end)
      + (case when v_heat.lane_b_rider_id is null then 0 else 1 end);
    v_status := case when v_completed_results >= v_assigned_riders then 'COMPLETE' else 'LIVE' end;
    update public.drag_heats set status = v_status, updated_by = p_actor_id where id = p_heat_id;
  else
    update public.drag_heats set status = 'LIVE', updated_by = p_actor_id where id = p_heat_id;
    perform public.resolve_drag_timing_bracket_heat(p_heat_id, p_actor_id);
  end if;
  select h.status, h.winner_rider_id, h.outcome into v_status, v_heat.winner_rider_id, v_heat.outcome
  from public.drag_heats h where h.id = p_heat_id;
  return query select p_heat_id, p_run_number, v_total, v_status, v_heat.winner_rider_id, v_heat.outcome;
end;
$$;

revoke all on function public.save_drag_timing_match_run_result(uuid, smallint, uuid, text, numeric, numeric, boolean, boolean, uuid, text) from public;
grant execute on function public.save_drag_timing_match_run_result(uuid, smallint, uuid, text, numeric, numeric, boolean, boolean, uuid, text) to service_role;

-- Keep the original RPC signature operational for existing time-trial callers.
create or replace function public.save_drag_timing_run_result(
  p_heat_id uuid,
  p_rider_id uuid,
  p_result_status text,
  p_reaction_time_seconds numeric,
  p_elapsed_time_seconds numeric,
  p_jump_start boolean,
  p_dns_called_twice boolean,
  p_actor_id uuid,
  p_note text default null
)
returns table (heat_id uuid, total_seconds numeric, heat_status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_number smallint;
begin
  select h.run_number into v_run_number from public.drag_heats h where h.id = p_heat_id and h.scoring_format = 'DRAG_TIMING';
  if v_run_number is null then raise exception 'Timing heat not found'; end if;
  return query
  select result.heat_id, result.total_seconds, result.heat_status
  from public.save_drag_timing_match_run_result(
    p_heat_id, v_run_number, p_rider_id, p_result_status, p_reaction_time_seconds,
    p_elapsed_time_seconds, p_jump_start, p_dns_called_twice, p_actor_id, p_note
  ) result;
end;
$$;

revoke all on function public.save_drag_timing_run_result(uuid, uuid, text, numeric, numeric, boolean, boolean, uuid, text) from public;
grant execute on function public.save_drag_timing_run_result(uuid, uuid, text, numeric, numeric, boolean, boolean, uuid, text) to service_role;

comment on column public.drag_run_results.run_number is
  'Attempt number within a timed bracket heat: runs 1 and 2 swap lanes; run 3+ is used as a tie-break when required.';
comment on column public.drag_heats.run_number is
  'Timing bracket rows use 1 as the shared match marker; legacy time-trial drawings use separate heat rows marked 1 or 2.';

-- Finalize bracket timing placements by elimination round. Several riders may
-- share the same place (for example, all quarter-final losers are 5th).
create or replace function public.finalize_drag_category_results(
  p_event_id uuid,
  p_category_id uuid,
  p_scoring_format text,
  p_results jsonb,
  p_actor_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
  v_assigned_count integer;
  v_inserted integer;
  v_result_count integer;
  v_timing_bracket boolean := false;
begin
  if p_scoring_format not in ('DRAG_MANUAL', 'DRAG_TIMING') or jsonb_typeof(p_results) <> 'array' then
    raise exception 'Invalid Drag Race finalization payload';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || ':' || p_category_id::text, 0));
  select label into v_label from public.categories
  where id = p_category_id and event_id = p_event_id and enabled = true for update;
  if v_label is null then raise exception 'Enabled category not found'; end if;
  if exists (select 1 from public.drag_final_results where event_id = p_event_id and category_id = p_category_id) then
    select count(*) into v_inserted from public.drag_final_results where event_id = p_event_id and category_id = p_category_id;
    return v_inserted;
  end if;
  if not exists (select 1 from public.drag_heats where event_id = p_event_id and category_id = p_category_id and scoring_format = p_scoring_format) then
    raise exception 'Drag Race drawing not found';
  end if;
  if exists (
    select 1 from public.drag_heats
    where event_id = p_event_id and category_id = p_category_id and scoring_format = p_scoring_format and status <> 'COMPLETE'
  ) then raise exception 'All heats/runs must be complete before finalizing'; end if;

  v_timing_bracket := p_scoring_format = 'DRAG_TIMING' and not exists (
    select 1 from public.drag_heats
    where event_id = p_event_id and category_id = p_category_id and scoring_format = p_scoring_format and run_number <> 1
  );
  if v_timing_bracket and exists (
    select 1 from public.drag_heats
    where event_id = p_event_id and category_id = p_category_id and scoring_format = p_scoring_format
      and outcome <> 'BYE' and winner_rider_id is null
  ) then raise exception 'Every completed timing bracket heat must have an advancing rider'; end if;
  if v_timing_bracket and exists (
    select 1
    from public.drag_heats h
    cross join lateral (values (h.lane_a_rider_id), (h.lane_b_rider_id)) assigned(rider_id)
    left join public.drag_run_results r on r.heat_id = h.id and r.rider_id = assigned.rider_id and r.run_number in (1, 2)
    where h.event_id = p_event_id and h.category_id = p_category_id and h.scoring_format = p_scoring_format
      and h.outcome <> 'BYE' and assigned.rider_id is not null
    group by h.id, assigned.rider_id
    having count(distinct r.run_number) <> 2 or bool_or(r.result_status = 'RERUN')
  ) then raise exception 'Both timing runs must be recorded for each rider in every bracket heat'; end if;

  if p_scoring_format = 'DRAG_TIMING' and not v_timing_bracket and exists (
    select 1
    from (
      select assigned.rider_id
      from public.drag_heats h
      cross join lateral (values (h.lane_a_rider_id), (h.lane_b_rider_id)) assigned(rider_id)
      where h.event_id = p_event_id and h.category_id = p_category_id and h.scoring_format = p_scoring_format and assigned.rider_id is not null
      group by assigned.rider_id
    ) riders
    left join public.drag_run_results r on r.event_id = p_event_id and r.category_id = p_category_id and r.rider_id = riders.rider_id and r.run_number in (1, 2)
    group by riders.rider_id
    having count(distinct r.run_number) <> 2 or bool_or(r.result_status <> 'FINISH')
  ) then raise exception 'Each time-trial rider needs two FINISH results before finalizing'; end if;

  select count(distinct assigned.rider_id) into v_assigned_count
  from public.drag_heats h
  cross join lateral (values (h.lane_a_rider_id), (h.lane_b_rider_id)) assigned(rider_id)
  where h.event_id = p_event_id and h.category_id = p_category_id and h.scoring_format = p_scoring_format and assigned.rider_id is not null;
  select count(distinct result_row.rider_id), count(*) into v_result_count, v_inserted
  from jsonb_to_recordset(p_results) as result_row(rider_id uuid, position integer, total_seconds numeric);
  if v_assigned_count <> v_inserted or v_result_count <> v_inserted then
    raise exception 'Final ranking must contain every assigned rider exactly once';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_results) as result_row(rider_id uuid, position integer, total_seconds numeric)
    where result_row.position is null or result_row.position < 1 or not exists (
      select 1 from public.drag_heats h
      where h.event_id = p_event_id and h.category_id = p_category_id and h.scoring_format = p_scoring_format
        and (h.lane_a_rider_id = result_row.rider_id or h.lane_b_rider_id = result_row.rider_id)
    )
  ) then raise exception 'Final ranking contains invalid riders or positions'; end if;
  if p_scoring_format = 'DRAG_TIMING' and exists (
    select 1 from jsonb_to_recordset(p_results) as result_row(rider_id uuid, position integer, total_seconds numeric)
    having (not v_timing_bracket and count(distinct result_row.position) <> count(*))
      or (not v_timing_bracket and count(*) filter (where result_row.total_seconds is null) > 0)
      or max(result_row.position) > v_assigned_count
  ) then raise exception 'Invalid timed final ranking'; end if;

  insert into public.drag_final_results(event_id, category_id, rider_id, scoring_format, position, final_class, total_seconds, finalized_by)
  select p_event_id, p_category_id, result_row.rider_id, p_scoring_format, result_row.position, v_label, result_row.total_seconds, p_actor_id
  from jsonb_to_recordset(p_results) as result_row(rider_id uuid, position integer, total_seconds numeric);
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.finalize_drag_category_results(uuid, uuid, text, jsonb, uuid) from public;
grant execute on function public.finalize_drag_category_results(uuid, uuid, text, jsonb, uuid) to service_role;

commit;

-- Rollback requires removing timing bracket drawings/results first. Restore
-- finalize_drag_category_results and save_drag_timing_run_result from the
-- 2026-11-26 base migration before use.
-- begin;
-- drop function if exists public.reset_drag_timing_bracket_heat(uuid, uuid, text);
-- drop function if exists public.save_drag_timing_match_run_result(uuid, smallint, uuid, text, numeric, numeric, boolean, boolean, uuid, text);
-- drop function if exists public.resolve_drag_timing_bracket_heat(uuid, uuid);
-- alter table public.drag_run_results drop constraint if exists uq_drag_run_results_heat_rider_run, drop constraint if exists ck_drag_run_results_run_number_positive;
-- alter table public.drag_run_results add constraint uq_drag_run_results_heat_rider unique (heat_id, rider_id);
-- alter table public.drag_run_results add constraint drag_run_results_run_number_check check (run_number in (1, 2));
-- drop index if exists public.uq_drag_heats_timing_round_run_heat;
-- create unique index uq_drag_heats_timing_run_heat on public.drag_heats(event_id, category_id, run_number, heat_number) where scoring_format = 'DRAG_TIMING';
-- commit;
