import type { BusinessSettings, EventSponsor } from './eventService'

const EVENT_LOGOS_BUCKET = 'event-logos'
const EVENT_STAFF_BUCKET = 'event-staff'
const PUBLIC_STORAGE_MARKER = `/storage/v1/object/public/${EVENT_LOGOS_BUCKET}/`
const PROXY_PREFIX = `/api/media/${EVENT_LOGOS_BUCKET}/`
const STAFF_STORAGE_MARKER = `/storage/v1/object/public/${EVENT_STAFF_BUCKET}/`
const STAFF_PROXY_PREFIX = `/api/media/${EVENT_STAFF_BUCKET}/`

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
    const isStaffPhoto = url.pathname.includes(STAFF_STORAGE_MARKER)
    const marker = isStaffPhoto ? STAFF_STORAGE_MARKER : PUBLIC_STORAGE_MARKER
    const proxyPrefix = isStaffPhoto ? STAFF_PROXY_PREFIX : PROXY_PREFIX
    const markerIndex = url.pathname.indexOf(marker)
    if (markerIndex < 0) return raw

    const path = decodeURIComponent(url.pathname.slice(markerIndex + marker.length))
    const proxied = `${proxyPrefix}${encodeStoragePath(path)}`
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
  certificate_template_url: toPublicMediaUrl(settings.certificate_template_url),
  certificate_event_logo_url: toPublicMediaUrl(settings.certificate_event_logo_url),
  certificate_organizer_logo_url: toPublicMediaUrl(settings.certificate_organizer_logo_url),
  certificate_race_director_signature_url: toPublicMediaUrl(settings.certificate_race_director_signature_url),
  certificate_organizer_signature_url: toPublicMediaUrl(settings.certificate_organizer_signature_url),
  event_owner_photo_url: toPublicMediaUrl(settings.event_owner_photo_url),
  operating_committee_photo_url: toPublicMediaUrl(settings.operating_committee_photo_url),
  scoring_support_photo_url: toPublicMediaUrl(settings.scoring_support_photo_url),
  race_director_photo_url: toPublicMediaUrl(settings.race_director_photo_url),
  mc_photo_url: toPublicMediaUrl(settings.mc_photo_url),
  sponsors: Array.isArray(settings.sponsors) ? settings.sponsors.map(proxySponsor) : settings.sponsors,
})
