import EventCard from '../../components/EventCard'
import MarketingTopbar from '../../components/MarketingTopbar'
import type { EventItem, EventStatus } from '../../lib/eventService'
import { adminClient } from '../../lib/auth'
import { toPublicMediaUrl } from '../../lib/publicMedia'

export const dynamic = 'force-dynamic'

const fetchEvents = async (status?: EventStatus): Promise<EventItem[]> => {
  let query = adminClient
    .from('events')
    .select('id, name, location, event_date, status, is_public')
    .eq('is_public', true)
    .order('event_date', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data } = await query
  return (data ?? []) as EventItem[]
}

const loadRegistrationAvailability = async (eventIds: string[]) => {
  const availability = new Map<string, boolean>()
  if (eventIds.length === 0) return availability

  const { data: categories } = await adminClient
    .from('categories')
    .select('id, event_id, capacity, enabled')
    .in('event_id', eventIds)
    .eq('enabled', true)

  const categoriesByEvent = new Map<string, Array<{ id: string; capacity: number | null }>>()
  for (const row of categories ?? []) {
    const bucket = categoriesByEvent.get(row.event_id) ?? []
    bucket.push({
      id: row.id,
      capacity: typeof row.capacity === 'number' && Number.isFinite(row.capacity) ? row.capacity : null,
    })
    categoriesByEvent.set(row.event_id, bucket)
  }

  const { data: existingItems } = await adminClient
    .from('registration_items')
    .select('primary_category_id, extra_category_id, status, registrations!inner(event_id)')
    .in('registrations.event_id', eventIds)
    .in('status', ['PENDING', 'APPROVED'])

  const filledCounts = new Map<string, number>()
  for (const row of existingItems ?? []) {
    const primaryId = typeof row.primary_category_id === 'string' ? row.primary_category_id : null
    const extraId = typeof row.extra_category_id === 'string' ? row.extra_category_id : null
    if (primaryId) filledCounts.set(primaryId, (filledCounts.get(primaryId) ?? 0) + 1)
    if (extraId) filledCounts.set(extraId, (filledCounts.get(extraId) ?? 0) + 1)
  }

  for (const eventId of eventIds) {
    const eventCategories = categoriesByEvent.get(eventId) ?? []
    if (eventCategories.length === 0) {
      availability.set(eventId, true)
      continue
    }
    availability.set(
      eventId,
      eventCategories.some((category) => {
        if (category.capacity == null) return true
        const filled = filledCounts.get(category.id) ?? 0
        return filled < category.capacity
      })
    )
  }

  return availability
}

