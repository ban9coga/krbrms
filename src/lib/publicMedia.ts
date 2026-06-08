import type { BusinessSettings, EventSponsor } from './eventService'

const EVENT_LOGOS_BUCKET = 'event-logos'
const PUBLIC_STORAGE_MARKER = `/storage/v1/object/public/${EVENT_LOGOS_BUCKET}/`
const PROXY_PREFIX = `/api/media/${EVENT_LOGOS_BUCKET}/`

const encodeStoragePath = (path: string) =>
  path
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/')

export const toPublicMediaUrl = (value: string | null | undefined): string | null => {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (!raw) return null
  if (raw.startsWith(PROXY_PREFIX)) return raw

  if (!/^https?:\/\//i.test(raw)) {
    if (raw.startsWith('events/')) return `${PROXY_PREFIX}${encodeStoragePath(raw)}`
    return raw
  }

  try {
    const url = new URL(raw)
    const markerIndex = url.pathname.indexOf(PUBLIC_STORAGE_MARKER)
    if (markerIndex < 0) return raw

    const path = decodeURIComponent(url.pathname.slice(markerIndex + PUBLIC_STORAGE_MARKER.length))
    const proxied = `${PROXY_PREFIX}${encodeStoragePath(path)}`
    return url.search ? `${proxied}${url.search}` : proxied
  } catch {
    return raw
  }
}

export const toPublicMediaUrls = (values: unknown): string[] =>
  Array.isArray(values)
    ? values
        .map((value) => (typeof value === 'string' ? toPublicMediaUrl(value) : null))
        .filter((value): value is string => Boolean(value))
    : []

const proxySponsor = (sponsor: EventSponsor): EventSponsor => ({
  ...sponsor,
  logo_url: toPublicMediaUrl(sponsor.logo_url),
  logo_dark_url: toPublicMediaUrl(sponsor.logo_dark_url),
})

export const proxyBusinessSettingsMedia = (settings: BusinessSettings): BusinessSettings => ({
  ...settings,
  registration_qris_image_url: toPublicMediaUrl(settings.registration_qris_image_url),
  registration_jersey_size_chart_url: toPublicMediaUrl(settings.registration_jersey_size_chart_url),
  sponsors: Array.isArray(settings.sponsors) ? settings.sponsors.map(proxySponsor) : settings.sponsors,
})
