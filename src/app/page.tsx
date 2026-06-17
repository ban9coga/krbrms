import HeroRace from '../components/HeroRace'
import MarketingTopbar from '../components/MarketingTopbar'
import PerformanceStats from '../components/PerformanceStats'
import EventCard from '../components/EventCard'
import Link from 'next/link'
import { adminClient } from '../lib/auth'
import type { BusinessSettings, EventItem, EventStatus } from '../lib/eventService'
import { toPublicMediaUrl } from '../lib/publicMedia'

export const revalidate = 30

type LiveEventItem = {
  id: string
  name: string
  location?: string | null
}

type LandingEventSettings = {
  logo?: string | null
  slogan?: string | null
  event_scope?: 'PUBLIC' | 'INTERNAL'
  registration_open?: boolean
  owner_name?: string | null
  partner_name?: string | null
}

const fetchLandingEvents = async (status: EventStatus): Promise<EventItem[]> => {
  let query = adminClient
    .from('events')
    .select('id, name, location, event_date, status, is_public')
    .eq('is_public', true)
    .eq('status', status)

  if (status === 'UPCOMING') {
    query = query.order('event_date', { ascending: true })
  } else {
    query = query.order('event_date', { ascending: false })
  }

  const { data } = await query
  return (data ?? []) as EventItem[]
}

