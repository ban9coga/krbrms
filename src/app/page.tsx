import HeroRace from '../components/HeroRace'
import MarketingTopbar from '../components/MarketingTopbar'
import EventCard from '../components/EventCard'
import Link from 'next/link'
import Image from 'next/image'
import { adminClient } from '../lib/auth'
import type { EventItem, EventStatus } from '../lib/eventService'
import { toPublicMediaUrl } from '../lib/publicMedia'
import { getCommunityShowcaseLogos, type CommunityShowcaseLogo } from '../lib/communityShowcase'
import { getLiveEvent } from '../lib/liveEvent'

export const revalidate = 30

type LandingEventSettings = {
  logo?: string | null
  slogan?: string | null
  event_scope?: 'PUBLIC' | 'INTERNAL'
  registration_open?: boolean
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
  if (eventIds.length === 0) return { settingsMap, communityLogos: [] as CommunityShowcaseLogo[] }

  const { data: settingsRows } = await adminClient
      .from('event_settings')
      .select('event_id, event_logo_url, display_theme, race_format_settings, registration_open, business_settings')
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

  return {
    settingsMap,
    communityLogos: getCommunityShowcaseLogos(settingsRows ?? []),
  }
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

const attachLandingSettings = (events: EventItem[], settingsMap: Map<string, LandingEventSettings>) =>
  events.map((event) => ({
    ...event,
    event_scope: settingsMap.get(event.id)?.event_scope ?? 'PUBLIC',
    registration_open: settingsMap.get(event.id)?.registration_open ?? true,
  }))

function LandingEventSection({
  eyebrow,
  title,
  description,
  eyebrowAsTitle = false,
  events,
  settingsMap,
  registrationAvailability,
  emptyMessage,
  actionLabel = 'Lihat Semua Event',
  tone = 'light',
  children,
}: {
  eyebrow: string
  title: string
  description: string
  eyebrowAsTitle?: boolean
  events: EventItem[]
  settingsMap: Map<string, LandingEventSettings>
  registrationAvailability?: Map<string, boolean>
  emptyMessage: string
  actionLabel?: string
  tone?: 'light' | 'orange' | 'brown'
  children?: React.ReactNode
}) {
  return (
    <section className={`homepage-editorial-section homepage-editorial-section-${tone}`}>
      <div className="homepage-editorial-section-inner">
        <div className="homepage-editorial-section-heading">
          <div>
            {eyebrowAsTitle ? (
              <h2>{eyebrow}</h2>
            ) : (
              <>
                <p className="homepage-editorial-section-kicker">{eyebrow}</p>
                <h2>{title}</h2>
                <p className="homepage-editorial-section-description">{description}</p>
              </>
            )}
          </div>

          <Link href="/dashboard" className="homepage-editorial-section-action">
            {actionLabel}
            <span aria-hidden="true">→</span>
          </Link>
        </div>

        <div className="homepage-editorial-events">
          {events.length === 0 ? (
            <div className="homepage-editorial-empty-state">{emptyMessage}</div>
          ) : (
            <div className="homepage-editorial-event-grid">
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
                  variant="editorial"
                />
              ))}
            </div>
          )}
        </div>

        {children}
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
  const [landingSettings, registrationAvailability] = await Promise.all([
    loadEventSettings(landingEventIds),
    loadRegistrationAvailability(upcomingEventsRaw.map((event) => event.id)),
  ])
  const { settingsMap, communityLogos } = landingSettings
  const upcomingEvents = attachLandingSettings(upcomingEventsRaw, settingsMap)
  const finishedEvents = attachLandingSettings(finishedEventsRaw, settingsMap)

  return (
    <div className="public-page homepage-editorial-page">
      <MarketingTopbar variant="editorial" />

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
          tone="brown"
        />
        <LandingEventSection
          eyebrow="Completed Event"
          title=""
          description=""
          eyebrowAsTitle
          events={finishedEvents}
          settingsMap={settingsMap}
          emptyMessage="Belum ada completed event yang tampil untuk publik."
        >
          {communityLogos.length > 0 && (
            <div className="homepage-editorial-community">
              <h3>Komunitas &amp; Partner</h3>
              <div className="homepage-editorial-community-logos">
                {communityLogos.map((item) => (
                  <div
                    key={item.name}
                    className="homepage-editorial-community-logo"
                    title={item.name}
                  >
                    <Image
                      src={item.logoSrc}
                      alt={item.alt ?? `${item.name} logo`}
                      width={112}
                      height={64}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </LandingEventSection>
      </main>

    </div>
  )
}

