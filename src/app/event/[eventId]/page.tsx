import type { Metadata } from 'next'
import { cache } from 'react'
import EventDetailClient from './EventDetailClient'
import { adminClient } from '../../../lib/auth'
import { applyBestTeamSettingsNormalization } from '../../../lib/bestTeam'
import type { BusinessSettings, EventItem } from '../../../lib/eventService'
import { proxyBusinessSettingsMedia, toPublicMediaUrl, toPublicMediaUrls } from '../../../lib/publicMedia'
import { serializeJsonLd, SITE_NAME, SITE_URL } from '../../../lib/structuredData'

export const revalidate = 30

const loadInitialEvent = cache(async (eventId: string): Promise<EventItem | null> => {
  const [{ data: eventRows, error: eventError }, { data: settingsRows }] = await Promise.all([
    adminClient
      .from('events')
      .select('id, name, location, event_date, status, is_public, created_at, updated_at')
      .eq('id', eventId)
      .limit(1),
    adminClient
      .from('event_settings')
      .select('event_logo_url, sponsor_logo_urls, business_settings, registration_open, race_format_settings, updated_at')
      .eq('event_id', eventId)
      .order('updated_at', { ascending: false })
      .limit(1),
  ])

  const event = (eventRows ?? [])[0]
  if (eventError || !event || event.is_public === false) return null

  const settings = (settingsRows ?? [])[0]
  const raceFormat =
    settings?.race_format_settings && typeof settings.race_format_settings === 'object'
      ? (settings.race_format_settings as Record<string, unknown>)
      : {}
  const business =
    settings?.business_settings && typeof settings.business_settings === 'object'
      ? applyBestTeamSettingsNormalization(settings.business_settings as BusinessSettings)
      : {}

  return {
    ...event,
    event_scope: raceFormat.event_scope === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC',
    registration_open: typeof settings?.registration_open === 'boolean' ? settings.registration_open : true,
    event_logo_url: toPublicMediaUrl(typeof settings?.event_logo_url === 'string' ? settings.event_logo_url : null),
    sponsor_logo_urls: toPublicMediaUrls(settings?.sponsor_logo_urls),
    business_settings: proxyBusinessSettingsMedia(business),
  } as EventItem
})

const formatEventDate = (value?: string | null) => {
  if (!value) return ''
  return new Date(`${value}T00:00:00+07:00`).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

const getPublicEventTitle = (event: EventItem) =>
  event.business_settings?.public_event_title?.trim() || event.name || 'Race Pushbike Indonesia'

const buildEventDescription = (event: EventItem) => {
  const title = getPublicEventTitle(event)
  const location = event.location?.trim()
  const date = formatEventDate(event.event_date)
  const locationText = location ? ` di ${location}` : ' di Indonesia'
  const dateText = date ? ` pada ${date}` : ''

  return `${title} adalah event race pushbike dan balance bike${locationText}${dateText}. Cek jadwal, pendaftaran rider, live skor, dan hasil race di RacePushbike.com.`
}

const getSchemaEventStatus = (status: EventItem['status']) => {
  if (status === 'LIVE') return 'https://schema.org/EventInProgress'
  if (status === 'FINISHED') return 'https://schema.org/EventCompleted'
  return 'https://schema.org/EventScheduled'
}

const buildEventStructuredData = (event: EventItem, eventId: string) => {
  const title = getPublicEventTitle(event)
  const description = buildEventDescription(event)
  const url = `${SITE_URL}/event/${eventId}`
  const organizerName =
    event.business_settings?.event_owner_name?.trim() ||
    event.business_settings?.public_brand_name?.trim() ||
    SITE_NAME
  const locationName = event.location?.trim() || 'Indonesia'
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: title,
    description,
    url,
    startDate: event.event_date,
    eventStatus: getSchemaEventStatus(event.status),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    sport: 'Pushbike',
    location: {
      '@type': 'Place',
      name: locationName,
      address: {
        '@type': 'PostalAddress',
        addressLocality: locationName,
        addressCountry: 'ID',
      },
    },
    organizer: {
      '@type': 'Organization',
      name: organizerName,
      url: SITE_URL,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: SITE_URL,
    },
  }

  if (event.event_logo_url) {
    data.image = [event.event_logo_url]
  }

  return data
}

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const { eventId } = await params
  const event = await loadInitialEvent(eventId)

  if (!event) {
    return {
      title: 'Event tidak ditemukan',
      description: 'Event race pushbike tidak ditemukan atau belum dipublikasikan.',
      robots: { index: false, follow: false },
    }
  }

  const title = `${getPublicEventTitle(event)} - Race Pushbike Indonesia`
  const description = buildEventDescription(event)
  const url = `${SITE_URL}/event/${eventId}`
  const images = event.event_logo_url ? [{ url: event.event_logo_url, alt: getPublicEventTitle(event) }] : undefined

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: 'website',
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: event.event_logo_url ? [event.event_logo_url] : undefined,
    },
  }
}

export default async function EventDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const initialEvent = await loadInitialEvent(eventId)
  const eventStructuredData = initialEvent ? buildEventStructuredData(initialEvent, eventId) : null

  return (
    <>
      {eventStructuredData ? (
        <script
          id="racepushbike-event-structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(eventStructuredData) }}
        />
      ) : null}
      <EventDetailClient eventId={eventId} initialEvent={initialEvent} />
    </>
  )
}
