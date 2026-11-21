import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import EventCard from '../../components/EventCard'
import MarketingTopbar from '../../components/MarketingTopbar'
import { adminClient } from '../../lib/auth'
import type { EventItem, EventStatus } from '../../lib/eventService'
import { toPublicMediaUrl } from '../../lib/publicMedia'

export const revalidate = 30

export const metadata: Metadata = {
  title: 'Jadwal Race Pushbike Indonesia 2026 — Daftar Event & Live Skor',
  description:
    'Lihat jadwal race pushbike Indonesia, daftar event pushbike terdekat, cek status registrasi, dan pantau live skor race secara real-time.',
  openGraph: {
    title: 'Jadwal Race Pushbike Indonesia 2026 — Daftar Event & Live Skor',
    description:
      'Lihat jadwal race pushbike Indonesia, daftar event pushbike terdekat, cek status registrasi, dan pantau live skor race secara real-time.',
    url: 'https://racepushbike.com/jadwal-race-pushbike',
  },
  twitter: {
    title: 'Jadwal Race Pushbike Indonesia 2026 — Daftar Event & Live Skor',
    description:
      'Lihat jadwal race pushbike Indonesia, daftar event pushbike terdekat, cek status registrasi, dan pantau live skor race secara real-time.',
  },
}

type EventSettings = {
  logo?: string | null
  slogan?: string | null
  event_scope?: 'PUBLIC' | 'INTERNAL'
  registration_open?: boolean
}

const fetchEvents = async (status: EventStatus): Promise<EventItem[]> => {
  let query = adminClient
    .from('events')
    .select('id, name, location, event_date, status, is_public')
    .eq('is_public', true)
    .eq('status', status)

  query =
    status === 'UPCOMING'
      ? query.order('event_date', { ascending: true })
      : query.order('event_date', { ascending: false })

  const { data } = await query
  return (data ?? []) as EventItem[]
}

const loadEventSettings = async (eventIds: string[]) => {
  const settingsMap = new Map<string, EventSettings>()
  if (eventIds.length === 0) return settingsMap

  const { data: settingsRows } = await adminClient
    .from('event_settings')
    .select('event_id, event_logo_url, display_theme, race_format_settings, registration_open')
    .in('event_id', eventIds)

  for (const row of settingsRows ?? []) {
    const theme = (row.display_theme ?? {}) as Record<string, unknown>
    const raceFormat = (row.race_format_settings ?? {}) as Record<string, unknown>
    settingsMap.set(row.event_id, {
      logo: toPublicMediaUrl(row.event_logo_url),
      slogan: typeof theme.slogan === 'string' ? theme.slogan : null,
      event_scope: raceFormat.event_scope === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC',
      registration_open: typeof row.registration_open === 'boolean' ? row.registration_open : true,
    })
  }

  return settingsMap
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
    availability.set(
      eventId,
      eventCategories.length === 0 ||
        eventCategories.some((category) => {
          if (category.capacity == null) return true
          return (filledCounts.get(category.id) ?? 0) < category.capacity
        })
    )
  }

  return availability
}

const attachSettings = (events: EventItem[], settingsMap: Map<string, EventSettings>) =>
  events.map((event) => ({
    ...event,
    event_scope: settingsMap.get(event.id)?.event_scope ?? 'PUBLIC',
    registration_open: settingsMap.get(event.id)?.registration_open ?? true,
  }))

export default async function JadwalRacePushbikePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const params = await searchParams
  const liveOnly = params.status === 'live'
  if (liveOnly) redirect('/live-results')

  const [upcomingRaw, finishedRaw] = await Promise.all([
    fetchEvents('UPCOMING'),
    fetchEvents('FINISHED'),
  ])
  const eventIds = Array.from(new Set([...upcomingRaw, ...finishedRaw].map((event) => event.id)))
  const [settingsMap, registrationAvailability] = await Promise.all([
    loadEventSettings(eventIds),
    loadRegistrationAvailability(upcomingRaw.map((event) => event.id)),
  ])
  const upcomingEvents = attachSettings(upcomingRaw, settingsMap)
  const finishedEvents = attachSettings(finishedRaw, settingsMap)

  return (
    <div className="public-page homepage-editorial-page dashboard-editorial-page schedule-events-page">
      <MarketingTopbar variant="editorial" />

      <main className="dashboard-editorial-main">
        <header className="dashboard-editorial-heading">
          <h1>Event</h1>
        </header>

        <section className="dashboard-editorial-section dashboard-editorial-section-upcoming">
          <div className="dashboard-editorial-section-head">
            <div>
              <h2>Akan Datang</h2>
            </div>
          </div>
          {upcomingEvents.length === 0 ? (
            <div className="dashboard-editorial-empty">Belum ada event mendatang.</div>
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
              <h2>Selesai</h2>
            </div>
          </div>
          {finishedEvents.length === 0 ? (
            <div className="dashboard-editorial-empty">Belum ada hasil event yang ditampilkan.</div>
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