const loadEventSettings = async (eventIds: string[]) => {
  const settingsMap = new Map<string, LandingEventSettings>()
  if (eventIds.length === 0) return settingsMap

  const { data: settingsRows } = await adminClient
      .from('event_settings')
      .select('event_id, event_logo_url, display_theme, race_format_settings, registration_open, business_settings')
      .in('event_id', eventIds)

  for (const row of settingsRows ?? []) {
    const theme = (row.display_theme ?? {}) as Record<string, unknown>
    const raceFormat = (row.race_format_settings ?? {}) as Record<string, unknown>
    const business = (row.business_settings ?? {}) as BusinessSettings
    const slogan = typeof theme.slogan === 'string' ? theme.slogan : null
    const eventScope = raceFormat.event_scope === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC'
    settingsMap.set(row.event_id, {
      logo: toPublicMediaUrl(row.event_logo_url),
      slogan,
      event_scope: eventScope,
      registration_open: typeof row.registration_open === 'boolean' ? row.registration_open : true,
      owner_name: business.event_owner_name?.trim() || business.public_brand_name?.trim() || null,
      partner_name:
        business.operating_committee_name?.trim() ||
        business.scoring_support_name?.trim() ||
        business.platform_powered_by?.trim() ||
        null,
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

const getLiveEvent = async (): Promise<LiveEventItem | null> => {
  const { data, error } = await adminClient
    .from('events')
    .select('id, name, location, status, is_public, event_date')
    .eq('status', 'LIVE')
    .eq('is_public', true)
    .order('event_date', { ascending: false })
    .limit(1)

  if (error) {
    return null
  }

  const row = (data ?? [])[0]
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    location: row.location,
  }
}

const attachLandingSettings = (events: EventItem[], settingsMap: Map<string, LandingEventSettings>) =>
  events.map((event) => ({
    ...event,
    event_scope: settingsMap.get(event.id)?.event_scope ?? 'PUBLIC',
    registration_open: settingsMap.get(event.id)?.registration_open ?? true,
  }))

const uniqueLabels = (values: Array<string | null | undefined>) =>
  Array.from(
    new Map(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .map((value) => [value.toLowerCase(), value])
    ).values()
  )

function LandingEventSection({
  eyebrow,
  title,
  description,
  events,
  settingsMap,
  registrationAvailability,
  emptyMessage,
  actionLabel = 'Lihat Semua Event',
  children,
}: {
  eyebrow: string
  title: string
  description: string
  events: EventItem[]
  settingsMap: Map<string, LandingEventSettings>
  registrationAvailability?: Map<string, boolean>
  emptyMessage: string
  actionLabel?: string
  children?: React.ReactNode
}) {
  return (
    <section className="w-full bg-slate-100 px-2 py-4 sm:px-4 md:px-6 md:py-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="relative overflow-hidden rounded-[2rem] bg-slate-950 px-5 py-10 shadow-[0_34px_90px_rgba(15,23,42,0.22)] sm:px-8 sm:py-12 md:rounded-[2.5rem] md:px-14">
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-amber-200/10 blur-3xl" />

          <div className="relative z-10">
            <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
              <div className="grid gap-2">
                <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-amber-300">{eyebrow}</p>
                <h2 className="text-3xl font-black tracking-tight text-white md:text-4xl">{title}</h2>
                <p className="max-w-3xl text-sm font-medium text-slate-200 md:text-base">{description}</p>
              </div>

              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-xl border border-amber-300/40 bg-amber-400/10 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.14em] text-amber-100 transition-colors hover:border-amber-200/60 hover:bg-amber-400/20"
              >
                {actionLabel}
              </Link>
            </div>

            {children}

            <div className="mt-8">
              {events.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-5 text-sm font-semibold text-slate-300">
                  {emptyMessage}
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gap: '16px',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  }}
                >
                  {events.map((event, idx) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      index={idx}
                      logoUrl={settingsMap.get(event.id)?.logo ?? null}
                      slogan={settingsMap.get(event.id)?.slogan ?? null}
                      canRegister={
                        event.status !== 'UPCOMING'
                          ? true
                          : event.registration_open !== false && (registrationAvailability?.get(event.id) ?? true)
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default async function LandingPage() {
  const liveEvent = await getLiveEvent()
  const [upcomingEventsRaw, finishedEventsRaw] = await Promise.all([
    fetchLandingEvents('UPCOMING'),
    fetchLandingEvents('FINISHED'),
  ])
  const landingEventIds = Array.from(new Set([...upcomingEventsRaw, ...finishedEventsRaw].map((e) => e.id)))
  const [settingsMap, registrationAvailability] = await Promise.all([
    loadEventSettings(landingEventIds),
    loadRegistrationAvailability(upcomingEventsRaw.map((event) => event.id)),
  ])
  const upcomingEvents = attachLandingSettings(upcomingEventsRaw, settingsMap)
  const finishedEvents = attachLandingSettings(finishedEventsRaw, settingsMap)
  const ownerLabels = uniqueLabels(finishedEvents.map((event) => settingsMap.get(event.id)?.owner_name))
  const partnerLabels = uniqueLabels(finishedEvents.map((event) => settingsMap.get(event.id)?.partner_name))

  return (
    <div className="public-page" style={{ background: '#f6fbf7', color: '#111' }}>
      <MarketingTopbar />

      <main>
        <HeroRace liveEvent={liveEvent} />
        <LandingEventSection
          eyebrow="Upcoming Event"
          title="Event yang Akan Datang"
          description="Lihat jadwal event berikutnya, cek detail race, dan daftar selama registrasi masih dibuka."
          events={upcomingEvents}
          settingsMap={settingsMap}
          registrationAvailability={registrationAvailability}
          emptyMessage="Belum ada upcoming event yang dibuka untuk publik."
        />
        <LandingEventSection
          eyebrow="Completed Event"
          title="Event yang Sudah Selesai"
          description="Buka arsip event yang telah selesai dan lihat hasil race publik yang sudah tersedia."
          events={finishedEvents}
          settingsMap={settingsMap}
          emptyMessage="Belum ada completed event yang tampil untuk publik."
        >
          {(ownerLabels.length > 0 || partnerLabels.length > 0) && (
            <div className="mt-6 grid gap-3 rounded-2xl border border-slate-700/70 bg-slate-900/45 p-4 md:grid-cols-2">
              {ownerLabels.length > 0 && (
                <div className="grid gap-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-300">Komunitas Pengguna Sistem</p>
                  <div className="flex flex-wrap gap-2">
                    {ownerLabels.map((label) => (
                      <span key={label} className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-bold text-slate-100">
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {partnerLabels.length > 0 && (
                <div className="grid gap-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-300">Partner Event</p>
                  <div className="flex flex-wrap gap-2">
                    {partnerLabels.map((label) => (
                      <span key={label} className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-bold text-slate-100">
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </LandingEventSection>
        <PerformanceStats />
      </main>

    </div>
  )
}

