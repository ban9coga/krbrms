import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'
import type { BusinessSettings } from '../../../../../lib/eventService'
import { proxyBusinessSettingsMedia, toPublicMediaUrl, toPublicMediaUrls } from '../../../../../lib/publicMedia'

const normalizeBusinessSettings = (value: unknown): BusinessSettings => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as BusinessSettings
  }
  return {}
}

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { data, error } = await adminClient
    .from('event_settings')
    .select(
      'event_id, event_logo_url, sponsor_logo_urls, base_price, extra_price, registration_open, require_jersey_size, scoring_rules, display_theme, race_format_settings, business_settings, created_at, updated_at'
    )
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const row = (data ?? [])[0] ?? null
  return NextResponse.json({
    data: row
      ? {
          ...row,
          event_logo_url: toPublicMediaUrl(row.event_logo_url),
          sponsor_logo_urls: toPublicMediaUrls(row.sponsor_logo_urls),
          business_settings: proxyBusinessSettingsMedia(normalizeBusinessSettings(row.business_settings)),
        }
      : null,
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    event_logo_url,
    sponsor_logo_urls,
    base_price,
    extra_price,
    registration_open,
    require_jersey_size,
    scoring_rules,
    display_theme,
    race_format_settings,
    business_settings,
  } = body ?? {}

  const { data: existingRows, error: existingError } = await adminClient
    .from('event_settings')
    .select('registration_open')
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 })
  const existingRow = (existingRows ?? [])[0] ?? null
  const normalizedRegistrationOpen =
    typeof registration_open === 'boolean'
      ? registration_open
      : typeof existingRow?.registration_open === 'boolean'
      ? existingRow.registration_open
      : true

  const { data, error } = await adminClient
    .from('event_settings')
    .upsert(
      [
        {
          event_id: eventId,
          event_logo_url,
          sponsor_logo_urls,
          base_price,
          extra_price,
          registration_open: normalizedRegistrationOpen,
          require_jersey_size,
          scoring_rules,
          display_theme,
          race_format_settings,
          business_settings: normalizeBusinessSettings(business_settings),
        },
      ],
      { onConflict: 'event_id' }
    )
    .select('*')
    .limit(1)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: (data ?? [])[0] ?? null })
}
