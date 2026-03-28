import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'
import type { BusinessSettings } from '../../../../../lib/eventService'

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
      'event_id, event_logo_url, sponsor_logo_urls, base_price, extra_price, ffa_mix_min_year, ffa_mix_max_year, require_jersey_size, scoring_rules, display_theme, race_format_settings, business_settings, created_at, updated_at'
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
          business_settings: normalizeBusinessSettings(row.business_settings),
        }
      : null,
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId } = await params

  const body = await req.json()
  const {
    event_logo_url,
    sponsor_logo_urls,
    base_price,
    extra_price,
    ffa_mix_min_year,
    ffa_mix_max_year,
    require_jersey_size,
    scoring_rules,
    display_theme,
    race_format_settings,
    business_settings,
  } = body ?? {}

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
          ffa_mix_min_year,
          ffa_mix_max_year,
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
