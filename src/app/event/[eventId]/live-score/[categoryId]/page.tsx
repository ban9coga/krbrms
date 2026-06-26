import LiveScoreClient from './LiveScoreClient'
import { GET as getLiveScore } from '../../../../api/public/events/[eventId]/live-score/route'
import { adminClient } from '../../../../../lib/auth'
import { proxyBusinessSettingsMedia, toPublicMediaUrl, toPublicMediaUrls } from '../../../../../lib/publicMedia'
import type { BusinessSettings, EventItem, RiderCategory } from '../../../../../lib/eventService'

export const dynamic = 'force-dynamic'

const parseBusinessSettings = (value: unknown): BusinessSettings => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as BusinessSettings
  }
  return {}
}

const loadInitialEvent = async (eventId: string): Promise<EventItem | null> => {
  const [{ data: eventRows, error: eventError }, { data: settingsRows, error: settingsError }] = await Promise.all([
    adminClient
      .from('events')
      .select('id, name, location, event_date, status, is_public, created_at, updated_at')
      .eq('id', eventId)
      .limit(1),
    adminClient
      .from('event_settings')
      .select('race_format_settings, event_logo_url, sponsor_logo_urls, business_settings, registration_open, updated_at')
      .eq('event_id', eventId)
      .order('updated_at', { ascending: false })
      .limit(1),
  ])

  if (eventError || settingsError) return null
  const eventRow = (eventRows ?? [])[0]
  if (!eventRow) return null

  const settingsRow = (settingsRows ?? [])[0]
  const raceFormatSettings =
    settingsRow?.race_format_settings && typeof settingsRow.race_format_settings === 'object' && !Array.isArray(settingsRow.race_format_settings)
      ? (settingsRow.race_format_settings as Record<string, unknown>)
      : {}

  return {
    ...eventRow,
    draw_mode: raceFormatSettings.draw_mode === 'external_draw' ? 'external_draw' : 'internal_live_draw',
    event_scope: raceFormatSettings.event_scope === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC',
    registration_open: typeof settingsRow?.registration_open === 'boolean' ? settingsRow.registration_open : true,
    event_logo_url: toPublicMediaUrl(typeof settingsRow?.event_logo_url === 'string' ? settingsRow.event_logo_url : null),
    sponsor_logo_urls: toPublicMediaUrls(settingsRow?.sponsor_logo_urls),
    business_settings: proxyBusinessSettingsMedia(parseBusinessSettings(settingsRow?.business_settings)),
  } as EventItem
}

const loadInitialCategories = async (eventId: string): Promise<RiderCategory[]> => {
  const { data, error } = await adminClient
    .from('categories')
    .select('id, year, year_min, year_max, capacity, gender, label, enabled, sequence_order')
    .eq('event_id', eventId)
    .order('sequence_order', { ascending: true })
    .order('year_min', { ascending: true })
    .order('gender', { ascending: true })

  if (error) return []
  return (data ?? []) as RiderCategory[]
}

const loadInitialLiveScore = async (
  eventId: string,
  categoryId: string,
  includePhotos: boolean,
  includeUpcoming: boolean
) => {
  const params = new URLSearchParams({
    category_id: categoryId,
    include_upcoming: includeUpcoming ? '1' : '0',
    include_photos: includePhotos ? '1' : '0',
  })
  const response = await getLiveScore(new Request(`https://racepushbike.local/api/public/events/${eventId}/live-score?${params.toString()}`), {
    params: Promise.resolve({ eventId }),
  })
  if (!response.ok) return null
  const json = (await response.json().catch(() => null)) as { data?: unknown } | null
  return json?.data ?? null
}

export default async function LiveScorePage({
  params,
}: {
  params: Promise<{ eventId: string; categoryId: string }>
}) {
  const { eventId, categoryId } = await params
  const [event, categories] = await Promise.all([
    loadInitialEvent(eventId),
    loadInitialCategories(eventId),
  ])
  const includePhotos = event?.business_settings?.show_rider_photos_public === true
  const initialLiveScore = await loadInitialLiveScore(eventId, categoryId, includePhotos, event?.status === 'LIVE')

  return (
    <LiveScoreClient
      eventId={eventId}
      categoryId={categoryId}
      initialEvent={event}
      initialCategories={categories}
      initialLiveScore={initialLiveScore}
    />
  )
}
