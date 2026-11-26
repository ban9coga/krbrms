begin;

-- Existing categories inherit the event scoring format. The default remains
-- Moto points, so this migration does not change existing event behavior.
alter table public.categories
  add column if not exists scoring_format_override text;

alter table public.categories
  drop constraint if exists ck_categories_scoring_format_override;
alter table public.categories
  add constraint ck_categories_scoring_format_override
  check (
    scoring_format_override is null
    or scoring_format_override in ('MOTO_POINTS', 'DRAG_MANUAL', 'DRAG_TIMING')
  );

comment on column public.categories.scoring_format_override is
  'Optional per-category scoring format override. Null inherits event_settings.race_format_settings.scoring_format; legacy events resolve to MOTO_POINTS.';

create table if not exists public.drag_heats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  scoring_format text not null check (scoring_format in ('DRAG_MANUAL', 'DRAG_TIMING')),
  round_number integer not null check (round_number > 0),
  round_label text not null,
  heat_number integer not null check (heat_number > 0),
  run_number smallint,
  lane_a_rider_id uuid references public.riders(id) on delete restrict,
  lane_b_rider_id uuid references public.riders(id) on delete restrict,
  winner_rider_id uuid references public.riders(id) on delete restrict,
  outcome text not null default 'PENDING'
    check (outcome in ('PENDING', 'BYE', 'FINISH', 'DNS_ADVANCE', 'DNF_ADVANCE', 'DSQ_ADVANCE', 'RERUN')),
  status text not null default 'UPCOMING'
    check (status in ('UPCOMING', 'LIVE', 'COMPLETE', 'VOID')),
  next_heat_id uuid references public.drag_heats(id) on delete set null,
  next_slot text check (next_slot is null or next_slot in ('A', 'B')),
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_drag_heats_run_number check (
    (scoring_format = 'DRAG_MANUAL' and run_number is null)
    or (scoring_format = 'DRAG_TIMING' and run_number in (1, 2))
  ),
  constraint ck_drag_heats_distinct_riders check (
    lane_a_rider_id is null or lane_b_rider_id is null or lane_a_rider_id <> lane_b_rider_id
  ),
  constraint ck_drag_heats_winner_is_assigned check (
    winner_rider_id is null
    or winner_rider_id is not distinct from lane_a_rider_id
    or winner_rider_id is not distinct from lane_b_rider_id
  ),
  constraint ck_drag_heats_next_slot_pair check (
    (next_heat_id is null and next_slot is null) or (next_heat_id is not null and next_slot is not null)
  )
);

create unique index if not exists uq_drag_heats_manual_round_heat
  on public.drag_heats(event_id, category_id, round_number, heat_number)
  where scoring_format = 'DRAG_MANUAL';
create unique index if not exists uq_drag_heats_timing_run_heat
  on public.drag_heats(event_id, category_id, run_number, heat_number)
  where scoring_format = 'DRAG_TIMING';
create index if not exists idx_drag_heats_event_category_status
  on public.drag_heats(event_id, category_id, status, round_number, heat_number);
create index if not exists idx_drag_heats_next_heat
  on public.drag_heats(next_heat_id)
  where next_heat_id is not null;

create table if not exists public.drag_run_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  heat_id uuid not null references public.drag_heats(id) on delete cascade,
  rider_id uuid not null references public.riders(id) on delete restrict,
  run_number smallint not null check (run_number in (1, 2)),
  lane text not null check (lane in ('A', 'B')),
  reaction_time_seconds numeric(9, 3),
  elapsed_time_seconds numeric(9, 3),
  jump_start boolean not null default false,
  dns_called_twice boolean not null default false,
  jump_penalty_seconds numeric(7, 3) not null default 0,
  total_seconds numeric(10, 3),
  result_status text not null check (result_status in ('FINISH', 'DNS', 'DNF', 'DSQ', 'RERUN')),
  note text,
  recorded_by uuid,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_drag_run_results_heat_rider unique (heat_id, rider_id),
  constraint ck_drag_run_results_finish_values check (
    result_status <> 'FINISH'
    or (reaction_time_seconds is not null and elapsed_time_seconds is not null and elapsed_time_seconds >= 0 and total_seconds is not null)
  ),
  constraint ck_drag_run_results_penalty_nonnegative check (jump_penalty_seconds >= 0)
);

