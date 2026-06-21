import EventDetailClient from './EventDetailClient'
import { adminClient } from '../../../lib/auth'
import { applyBestTeamSettingsNormalization } from '../../../lib/bestTeam'
import type { BusinessSettings, EventItem } from '../../../lib/eventService'
import { proxyBusinessSettingsMedia, toPublicMediaUrl, toPublicMediaUrls } from '../../../lib/publicMedia'

export const revalidate = 30

const loadInitialEvent = async (eventId: string): Promise<EventItem | null> => {
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
}

export default async function EventDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const initialEvent = await loadInitialEvent(eventId)
  return <EventDetailClient eventId={eventId} initialEvent={initialEvent} />
}
