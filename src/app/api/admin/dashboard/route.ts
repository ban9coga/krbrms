import { NextResponse } from 'next/server'
import { adminClient, getAccessibleEventIds, requireAdmin } from '../../../../lib/auth'

type DashboardEvent = {
  id: string
  name: string
  location: string | null
  status: string
  event_date: string
  is_public: boolean | null
  registration_open: boolean
  updated_at: string | null
  created_at: string | null
}

type EventQueueCounts = {
  event_id: string
  pending_registrations: number
  pending_payment_tasks: number
  live_motos: number
}

const eventPriority = (event: DashboardEvent) => {
  if (event.status === 'LIVE') return 0
  if (event.status === 'UPCOMING') return 1
  if (event.status === 'PROVISIONAL') return 2
  if (event.status === 'PROTEST_REVIEW') return 3
  if (event.status === 'FINISHED') return 4
  if (event.status === 'LOCKED') return 5
  return 6
}

const eventTime = (event: DashboardEvent) => new Date(`${event.event_date}T00:00:00`).getTime()

const sortEvents = (events: DashboardEvent[]) =>
  [...events].sort((a, b) => {
    const priority = eventPriority(a) - eventPriority(b)
    if (priority !== 0) return priority
    if (a.status === 'FINISHED' || a.status === 'LOCKED') return eventTime(b) - eventTime(a)
    return eventTime(a) - eventTime(b)
  })

const chooseDefaultEvent = (events: DashboardEvent[]) => {
  const liveEvent = sortEvents(events).find((event) => event.status === 'LIVE')
  if (liveEvent) return liveEvent

  const upcomingEvent = events
    .filter((event) => event.status === 'UPCOMING')
    .sort((a, b) => eventTime(a) - eventTime(b))[0]
  if (upcomingEvent) return upcomingEvent

  return sortEvents(events)[0] ?? null
}

const countApprovedRegistrationItems = async (eventIds: string[] | null) => {
  let query = adminClient
    .from('registration_items')
    .select('id, registrations!inner(event_id)', { count: 'exact', head: true })
    .eq('status', 'APPROVED')
  if (eventIds) query = query.in('registrations.event_id', eventIds)
  const { count, error } = await query
  if (error) throw new Error(error.message)
  return count ?? 0
}

