import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { data, error } = await adminClient
    .from('event_settings')
    .select(
      'event_id, event_logo_url, sponsor_logo_urls, base_price, extra_price, scoring_rules, display_theme, race_format_settings, created_at, updated_at'
    )
    .eq('event_id', eventId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: data ?? null })
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
    scoring_rules,
    display_theme,
    race_format_settings,
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
          scoring_rules,
          display_theme,
          race_format_settings,
        },
      ],
      { onConflict: 'event_id' }
    )
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
