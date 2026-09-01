import { unstable_cache } from 'next/cache'
import { adminClient } from '../lib/auth'
import { applyBestTeamSettingsNormalization } from '../lib/bestTeam'
import type { BusinessSettings, EventItem, MotoItem, RiderCategory } from '../lib/eventService'
import { proxyBusinessSettingsMedia, toPublicMediaUrl, toPublicMediaUrls } from '../lib/publicMedia'

const ARCHIVE_TAG = 'public-finished-event-archives'

type ArchivePayload = {
  event?: EventItem
  settings?: {
    event_logo_url?: string | null
    sponsor_logo_urls?: unknown
    business_settings?: unknown
    registration_open?: boolean | null
    race_format_settings?: unknown
    display_theme?: unknown
  } | null
  categories?: RiderCategory[]
  riders?: Array<{ primary_category_id?: string | null }>
  motos?: MotoItem[]
}

export type PublicFinishedEventArchive = {
  event: EventItem
  categories: RiderCategory[]
  motos: MotoItem[]
  riderTotal: number
  slogan: string | null
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const parseArchive = (rawPayload: unknown): PublicFinishedEventArchive | null => {
  if (!rawPayload || typeof rawPayload !== 'object') return null
  const payload = rawPayload as ArchivePayload
  if (payload.event?.status !== 'FINISHED' || payload.event.is_public === false) return null

  const settings = payload.settings ?? null
  const raceFormat = asRecord(settings?.race_format_settings)
  const displayTheme = asRecord(settings?.display_theme)
  const business = applyBestTeamSettingsNormalization(
    asRecord(settings?.business_settings) as BusinessSettings
  )
  const riderCountByCategory = new Map<string, number>()
  for (const rider of payload.riders ?? []) {
    if (!rider.primary_category_id) continue
    riderCountByCategory.set(
      rider.primary_category_id,
      (riderCountByCategory.get(rider.primary_category_id) ?? 0) + 1
    )
  }
  const categories = (payload.categories ?? []).map((category) => {
    const filled = riderCountByCategory.get(category.id) ?? 0
    const capacity = typeof category.capacity === 'number' ? category.capacity : null
    return {
      ...category,
      filled,
      remaining: capacity === null ? null : Math.max(0, capacity - filled),
      is_full: capacity !== null && filled >= capacity,
    }
  })

  return {
    event: {
      ...payload.event,
      event_scope: raceFormat.event_scope === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC',
      registration_open: typeof settings?.registration_open === 'boolean' ? settings.registration_open : true,
      event_logo_url: toPublicMediaUrl(settings?.event_logo_url),
      sponsor_logo_urls: toPublicMediaUrls(settings?.sponsor_logo_urls),
      business_settings: proxyBusinessSettingsMedia(business),
    },
    categories,
    motos: payload.motos ?? [],
    riderTotal: (payload.riders ?? []).length,
    slogan: typeof displayTheme.slogan === 'string' ? displayTheme.slogan : null,
  }
}

const loadArchive = unstable_cache(
  async (eventId: string): Promise<PublicFinishedEventArchive | null> => {
    const { data: snapshot, error } = await adminClient
      .from('event_public_snapshots')
      .select('payload')
      .eq('event_id', eventId)
      .maybeSingle()
    if (error) return null
    return parseArchive(snapshot?.payload)
  },
  ['public-finished-event-archive'],
  { revalidate: false, tags: [ARCHIVE_TAG] }
)

const loadAllArchives = unstable_cache(
  async (): Promise<PublicFinishedEventArchive[]> => {
    const { data, error } = await adminClient.from('event_public_snapshots').select('payload')
    if (error) return []
    return (data ?? [])
      .map((snapshot) => parseArchive(snapshot.payload))
      .filter((archive): archive is PublicFinishedEventArchive => Boolean(archive))
      .sort((a, b) => new Date(b.event.event_date).getTime() - new Date(a.event.event_date).getTime())
  },
  ['public-finished-event-archive-list'],
  { revalidate: false, tags: [ARCHIVE_TAG] }
)

export const getPublicFinishedEventArchive = (eventId: string) => loadArchive(eventId)
export const getPublicFinishedEventArchives = () => loadAllArchives()
export const PUBLIC_FINISHED_EVENT_ARCHIVE_TAG = ARCHIVE_TAG
