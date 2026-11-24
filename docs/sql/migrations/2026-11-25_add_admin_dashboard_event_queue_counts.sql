begin;

-- Aggregate only the counts needed for the Super Admin's all-events dashboard.
-- Returning grouped counts avoids transferring each pending row to the API.
create or replace function public.get_admin_dashboard_event_queue_counts()
returns table (
  event_id uuid,
  pending_registrations bigint,
  pending_payment_rows bigint,
  live_motos bigint
)
language sql
security definer
set search_path = public
as $$
  with pending_registrations as (
    select r.event_id, count(*)::bigint as total
    from public.registrations r
    where r.status = 'PENDING'
    group by r.event_id
  ), pending_payment_rows as (
    select r.event_id, count(*)::bigint as total
    from public.registration_payments rp
    join public.registrations r on r.id = rp.registration_id
    where rp.status = 'PENDING'
    group by r.event_id
  ), live_motos as (
    select m.event_id, count(*)::bigint as total
    from public.motos m
    where m.status = 'LIVE'
    group by m.event_id
  )
  select
    e.id,
    coalesce(pr.total, 0),
    coalesce(pp.total, 0),
    coalesce(lm.total, 0)
  from public.events e
  left join pending_registrations pr on pr.event_id = e.id
  left join pending_payment_rows pp on pp.event_id = e.id
  left join live_motos lm on lm.event_id = e.id;
$$;

revoke all on function public.get_admin_dashboard_event_queue_counts() from public;
grant execute on function public.get_admin_dashboard_event_queue_counts() to service_role;

comment on function public.get_admin_dashboard_event_queue_counts() is
  'Returns per-event pending registration, pending payment row, and live moto counts for the authenticated Super Admin dashboard API.';

commit;

-- Rollback:
-- begin;
-- drop function if exists public.get_admin_dashboard_event_queue_counts();
-- commit;
