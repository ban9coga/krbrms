begin;

-- A bundle order is one payment task even though it creates one payment row
-- for each event registration. Attribute it once to its source event in the
-- all-event dashboard; in a single-event view show it for either linked event.
create or replace function public.get_admin_dashboard_event_queue_counts(
  p_event_id uuid
)
returns table (
  event_id uuid,
  pending_registrations bigint,
  pending_payment_tasks bigint,
  live_motos bigint
)
language sql
security definer
set search_path = public
as $$
  with scoped_events as (
    select e.id
    from public.events e
    where p_event_id is null or e.id = p_event_id
  ), pending_registrations as (
    select r.event_id, count(*)::bigint as total
    from public.registrations r
    join scoped_events e on e.id = r.event_id
    where r.status = 'PENDING'
    group by r.event_id
  ), standalone_pending_payments as (
    select r.event_id, count(*)::bigint as total
    from public.registration_payments rp
    join public.registrations r on r.id = rp.registration_id
    join scoped_events e on e.id = r.event_id
    where rp.status = 'PENDING'
      and r.bundle_order_id is null
    group by r.event_id
  ), bundle_pending_payments as (
    select
      case when p_event_id is null then rbo.source_event_id else p_event_id end as event_id,
      count(*)::bigint as total
    from public.registration_bundle_orders rbo
    where rbo.payment_status = 'PENDING'
      and (
        (p_event_id is null and exists (select 1 from scoped_events e where e.id = rbo.source_event_id))
        or (p_event_id is not null and (rbo.source_event_id = p_event_id or rbo.paired_event_id = p_event_id))
      )
    group by 1
  ), live_motos as (
    select m.event_id, count(*)::bigint as total
    from public.motos m
    join scoped_events e on e.id = m.event_id
    where m.status = 'LIVE'
    group by m.event_id
  )
  select
    e.id,
    coalesce(pr.total, 0),
    coalesce(sp.total, 0) + coalesce(bp.total, 0),
    coalesce(lm.total, 0)
  from scoped_events e
  left join pending_registrations pr on pr.event_id = e.id
  left join standalone_pending_payments sp on sp.event_id = e.id
  left join bundle_pending_payments bp on bp.event_id = e.id
  left join live_motos lm on lm.event_id = e.id;
$$;

revoke all on function public.get_admin_dashboard_event_queue_counts(uuid) from public;
grant execute on function public.get_admin_dashboard_event_queue_counts(uuid) to service_role;

comment on function public.get_admin_dashboard_event_queue_counts(uuid) is
  'Returns dashboard queue counts for one event or all events. Multi-event bundle payment orders count once in all-event scope and once in either linked event scope.';

commit;

-- Rollback this function overload only after rolling the dashboard API back to
-- the zero-argument RPC created in 2026-11-25_add_admin_dashboard_event_queue_counts.sql:
-- begin;
-- drop function if exists public.get_admin_dashboard_event_queue_counts(uuid);
-- commit;
