import { NextResponse } from 'next/server'
import { adminClient, getAccessibleEventIds, requireAdmin } from '../../../../lib/auth'

type DashboardEvent = {
  id: string
  name: string
  status: string
  event_date: string
}

const eventPriority = (event: DashboardEvent) => {
  if (event.status === 'LIVE') return 0
  if (event.status === 'PROVISIONAL') return 1
  if (event.status === 'PROTEST_REVIEW') return 2
  if (event.status === 'UPCOMING') return 3
  if (event.status === 'FINISHED') return 4
  if (event.status === 'LOCKED') return 5
  return 6
}

const eventTime = (event: DashboardEvent) => new Date(`${event.event_date}T00:00:00`).getTime()

const pickPrimaryEvent = (events: DashboardEvent[]) => {
  if (events.length === 0) return null
  return [...events].sort((a, b) => {
    const priority = eventPriority(a) - eventPriority(b)
    if (priority !== 0) return priority
    if (a.status === 'FINISHED' || a.status === 'LOCKED') return eventTime(b) - eventTime(a)
    return eventTime(a) - eventTime(b)
  })[0]
}

const countRiders = async (accessibleEventIds: string[] | null) => {
  let query = adminClient.from('riders').select('id', { count: 'exact', head: true })
  if (accessibleEventIds) query = query.in('event_id', accessibleEventIds)
  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}

const countRegistrations = async (accessibleEventIds: string[] | null, status?: 'PENDING' | 'APPROVED') => {
  let query = adminClient.from('registrations').select('id', { count: 'exact', head: true })
  if (accessibleEventIds) query = query.in('event_id', accessibleEventIds)
  if (status) query = query.eq('status', status)
  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}

const countLiveMotos = async (accessibleEventIds: string[] | null) => {
  let query = adminClient
    .from('motos')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'LIVE')
  if (accessibleEventIds) query = query.in('event_id', accessibleEventIds)
  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}

const countApprovedRiders = async (accessibleEventIds: string[] | null) => {
  let query = adminClient
    .from('registration_items')
    .select('id, registrations!inner(event_id)', { count: 'exact', head: true })
    .eq('status', 'APPROVED')
  if (accessibleEventIds) query = query.in('registrations.event_id', accessibleEventIds)
  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}

const countPendingPayments = async (accessibleEventIds: string[] | null) => {
  let query = adminClient
    .from('registration_payments')
    .select('id, registrations!inner(event_id)', { count: 'exact', head: true })
    .eq('status', 'PENDING')
  if (accessibleEventIds) query = query.in('registrations.event_id', accessibleEventIds)
  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}

const countCheckedInRiders = async (accessibleEventIds: string[] | null) => {
  let query = adminClient
    .from('registration_items')
    .select('id, registrations!inner(event_id)', { count: 'exact', head: true })
    .eq('venue_status', 'CHECKED_IN')
  if (accessibleEventIds) query = query.in('registrations.event_id', accessibleEventIds)
  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}

const countGoodieBagPending = async (accessibleEventIds: string[] | null) => {
  let query = adminClient
    .from('registration_items')
    .select('id, registrations!inner(event_id)', { count: 'exact', head: true })
    .eq('venue_status', 'CHECKED_IN')
    .is('goodie_bag_collected_at', null)
  if (accessibleEventIds) query = query.in('registrations.event_id', accessibleEventIds)
  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}

const getDashboardEvents = async (accessibleEventIds: string[] | null) => {
  let query = adminClient
    .from('events')
    .select('id, name, status, event_date, updated_at, created_at')
    .order('event_date', { ascending: false })
    .limit(50)
  if (accessibleEventIds) query = query.in('id', accessibleEventIds)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  return (data ?? [])
    .map((event) => ({
      id: String(event.id ?? ''),
      name: String(event.name ?? 'Untitled Event'),
      status: String(event.status ?? 'UPCOMING'),
      event_date: String(event.event_date ?? ''),
      updated_at: event.updated_at ?? null,
      created_at: event.created_at ?? null,
    }))
    .filter((event) => event.id && event.event_date)
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accessibleEventIds =
    auth.role === 'SUPER_ADMIN' ? null : await getAccessibleEventIds(auth.user.id, ['ADMIN', 'SUPER_ADMIN'])

  if (accessibleEventIds && accessibleEventIds.length === 0) {
    return NextResponse.json({
      data: {
        total_riders: 0,
        total_registrations: 0,
        approved_riders: 0,
        pending_registrations: 0,
        approved_registrations: 0,
        pending_payments: 0,
        checked_in_riders: 0,
        goodie_bag_pending: 0,
        live_motos: 0,
        last_updated: null,
        primary_event: null,
      },
    })
  }

  try {
    const [
      riderCount,
      regCount,
      approvedRiders,
      pendingRegistrations,
      approvedRegistrations,
      pendingPayments,
      checkedInRiders,
      goodieBagPending,
      liveMotos,
      dashboardEvents,
    ] = await Promise.all([
      countRiders(accessibleEventIds),
      countRegistrations(accessibleEventIds),
      countApprovedRiders(accessibleEventIds),
      countRegistrations(accessibleEventIds, 'PENDING'),
      countRegistrations(accessibleEventIds, 'APPROVED'),
      countPendingPayments(accessibleEventIds),
      countCheckedInRiders(accessibleEventIds),
      countGoodieBagPending(accessibleEventIds),
      countLiveMotos(accessibleEventIds),
      getDashboardEvents(accessibleEventIds),
    ])

    const primaryEvent = pickPrimaryEvent(dashboardEvents)
    const lastEventRow = [...dashboardEvents]
      .sort((a, b) => {
        const aTime = new Date(String(a.updated_at ?? a.created_at ?? 0)).getTime()
        const bTime = new Date(String(b.updated_at ?? b.created_at ?? 0)).getTime()
        return bTime - aTime
      })[0]

    return NextResponse.json({
      data: {
        total_riders: riderCount,
        total_registrations: regCount,
        approved_riders: approvedRiders,
        pending_registrations: pendingRegistrations,
        approved_registrations: approvedRegistrations,
        pending_payments: pendingPayments,
        checked_in_riders: checkedInRiders,
        goodie_bag_pending: goodieBagPending,
        live_motos: liveMotos,
        last_updated: lastEventRow?.updated_at ?? lastEventRow?.created_at ?? null,
        primary_event: primaryEvent
          ? {
              id: primaryEvent.id,
              name: primaryEvent.name,
              status: primaryEvent.status,
              event_date: primaryEvent.event_date,
            }
          : null,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal memuat dashboard' },
      { status: 400 }
    )
  }
}
