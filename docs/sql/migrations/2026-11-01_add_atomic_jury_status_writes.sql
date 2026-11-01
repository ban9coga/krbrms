-- Make Checker READY/ABSENT/DNS writes and undo operations atomic. Apply this
-- migration before deploying the API route that calls these RPCs.

create or replace function public.set_jury_rider_statuses(
  p_event_id uuid,
  p_moto_id uuid,
  p_changes jsonb,
  p_actor_id text,
  p_actor_role text,
  p_actor_label text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moto public.motos%rowtype;
  v_note text;
  v_data jsonb;
  v_should_broadcast boolean := false;
  v_deleted_dns_count integer := 0;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception using errcode = '22023', message = 'At least one rider status change is required.';
  end if;
  if jsonb_array_length(p_changes) = 0 then
    raise exception using errcode = '22023', message = 'At least one rider status change is required.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_changes) as change_row(
      rider_id uuid,
      participation_status text,
      registration_order integer
    )
    where change_row.rider_id is null
      or change_row.participation_status is null
      or change_row.participation_status not in ('ACTIVE', 'DNS', 'ABSENT')
      or change_row.registration_order is null
  ) then
    raise exception using errcode = '22023', message = 'Invalid rider status change payload.';
  end if;

  if (
    select count(*) <> count(distinct change_row.rider_id)
    from jsonb_to_recordset(p_changes) as change_row(rider_id uuid)
  ) then
    raise exception using errcode = '22023', message = 'A rider can only appear once per status update.';
  end if;

  select * into v_moto
  from public.motos
  where id = p_moto_id
  for update;

  if not found or v_moto.event_id <> p_event_id then
    raise exception using errcode = 'P0002', message = 'Moto not found in event.';
  end if;

  if exists (
    select 1 from public.moto_locks
    where moto_id = p_moto_id and event_id = p_event_id and is_locked = true
  ) then
    raise exception using errcode = '55000', message = 'Moto already locked. No modification allowed.';
  end if;

  if upper(coalesce(v_moto.status::text, '')) = 'PROTEST_REVIEW' then
    raise exception using errcode = '55000', message = 'Moto under protest review. Modifications are frozen.';
  end if;

  if upper(coalesce(v_moto.status::text, '')) not in ('UPCOMING', 'READY', 'LIVE') then
    raise exception using errcode = '55000', message = 'Jury hanya bisa mengubah status saat moto UPCOMING, READY, atau LIVE.';
  end if;

  if upper(coalesce(v_moto.status::text, '')) <> 'LIVE' and exists (
    select 1
    from jsonb_to_recordset(p_changes) as change_row(
      rider_id uuid,
      participation_status text
    )
    where change_row.participation_status = 'DNS'
  ) then
    raise exception using errcode = '55000', message = 'DNS baru bisa dipakai saat moto sudah LIVE.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_changes) as change_row(rider_id uuid)
    left join public.moto_riders mr on mr.moto_id = p_moto_id and mr.rider_id = change_row.rider_id
    where mr.rider_id is null
  ) then
    raise exception using errcode = '23514', message = 'Rider tidak terdaftar pada moto ini.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_changes) as change_row(rider_id uuid)
    join public.results r on r.moto_id = p_moto_id
      and r.rider_id = change_row.rider_id
      and r.result_status = 'DQ'
  ) then
    raise exception using errcode = '23514', message = 'Rider DQ tidak dapat diubah statusnya. Batalkan DQ melalui Race Director bila diperlukan.';
  end if;

  v_note := '[RACEPUSHBIKE_STATUS_SOURCE]' || jsonb_build_object(
    'role', coalesce(nullif(trim(p_actor_role), ''), 'JURY'),
    'label', coalesce(nullif(trim(p_actor_label), ''), 'Jury')
  )::text;

  with inserted as (
    insert into public.rider_status_updates (
      event_id, moto_id, rider_id, proposed_status, created_by,
      approval_status, approved_by, approved_at, note
    )
    select
      p_event_id,
      p_moto_id,
      change_row.rider_id,
      change_row.participation_status::public.participation_status,
      p_actor_id,
      'APPROVED',
      'SYSTEM',
      now(),
      v_note
    from jsonb_to_recordset(p_changes) as change_row(
      rider_id uuid,
      participation_status text,
      registration_order integer
    )
    returning id, event_id, rider_id, proposed_status, approval_status
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', inserted.id,
    'event_id', inserted.event_id,
    'rider_id', inserted.rider_id,
    'proposed_status', inserted.proposed_status,
    'approval_status', inserted.approval_status
  )), '[]'::jsonb)
  into v_data
  from inserted;

  insert into public.rider_participation_status (
    event_id, moto_id, rider_id, participation_status, registration_order
  )
  select
    p_event_id,
    p_moto_id,
    change_row.rider_id,
    change_row.participation_status::public.participation_status,
    change_row.registration_order
  from jsonb_to_recordset(p_changes) as change_row(
    rider_id uuid,
    participation_status text,
    registration_order integer
  )
  on conflict (event_id, moto_id, rider_id) do update
  set participation_status = excluded.participation_status,
      registration_order = excluded.registration_order;

  delete from public.results r
  using jsonb_to_recordset(p_changes) as change_row(rider_id uuid, participation_status text)
  where r.event_id = p_event_id
    and r.moto_id = p_moto_id
    and r.rider_id = change_row.rider_id
    and r.result_status = 'DNS'
    and change_row.participation_status = 'ACTIVE';
  get diagnostics v_deleted_dns_count = row_count;

  insert into public.results (event_id, moto_id, rider_id, finish_order, result_status)
  select
    p_event_id,
    p_moto_id,
    change_row.rider_id,
    null,
    'DNS'
  from jsonb_to_recordset(p_changes) as change_row(rider_id uuid, participation_status text)
  where change_row.participation_status in ('DNS', 'ABSENT')
  on conflict (moto_id, rider_id) do update
  set finish_order = null,
      result_status = excluded.result_status;

  insert into public.audit_log (action_type, performed_by, rider_id, moto_id, event_id, reason)
  select
    'STATUS_APPROVAL',
    'SYSTEM',
    change_row.rider_id,
    p_moto_id,
    p_event_id,
    case change_row.participation_status
      when 'ACTIVE' then 'ACTIVE status auto-applied'
      when 'ABSENT' then 'ABSENT status applied with DNS scoring'
      else 'AUTO mode: status applied'
    end
  from jsonb_to_recordset(p_changes) as change_row(rider_id uuid, participation_status text);

  select exists (
    select 1 from jsonb_to_recordset(p_changes) as change_row(participation_status text)
    where change_row.participation_status in ('DNS', 'ABSENT')
  ) or v_deleted_dns_count > 0
  into v_should_broadcast;

  return jsonb_build_object(
    'data', v_data,
    'category_id', v_moto.category_id,
    'should_broadcast', v_should_broadcast
  );