export default async function DashboardPage() {
  const [upcomingEventsRaw, ongoingEventsRaw, finishedEventsRaw] = await Promise.all([
    fetchEvents('UPCOMING'),
    fetchEvents('LIVE'),
    fetchEvents('FINISHED'),
  ])
  const registrationAvailability = await loadRegistrationAvailability(upcomingEventsRaw.map((event) => event.id))
  const allEvents = [...upcomingEventsRaw, ...ongoingEventsRaw, ...finishedEventsRaw]
  const eventIds = allEvents.map((e) => e.id)
  const settingsMap = new Map<
    string,
    { logo?: string | null; slogan?: string | null; event_scope?: 'PUBLIC' | 'INTERNAL'; registration_open?: boolean }
  >()
  if (eventIds.length > 0) {
    const { data: settingsRows } = await adminClient
      .from('event_settings')
      .select('event_id, event_logo_url, display_theme, race_format_settings, registration_open')
      .in('event_id', eventIds)
    for (const row of settingsRows ?? []) {
      const theme = (row.display_theme ?? {}) as Record<string, unknown>
      const raceFormat = (row.race_format_settings ?? {}) as Record<string, unknown>
      const slogan = typeof theme.slogan === 'string' ? theme.slogan : null
      const eventScope = raceFormat.event_scope === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC'
      settingsMap.set(row.event_id, {
        logo: toPublicMediaUrl(row.event_logo_url),
        slogan,
        event_scope: eventScope,
        registration_open: typeof row.registration_open === 'boolean' ? row.registration_open : true,
      })
    }
  }
  const upcomingEvents = upcomingEventsRaw.map((event) => ({
    ...event,
    event_scope: settingsMap.get(event.id)?.event_scope ?? 'PUBLIC',
    registration_open: settingsMap.get(event.id)?.registration_open ?? true,
  }))
  const ongoingEvents = ongoingEventsRaw.map((event) => ({
    ...event,
    event_scope: settingsMap.get(event.id)?.event_scope ?? 'PUBLIC',
    registration_open: settingsMap.get(event.id)?.registration_open ?? true,
  }))
  const finishedEvents = finishedEventsRaw.map((event) => ({
    ...event,
    event_scope: settingsMap.get(event.id)?.event_scope ?? 'PUBLIC',
    registration_open: settingsMap.get(event.id)?.registration_open ?? true,
  }))

  return (
    <div className="public-page homepage-editorial-page dashboard-editorial-page">
      <MarketingTopbar variant="editorial" />

      <main className="dashboard-editorial-main">
        <header className="dashboard-editorial-heading">
          <p>Race calendar</p>
          <h1>Semua Event</h1>
          <span>Pantau event live, daftar race berikutnya, dan buka kembali hasil event yang sudah selesai.</span>
        </header>

        <section id="live-results" className="dashboard-editorial-section dashboard-editorial-section-live">
          <div className="dashboard-editorial-section-head">
            <div>
              <p>Live now</p>
              <h2>Event Berlangsung</h2>
            </div>
            <span>{ongoingEvents.length} event</span>
          </div>
          {ongoingEvents.length === 0 ? (
            <div className="dashboard-editorial-empty">Belum ada event yang sedang berlangsung.</div>
          ) : (
            <div className="dashboard-editorial-grid">
              {ongoingEvents.map((event, idx) => (
                <EventCard
                  key={event.id}
                  event={event}
                  index={idx}
                  logoUrl={settingsMap.get(event.id)?.logo ?? null}
                  slogan={settingsMap.get(event.id)?.slogan ?? null}
                  canRegister={event.registration_open !== false && (registrationAvailability.get(event.id) ?? true)}
                  variant="editorial"
                />
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-editorial-section dashboard-editorial-section-upcoming">
          <div className="dashboard-editorial-section-head">
            <div>
              <p>Upcoming event</p>
              <h2>Event yang Akan Datang</h2>
            </div>
            <span>{upcomingEvents.length} event</span>
          </div>
          {upcomingEvents.length === 0 ? (
            <div className="dashboard-editorial-empty">Belum ada event yang akan datang.</div>
          ) : (
            <div className="dashboard-editorial-grid">
              {upcomingEvents.map((event, idx) => (
                <EventCard
                  key={event.id}
                  event={event}
                  index={idx}
                  logoUrl={settingsMap.get(event.id)?.logo ?? null}
                  slogan={settingsMap.get(event.id)?.slogan ?? null}
                  canRegister={event.registration_open !== false && (registrationAvailability.get(event.id) ?? true)}
                  variant="editorial"
                />
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-editorial-section dashboard-editorial-section-finished">
          <div className="dashboard-editorial-section-head">
            <div>
              <p>Race archive</p>
              <h2>Completed Event</h2>
            </div>
            <span>{finishedEvents.length} event</span>
          </div>
          {finishedEvents.length === 0 ? (
            <div className="dashboard-editorial-empty">Belum ada event yang selesai.</div>
          ) : (
            <div className="dashboard-editorial-grid">
              {finishedEvents.map((event, idx) => (
                <EventCard
                  key={event.id}
                  event={event}
                  index={idx}
                  logoUrl={settingsMap.get(event.id)?.logo ?? null}
                  slogan={settingsMap.get(event.id)?.slogan ?? null}
                  variant="editorial"
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
