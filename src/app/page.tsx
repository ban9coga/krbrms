import HeroRace from '../components/HeroRace'
import MarketingTopbar from '../components/MarketingTopbar'
import LandingEventCollection, { type LandingEventCardItem } from '../components/LandingEventCollection'
import Image from 'next/image'
import type { Metadata } from 'next'
import { adminClient } from '../lib/auth'
import type { EventItem, EventStatus } from '../lib/eventService'
import { toPublicMediaUrl } from '../lib/publicMedia'
import { getCommunityShowcaseLogos, type CommunityShowcaseLogo } from '../lib/communityShowcase'
import { getLiveEvent } from '../lib/liveEvent'
import { getPublicFinishedEventArchives } from '../services/publicFinishedEventArchive'
import { getLatestInsightPosts } from '../lib/insight'
import InsightHomeSection from '../components/InsightHomeSection'

export const revalidate = 30

export const metadata: Metadata = {
  title: 'Race Pushbike Indonesia — Jadwal, Pendaftaran & Live Skor | RacePushbike',
  description:
    'Cari jadwal race pushbike Indonesia, daftar rider, cek live skor, dan pantau hasil race real-time dari komunitas pushbike di berbagai kota.',
  openGraph: {
    title: 'Race Pushbike Indonesia — Jadwal, Pendaftaran & Live Skor | RacePushbike',
    description:
      'Cari jadwal race pushbike Indonesia, daftar rider, cek live skor, dan pantau hasil race real-time dari komunitas pushbike di berbagai kota.',
  },
  twitter: {
    title: 'Race Pushbike Indonesia — Jadwal, Pendaftaran & Live Skor | RacePushbike',
    description:
      'Cari jadwal race pushbike Indonesia, daftar rider, cek live skor, dan pantau hasil race real-time dari komunitas pushbike di berbagai kota.',
  },
}

type LandingEventSettings = {
  logo?: string | null
  poster?: string | null
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
      poster: toPublicMediaUrl(typeof raceFormat.event_poster_url === 'string' ? raceFormat.event_poster_url : null),
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

export default async function LandingPage() {
  const liveEvent = await getLiveEvent()
  const [upcomingEventsRaw, liveEventsRaw, finishedArchives, insightPosts] = await Promise.all([
    fetchLandingEvents('UPCOMING'),
    fetchLandingEvents('LIVE'),
    getPublicFinishedEventArchives(),
    getLatestInsightPosts(3),
  ])
  const finishedEventsRaw = finishedArchives.map((archive) => archive.event)
  const [landingSettings, registrationAvailability] = await Promise.all([
    loadEventSettings([...upcomingEventsRaw, ...liveEventsRaw].map((event) => event.id)),
    loadRegistrationAvailability(upcomingEventsRaw.map((event) => event.id)),
  ])
  const settingsMap = new Map(landingSettings.settingsMap)
  for (const archive of finishedArchives) {
    settingsMap.set(archive.event.id, {
      logo: archive.event.event_logo_url ?? null,
      poster: archive.event.event_poster_url ?? null,
      slogan: archive.slogan,
      event_scope: archive.event.event_scope ?? 'PUBLIC',
      registration_open: archive.event.registration_open ?? true,
    })
  }
  const communityLogos = getCommunityShowcaseLogos(
    finishedArchives.map((archive) => ({ business_settings: archive.event.business_settings }))
  )
  const activeEvents = attachLandingSettings([...liveEventsRaw, ...upcomingEventsRaw], settingsMap)
  const finishedEvents = attachLandingSettings(finishedEventsRaw, settingsMap)
  const finishedArchiveById = new Map(finishedArchives.map((archive) => [archive.event.id, archive]))
  const eventCards: LandingEventCardItem[] = [
    ...activeEvents.map((event) => ({
      ...event,
      logoUrl: settingsMap.get(event.id)?.logo ?? null,
      posterUrl: settingsMap.get(event.id)?.poster ?? null,
      slogan: settingsMap.get(event.id)?.slogan ?? null,
      canRegister:
        event.status === 'UPCOMING' &&
        event.registration_open !== false &&
        (registrationAvailability.get(event.id) ?? true),
    })),
    ...finishedEvents.map((event) => ({
      ...event,
      logoUrl: settingsMap.get(event.id)?.logo ?? null,
      posterUrl: settingsMap.get(event.id)?.poster ?? null,
      slogan: settingsMap.get(event.id)?.slogan ?? null,
      canRegister: false,
      riderTotal: finishedArchiveById.get(event.id)?.riderTotal,
    })),
  ].sort((left, right) => {
    const statusOrder: Record<EventStatus, number> = { LIVE: 0, UPCOMING: 1, FINISHED: 2 }
    const statusDifference = statusOrder[left.status] - statusOrder[right.status]
    if (statusDifference !== 0) return statusDifference
    const dateDifference = new Date(left.event_date).getTime() - new Date(right.event_date).getTime()
    return left.status === 'FINISHED' ? -dateDifference : dateDifference
  })

  return (
    <div className="public-page homepage-editorial-page">
      <MarketingTopbar variant="editorial" />

      <main>
        <HeroRace liveEvent={liveEvent} />
        <LandingEventCollection events={eventCards} />
        <InsightHomeSection posts={insightPosts} />
        {communityLogos.length > 0 && (
          <section className="homepage-editorial-section homepage-editorial-community-section">
            <div className="homepage-editorial-section-inner">
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
            </div>
          </section>
        )}
      </main>

    </div>
  )
}