end;
$$;

revoke all on function public.set_jury_rider_statuses(uuid, uuid, jsonb, text, text, text) from public;
grant execute on function public.set_jury_rider_statuses(uuid, uuid, jsonb, text, text, text) to service_role;

create or replace function public.clear_jury_rider_status(
  p_event_id uuid,
  p_moto_id uuid,
  p_rider_id uuid,
  p_actor_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moto public.motos%rowtype;
  v_deleted_dns_count integer := 0;
begin
  select * into v_moto
  from public.motos
  where id = p_moto_id
  for update;

  if not found or v_moto.event_id <> p_event_id then
    raise exception using errcode = 'P0002', message = 'Moto not found in event.';
  end if;

  if exists (
    select 1 from public.moto_locks
    where moto_id = p_moto_id and event_id = p_event_id and is_locked = true
  ) then
    raise exception using errcode = '55000', message = 'Moto already locked. No modification allowed.';
  end if;

  if upper(coalesce(v_moto.status::text, '')) = 'PROTEST_REVIEW' then
    raise exception using errcode = '55000', message = 'Moto under protest review. Modifications are frozen.';
  end if;

  if upper(coalesce(v_moto.status::text, '')) not in ('UPCOMING', 'READY', 'LIVE') then
    raise exception using errcode = '55000', message = 'Jury hanya bisa undo status saat moto masih UPCOMING, READY, atau LIVE.';
  end if;

  delete from public.rider_status_updates
  where event_id = p_event_id and moto_id = p_moto_id and rider_id = p_rider_id;

  delete from public.rider_participation_status
  where event_id = p_event_id and moto_id = p_moto_id and rider_id = p_rider_id;

  delete from public.results
  where event_id = p_event_id
    and moto_id = p_moto_id
    and rider_id = p_rider_id
    and result_status = 'DNS';
  get diagnostics v_deleted_dns_count = row_count;

  insert into public.audit_log (action_type, performed_by, rider_id, moto_id, event_id, reason)
  values ('STATUS_APPROVAL', p_actor_id, p_rider_id, p_moto_id, p_event_id, 'Undo checker status');

  return jsonb_build_object(
    'category_id', v_moto.category_id,
    'dns_deleted_count', v_deleted_dns_count
  );
end;
$$;

revoke all on function public.clear_jury_rider_status(uuid, uuid, uuid, text) from public;
grant execute on function public.clear_jury_rider_status(uuid, uuid, uuid, text) to service_role;

-- Rollback:
-- drop function if exists public.clear_jury_rider_status(uuid, uuid, uuid, text);
-- drop function if exists public.set_jury_rider_statuses(uuid, uuid, jsonb, text, text, text);