create index if not exists idx_drag_run_results_event_category_run
  on public.drag_run_results(event_id, category_id, run_number, rider_id);
create index if not exists idx_drag_run_results_heat
  on public.drag_run_results(heat_id, rider_id);

create table if not exists public.drag_result_audit (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  heat_id uuid not null references public.drag_heats(id) on delete cascade,
  rider_id uuid references public.riders(id) on delete set null,
  action text not null,
  before_value jsonb,
  after_value jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.drag_final_results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  rider_id uuid not null references public.riders(id) on delete restrict,
  scoring_format text not null check (scoring_format in ('DRAG_MANUAL', 'DRAG_TIMING')),
  position integer not null check (position > 0),
  final_class text not null,
  total_seconds numeric(10, 3),
  finalized_by uuid,
  finalized_at timestamptz not null default now(),
  constraint uq_drag_final_results_category_rider unique (category_id, rider_id)
);

create index if not exists idx_drag_final_results_event_category_position
  on public.drag_final_results(event_id, category_id, position);

create index if not exists idx_drag_result_audit_heat_created
  on public.drag_result_audit(heat_id, created_at desc);

-- Writes use the server-side service role only. Browser reads also go through
-- compact API responses so public clients cannot access raw staff/audit fields.
alter table public.drag_heats enable row level security;
alter table public.drag_run_results enable row level security;
alter table public.drag_result_audit enable row level security;
alter table public.drag_final_results enable row level security;
revoke all on public.drag_heats, public.drag_run_results, public.drag_result_audit, public.drag_final_results from anon, authenticated;
grant all on public.drag_heats, public.drag_run_results, public.drag_result_audit, public.drag_final_results to service_role;

drop trigger if exists trg_drag_heats_updated_at on public.drag_heats;
create trigger trg_drag_heats_updated_at
before update on public.drag_heats
for each row execute function public.set_updated_at();

drop trigger if exists trg_drag_run_results_updated_at on public.drag_run_results;
create trigger trg_drag_run_results_updated_at
before update on public.drag_run_results
for each row execute function public.set_updated_at();

