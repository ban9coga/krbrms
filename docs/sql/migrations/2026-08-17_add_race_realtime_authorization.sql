-- Private Realtime channels for race crew.
-- Channel format: race:event:<event UUID>
-- Run this before enabling the client-side Realtime subscriptions.

create or replace function public.can_access_race_realtime_topic(topic text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  topic_event_id uuid;
  jwt_role text;
begin
  if topic !~ '^race:event:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;

  topic_event_id := split_part(topic, ':', 3)::uuid;
  jwt_role := upper(coalesce(
    auth.jwt() -> 'user_metadata' ->> 'role',
    auth.jwt() -> 'app_metadata' ->> 'role',
    ''
  ));

  -- Central admins retain access; all crew access is scoped to an assigned event.
  if jwt_role in ('SUPER_ADMIN', 'ADMIN') then
    return true;
  end if;

  return exists (
    select 1
    from public.user_event_roles uer
    where uer.user_id = auth.uid()
      and uer.event_id = topic_event_id
      and uer.is_active = true
  );
end;
$$;

revoke all on function public.can_access_race_realtime_topic(text) from public;
grant execute on function public.can_access_race_realtime_topic(text) to authenticated;

drop policy if exists "race crew can receive event broadcasts" on realtime.messages;

create policy "race crew can receive event broadcasts"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and public.can_access_race_realtime_topic(realtime.topic())
);

comment on function public.can_access_race_realtime_topic(text) is
  'Allows authenticated central admins or active event-scoped crew to receive private Realtime broadcasts for race:event:<event_id>.';

-- Supabase Dashboard action required once per project:
-- Realtime > Settings > disable "Allow public access" before deploying clients
-- that subscribe with config: { private: true }.

-- Race-state signals are deliberately tiny. Clients receive a signal, then refetch
-- their existing protected endpoint instead of receiving full rider/result rows.
create or replace function public.broadcast_race_state_change()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
declare
  changed_row jsonb;
  changed_event_id uuid;
  changed_moto_id uuid;
begin
  if TG_OP = 'DELETE' then
    changed_row := to_jsonb(OLD);
  else
    changed_row := to_jsonb(NEW);
  end if;

  changed_event_id := nullif(changed_row ->> 'event_id', '')::uuid;
  changed_moto_id := nullif(changed_row ->> 'moto_id', '')::uuid;

  -- Every table below is event-scoped. Do not create a broadcast for malformed
  -- legacy rows because there is no safe event topic to publish it to.
  if changed_event_id is null then
    return null;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'event_id', changed_event_id,
      'moto_id', changed_moto_id,
      'table', TG_TABLE_NAME,
      'operation', TG_OP
    ),
    'race_state_changed',
    'race:event:' || changed_event_id::text,
    true
  );

  return null;
end;
$$;

revoke all on function public.broadcast_race_state_change() from public;

drop trigger if exists trg_realtime_motos on public.motos;
create trigger trg_realtime_motos
after insert or update or delete on public.motos
for each row execute function public.broadcast_race_state_change();

drop trigger if exists trg_realtime_results on public.results;
create trigger trg_realtime_results
after insert or update or delete on public.results
for each row execute function public.broadcast_race_state_change();

drop trigger if exists trg_realtime_rider_participation_status on public.rider_participation_status;
create trigger trg_realtime_rider_participation_status
after insert or update or delete on public.rider_participation_status
for each row execute function public.broadcast_race_state_change();

drop trigger if exists trg_realtime_rider_penalties on public.rider_penalties;
create trigger trg_realtime_rider_penalties
after insert or update or delete on public.rider_penalties
for each row execute function public.broadcast_race_state_change();

drop trigger if exists trg_realtime_moto_locks on public.moto_locks;
create trigger trg_realtime_moto_locks
after insert or update or delete on public.moto_locks
for each row execute function public.broadcast_race_state_change();

drop trigger if exists trg_realtime_rider_safety_checks on public.rider_safety_checks;
create trigger trg_realtime_rider_safety_checks
after insert or update or delete on public.rider_safety_checks
for each row execute function public.broadcast_race_state_change();

comment on function public.broadcast_race_state_change() is
  'Publishes a minimal private race-state signal. Crew clients refetch their existing protected API payload after receiving it.';