const getEventQueueCounts = async (eventId: string | null): Promise<EventQueueCounts[]> => {
  const { data, error } = await adminClient.rpc('get_admin_dashboard_event_queue_counts', { p_event_id: eventId })
  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    event_id: String(row.event_id ?? ''),
    pending_registrations: Number(row.pending_registrations ?? 0),
    pending_payment_tasks: Number(row.pending_payment_tasks ?? 0),
    live_motos: Number(row.live_motos ?? 0),
  })).filter((row) => row.event_id)
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isSuperAdmin = auth.role === 'SUPER_ADMIN'
  const accessibleEventIds = isSuperAdmin
    ? null
    : await getAccessibleEventIds(auth.user.id, ['ADMIN', 'SUPER_ADMIN'])

  if (accessibleEventIds && accessibleEventIds.length === 0) {
    return NextResponse.json({
      data: {
        metrics: { approved_registration_items: 0, pending_registrations: 0, pending_payment_tasks: 0, live_motos: 0 },
        events: [],
        attention_by_event: [],
        selected_event_id: null,
        scope: 'EVENT',
        can_view_all_events: isSuperAdmin,
        refreshed_at: new Date().toISOString(),
      },
    })
  }

  try {
    // The event list and its settings are loaded once and reused for the selector
    // and priority snapshot; the dashboard no longer makes a second /api/events call.
    let eventQuery = adminClient
      .from('events')
      .select('id, name, location, status, event_date, is_public, updated_at, created_at')
      .order('event_date', { ascending: false })
    if (accessibleEventIds) eventQuery = eventQuery.in('id', accessibleEventIds)
    const { data: eventRows, error: eventError } = await eventQuery
    if (eventError) throw new Error(eventError.message)

    const eventIds = (eventRows ?? []).map((event) => String(event.id))
    const registrationOpenByEventId = new Map<string, boolean>()
    if (eventIds.length > 0) {
      const { data: settingsRows, error: settingsError } = await adminClient
        .from('event_settings')
        .select('event_id, registration_open, updated_at')
        .in('event_id', eventIds)
        .order('updated_at', { ascending: false })
      if (settingsError) throw new Error(settingsError.message)
      for (const row of settingsRows ?? []) {
        const eventId = typeof row.event_id === 'string' ? row.event_id : null
        if (!eventId || registrationOpenByEventId.has(eventId)) continue
        registrationOpenByEventId.set(eventId, typeof row.registration_open === 'boolean' ? row.registration_open : true)
      }
    }

    const events: DashboardEvent[] = (eventRows ?? []).map((event) => ({
      id: String(event.id),
      name: String(event.name ?? 'Untitled Event'),
      location: typeof event.location === 'string' ? event.location : null,
      status: String(event.status ?? 'UPCOMING'),
      event_date: String(event.event_date ?? ''),
      is_public: typeof event.is_public === 'boolean' ? event.is_public : null,
      registration_open: registrationOpenByEventId.get(String(event.id)) ?? true,
      updated_at: typeof event.updated_at === 'string' ? event.updated_at : null,
      created_at: typeof event.created_at === 'string' ? event.created_at : null,
    })).filter((event) => event.id && event.event_date)

    const { searchParams } = new URL(req.url)
    const requestedScope = searchParams.get('scope')
    const requestedEventId = searchParams.get('event_id')
    if (requestedScope === 'all' && !isSuperAdmin) {
      return NextResponse.json({ error: 'Hanya Super Admin yang dapat melihat semua event.' }, { status: 403 })
    }

    let selectedEvent: DashboardEvent | null = chooseDefaultEvent(events)
    let isAllScope = requestedScope === 'all'
    if (requestedEventId) {
      selectedEvent = events.find((event) => event.id === requestedEventId) ?? null
      if (!selectedEvent) return NextResponse.json({ error: 'Event tidak ditemukan atau tidak dapat diakses.' }, { status: 404 })
      isAllScope = false
    }

    let attentionByEvent: EventQueueCounts[] = []
    let approvedRegistrationItems = 0
    let pendingRegistrations = 0
    let pendingPaymentTasks = 0
    let liveMotos = 0
    if (isAllScope) {
      const [approvedCount, queueCounts] = await Promise.all([
        countApprovedRegistrationItems(null),
        getEventQueueCounts(null),
      ])
      approvedRegistrationItems = approvedCount
      attentionByEvent = queueCounts
      pendingRegistrations = queueCounts.reduce((sum, row) => sum + row.pending_registrations, 0)
      pendingPaymentTasks = queueCounts.reduce((sum, row) => sum + row.pending_payment_tasks, 0)
      liveMotos = queueCounts.reduce((sum, row) => sum + row.live_motos, 0)
    } else if (selectedEvent) {
      const [approvedCount, queueCounts] = await Promise.all([
        countApprovedRegistrationItems([selectedEvent.id]),
        getEventQueueCounts(selectedEvent.id),
      ])
      approvedRegistrationItems = approvedCount
      attentionByEvent = queueCounts
      pendingRegistrations = queueCounts.reduce((sum, row) => sum + row.pending_registrations, 0)
      pendingPaymentTasks = queueCounts.reduce((sum, row) => sum + row.pending_payment_tasks, 0)
      liveMotos = queueCounts.reduce((sum, row) => sum + row.live_motos, 0)
    }

    return NextResponse.json({
      data: {
        metrics: {
          approved_registration_items: approvedRegistrationItems,
          pending_registrations: pendingRegistrations,
          pending_payment_tasks: pendingPaymentTasks,
          live_motos: liveMotos,
        },
        events: sortEvents(events),
        attention_by_event: attentionByEvent,
        selected_event_id: isAllScope ? null : selectedEvent?.id ?? null,
        scope: isAllScope ? 'ALL' : 'EVENT',
        can_view_all_events: isSuperAdmin,
        refreshed_at: new Date().toISOString(),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal memuat dashboard' },
      { status: 400 }
    )
  }
}