create or replace function public.record_drag_manual_heat_result(
  p_heat_id uuid,
  p_winner_rider_id uuid,
  p_outcome text,
  p_actor_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_heat public.drag_heats%rowtype;
  v_next public.drag_heats%rowtype;
  v_before jsonb;
  v_slot_rider_id uuid;
  v_event_id uuid;
  v_category_id uuid;
begin
  if p_outcome not in ('FINISH', 'DNS_ADVANCE', 'DNF_ADVANCE', 'DSQ_ADVANCE') then
    raise exception 'Invalid manual heat outcome';
  end if;

  select heat.event_id, heat.category_id into v_event_id, v_category_id
  from public.drag_heats heat
  where id = p_heat_id and scoring_format = 'DRAG_MANUAL';
  if not found then raise exception 'Manual drag heat not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_event_id::text || ':' || v_category_id::text, 0));
  select * into v_heat
  from public.drag_heats
  where id = p_heat_id and scoring_format = 'DRAG_MANUAL'
  for update;
  if not found then raise exception 'Manual drag heat not found'; end if;
  if exists (select 1 from public.drag_final_results where category_id = v_heat.category_id) then
    raise exception 'Drag Race category is finalized; result corrections are blocked';
  end if;
  if p_winner_rider_id is null or (
    p_winner_rider_id is distinct from v_heat.lane_a_rider_id
    and p_winner_rider_id is distinct from v_heat.lane_b_rider_id
  ) then
    raise exception 'Winner must be one of the riders assigned to this heat';
  end if;
  if v_heat.status = 'VOID' then raise exception 'Heat is void'; end if;
  if v_heat.status = 'COMPLETE' then
    if v_heat.winner_rider_id = p_winner_rider_id and v_heat.outcome = p_outcome then return v_heat.id; end if;
    raise exception 'Heat already has a result';
  end if;

  v_before := jsonb_build_object('status', v_heat.status, 'winner_rider_id', v_heat.winner_rider_id, 'outcome', v_heat.outcome);
  update public.drag_heats
  set winner_rider_id = p_winner_rider_id,
      outcome = p_outcome,
      status = 'COMPLETE',
      updated_by = p_actor_id
  where id = v_heat.id;

  insert into public.drag_result_audit(event_id, category_id, heat_id, rider_id, action, before_value, after_value, actor_id)
  values (
    v_heat.event_id, v_heat.category_id, v_heat.id, p_winner_rider_id, 'MANUAL_RESULT', v_before,
    jsonb_build_object('winner_rider_id', p_winner_rider_id, 'outcome', p_outcome, 'note', nullif(trim(p_note), '')),
    p_actor_id
  );

  if v_heat.next_heat_id is not null then
    select * into v_next from public.drag_heats where id = v_heat.next_heat_id for update;
    if not found then raise exception 'Next heat not found'; end if;
    v_slot_rider_id := case when v_heat.next_slot = 'A' then v_next.lane_a_rider_id else v_next.lane_b_rider_id end;
    if v_slot_rider_id is not null and v_slot_rider_id <> p_winner_rider_id then
      raise exception 'Next heat slot is already assigned to another rider';
    end if;
    if v_heat.next_slot = 'A' then
      update public.drag_heats set lane_a_rider_id = p_winner_rider_id where id = v_next.id;
    else
      update public.drag_heats set lane_b_rider_id = p_winner_rider_id where id = v_next.id;
    end if;
  end if;

  return v_heat.id;
end;
$$;

revoke all on function public.record_drag_manual_heat_result(uuid, uuid, text, uuid, text) from public;
grant execute on function public.record_drag_manual_heat_result(uuid, uuid, text, uuid, text) to service_role;

-- Admin corrections are audited and invalidate downstream winners that were
-- decided against the superseded rider, so bracket advancement stays valid.
create or replace function public.correct_drag_manual_heat_result(
  p_heat_id uuid,
  p_winner_rider_id uuid,
  p_outcome text,
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
  v_advanced_old_id uuid;
  v_advanced_new_id uuid;
  v_next_old_winner_id uuid;
  v_before jsonb;
  v_invalidated integer := 0;
begin
  if p_outcome not in ('FINISH', 'DNS_ADVANCE', 'DNF_ADVANCE', 'DSQ_ADVANCE') then
    raise exception 'Invalid manual heat outcome';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Correction reason is required';
  end if;

  select heat.event_id, heat.category_id into v_event_id, v_category_id
  from public.drag_heats heat
  where heat.id = p_heat_id and heat.scoring_format = 'DRAG_MANUAL';
  if not found then raise exception 'Manual drag heat not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_event_id::text || ':' || v_category_id::text, 0));
  select * into v_heat
  from public.drag_heats
  where id = p_heat_id and scoring_format = 'DRAG_MANUAL'
  for update;
  if not found then raise exception 'Manual drag heat not found'; end if;
  if exists (select 1 from public.drag_final_results where category_id = v_heat.category_id) then
    raise exception 'Drag Race category is finalized; result corrections are blocked';
  end if;
  if v_heat.status <> 'COMPLETE' or v_heat.outcome = 'BYE' or v_heat.winner_rider_id is null then
    raise exception 'Only a completed rider heat can be corrected';
  end if;
  if p_winner_rider_id is null or (
    p_winner_rider_id is distinct from v_heat.lane_a_rider_id
    and p_winner_rider_id is distinct from v_heat.lane_b_rider_id
  ) then
    raise exception 'Corrected winner must be one of the riders assigned to this heat';
  end if;
  if p_winner_rider_id = v_heat.winner_rider_id and p_outcome = v_heat.outcome then
    raise exception 'The selected result is unchanged';
  end if;

  v_old_winner_id := v_heat.winner_rider_id;
  v_before := jsonb_build_object('winner_rider_id', v_heat.winner_rider_id, 'outcome', v_heat.outcome, 'status', v_heat.status);
  update public.drag_heats
  set winner_rider_id = p_winner_rider_id, outcome = p_outcome, updated_by = p_actor_id
  where id = v_heat.id;
  insert into public.drag_result_audit(event_id, category_id, heat_id, rider_id, action, before_value, after_value, actor_id)
  values (
    v_heat.event_id, v_heat.category_id, v_heat.id, p_winner_rider_id, 'MANUAL_RESULT_CORRECTION', v_before,
    jsonb_build_object('winner_rider_id', p_winner_rider_id, 'outcome', p_outcome, 'reason', trim(p_reason)), p_actor_id
  );

  if p_winner_rider_id = v_old_winner_id then return 0; end if;
  v_source := v_heat;
  v_advanced_old_id := v_old_winner_id;
  v_advanced_new_id := p_winner_rider_id;
  while v_source.next_heat_id is not null loop
    select * into v_next
    from public.drag_heats
    where id = v_source.next_heat_id
      and event_id = v_event_id
      and category_id = v_category_id
      and scoring_format = 'DRAG_MANUAL'
    for update;
    if not found then raise exception 'Downstream heat not found in this category'; end if;

    if v_source.next_slot = 'A' then
      if v_next.lane_a_rider_id is distinct from v_advanced_old_id then
        raise exception 'Downstream slot does not match the previous winner';
      end if;
      update public.drag_heats set lane_a_rider_id = v_advanced_new_id, updated_by = p_actor_id where id = v_next.id;
    elsif v_source.next_slot = 'B' then
      if v_next.lane_b_rider_id is distinct from v_advanced_old_id then
        raise exception 'Downstream slot does not match the previous winner';
      end if;
      update public.drag_heats set lane_b_rider_id = v_advanced_new_id, updated_by = p_actor_id where id = v_next.id;
    else
      raise exception 'Downstream slot is not configured';
    end if;

    if v_next.winner_rider_id is null then exit; end if;
    v_next_old_winner_id := v_next.winner_rider_id;
    insert into public.drag_result_audit(event_id, category_id, heat_id, rider_id, action, before_value, after_value, actor_id)
    values (
      v_next.event_id, v_next.category_id, v_next.id, v_next_old_winner_id, 'DOWNSTREAM_RESULT_INVALIDATED',
      jsonb_build_object('winner_rider_id', v_next.winner_rider_id, 'outcome', v_next.outcome, 'status', v_next.status),
      jsonb_build_object('winner_rider_id', null, 'outcome', 'PENDING', 'status', 'UPCOMING', 'reason', trim(p_reason)), p_actor_id
    );
    update public.drag_heats
    set winner_rider_id = null, outcome = 'PENDING', status = 'UPCOMING', updated_by = p_actor_id
    where id = v_next.id;
    v_invalidated := v_invalidated + 1;
    v_source := v_next;
    v_advanced_old_id := v_next_old_winner_id;
    v_advanced_new_id := null;
  end loop;

  return v_invalidated;
end;
$$;

revoke all on function public.correct_drag_manual_heat_result(uuid, uuid, text, uuid, text) from public;
grant execute on function public.correct_drag_manual_heat_result(uuid, uuid, text, uuid, text) to service_role;

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
  v_heat public.drag_heats%rowtype;
  v_lane text;
  v_before jsonb;
  v_total numeric(10,3);
  v_penalty numeric(7,3) := case when coalesce(p_jump_start, false) then 3 else 0 end;
  v_status text;
  v_event_id uuid;
  v_category_id uuid;
begin
  if p_result_status not in ('FINISH', 'DNS', 'DNF', 'DSQ', 'RERUN') then
    raise exception 'Invalid timing result status';
  end if;
  if p_result_status = 'FINISH' and (
    p_reaction_time_seconds is null or p_elapsed_time_seconds is null or p_elapsed_time_seconds < 0
  ) then raise exception 'RT and ET are required for a finished run'; end if;
  if p_result_status = 'DSQ' and nullif(trim(p_note), '') is null then
    raise exception 'DSQ requires a reason';
  end if;
  if p_result_status = 'DNS' and not coalesce(p_dns_called_twice, false) then
    raise exception 'DNS is recorded only after the rider has been called twice';
  end if;

  select heat.event_id, heat.category_id into v_event_id, v_category_id
  from public.drag_heats heat
  where id = p_heat_id and scoring_format = 'DRAG_TIMING';
  if not found then raise exception 'Timing heat not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_event_id::text || ':' || v_category_id::text, 0));
  select * into v_heat
  from public.drag_heats
  where id = p_heat_id and scoring_format = 'DRAG_TIMING'
  for update;
  if not found then raise exception 'Timing heat not found'; end if;
  if exists (select 1 from public.drag_final_results where category_id = v_heat.category_id) then
    raise exception 'Drag Race category is finalized; result corrections are blocked';
  end if;
  if v_heat.status = 'VOID' then raise exception 'Heat is void'; end if;

  v_lane := case
    when v_heat.lane_a_rider_id = p_rider_id then 'A'
    when v_heat.lane_b_rider_id = p_rider_id then 'B'
    else null
  end;
  if v_lane is null then raise exception 'Rider is not assigned to this heat'; end if;

  select to_jsonb(result_row) into v_before
  from public.drag_run_results result_row
  where result_row.heat_id = p_heat_id and result_row.rider_id = p_rider_id;

  if p_result_status = 'FINISH' then
    v_total := round((0.1 * p_reaction_time_seconds + 0.9 * p_elapsed_time_seconds + v_penalty)::numeric, 3);
  else
    v_total := null;
  end if;

  insert into public.drag_run_results(
    event_id, category_id, heat_id, rider_id, run_number, lane,
    reaction_time_seconds, elapsed_time_seconds, jump_start, dns_called_twice, jump_penalty_seconds,
    total_seconds, result_status, note, recorded_by
  ) values (
    v_heat.event_id, v_heat.category_id, v_heat.id, p_rider_id, v_heat.run_number, v_lane,
    p_reaction_time_seconds, p_elapsed_time_seconds, coalesce(p_jump_start, false), coalesce(p_dns_called_twice, false), v_penalty,
    v_total, p_result_status, nullif(trim(p_note), ''), p_actor_id
  )
  on conflict (heat_id, rider_id) do update set
    reaction_time_seconds = excluded.reaction_time_seconds,
    elapsed_time_seconds = excluded.elapsed_time_seconds,
    jump_start = excluded.jump_start,
    dns_called_twice = excluded.dns_called_twice,
    jump_penalty_seconds = excluded.jump_penalty_seconds,
    total_seconds = excluded.total_seconds,
    result_status = excluded.result_status,
    note = excluded.note,
    recorded_by = excluded.recorded_by,
    recorded_at = now();

  insert into public.drag_result_audit(event_id, category_id, heat_id, rider_id, action, before_value, after_value, actor_id)
  values (
    v_heat.event_id, v_heat.category_id, v_heat.id, p_rider_id,
    case when v_before is null then 'TIMING_RESULT' else 'TIMING_RESULT_CORRECTION' end,
    v_before,
    jsonb_build_object(
      'run_number', v_heat.run_number, 'lane', v_lane, 'reaction_time_seconds', p_reaction_time_seconds,
      'elapsed_time_seconds', p_elapsed_time_seconds, 'jump_start', coalesce(p_jump_start, false),
      'dns_called_twice', coalesce(p_dns_called_twice, false),
      'jump_penalty_seconds', v_penalty, 'total_seconds', v_total, 'result_status', p_result_status,
      'note', nullif(trim(p_note), '')
    ),
    p_actor_id
  );

  if exists (
    select 1 from public.drag_heats heat
    join public.drag_run_results result_row on result_row.heat_id = heat.id
    where heat.id = v_heat.id and heat.lane_a_rider_id is not null and heat.lane_b_rider_id is not null
      and result_row.result_status = 'RERUN'
  ) or exists (
    select 1 from public.drag_run_results result_row
    where result_row.heat_id = v_heat.id and result_row.result_status = 'RERUN'
  ) then
    v_status := 'LIVE';
  elsif (
    select count(*)
    from public.drag_run_results result_row
    where result_row.heat_id = v_heat.id and result_row.result_status <> 'RERUN'
  ) >= ((case when v_heat.lane_a_rider_id is null then 0 else 1 end) + (case when v_heat.lane_b_rider_id is null then 0 else 1 end)) then
    v_status := 'COMPLETE';
  else
    v_status := 'LIVE';
  end if;

  update public.drag_heats set status = v_status, updated_by = p_actor_id where id = v_heat.id;
  return query select v_heat.id, v_total, v_status;
end;
$$;

revoke all on function public.save_drag_timing_run_result(uuid, uuid, text, numeric, numeric, boolean, boolean, uuid, text) from public;
grant execute on function public.save_drag_timing_run_result(uuid, uuid, text, numeric, numeric, boolean, boolean, uuid, text) to service_role;

comment on table public.drag_heats is
  'Separate heat/bracket storage for drag formats. Moto events continue using motos and results.';
comment on table public.drag_run_results is
  'Per-rider timing result for one drag run. Stored total applies 10% RT + 90% ET and the documented 3 second jump-start penalty.';
comment on table public.drag_result_audit is
  'Audit trail for Drag Race winner decisions and timing result edits.';
comment on table public.drag_final_results is
  'Finalized Drag Race placements consumed by public result and e-certificate features.';

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
begin
  if p_scoring_format not in ('DRAG_MANUAL', 'DRAG_TIMING') or jsonb_typeof(p_results) <> 'array' then
    raise exception 'Invalid Drag Race finalization payload';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_event_id::text || ':' || p_category_id::text, 0));
  select label into v_label from public.categories where id = p_category_id and event_id = p_event_id and enabled = true for update;
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

  if p_scoring_format = 'DRAG_TIMING' and exists (
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
  ) then raise exception 'Each timing rider needs two FINISH results before finalizing'; end if;

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
    select 1
    from jsonb_to_recordset(p_results) as result_row(rider_id uuid, position integer, total_seconds numeric)
    having count(distinct result_row.position) <> count(*)
      or count(*) filter (where result_row.total_seconds is null) > 0
      or max(result_row.position) > v_assigned_count
  ) then raise exception 'Timed ranking needs a unique position and total time for every rider'; end if;

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

-- Rollback only after Drag Race data has been exported or intentionally discarded:
-- begin;
-- drop function if exists public.finalize_drag_category_results(uuid, uuid, text, jsonb, uuid);
-- drop function if exists public.save_drag_timing_run_result(uuid, uuid, text, numeric, numeric, boolean, boolean, uuid, text);
-- drop function if exists public.correct_drag_manual_heat_result(uuid, uuid, text, uuid, text);
-- drop function if exists public.record_drag_manual_heat_result(uuid, uuid, text, uuid, text);
-- drop table if exists public.drag_result_audit;
-- drop table if exists public.drag_final_results;
-- drop table if exists public.drag_run_results;
-- drop table if exists public.drag_heats;
-- alter table public.categories drop constraint if exists ck_categories_scoring_format_override;
-- alter table public.categories drop column if exists scoring_format_override;
-- commit;
