import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../lib/auth'

type DrawMode = 'internal_live_draw' | 'external_draw'

const normalizeDrawMode = (value: unknown): DrawMode =>
  value === 'external_draw' ? 'external_draw' : 'internal_live_draw'

const parseRaceFormatSettings = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

const extractRaceFormatSettings = (eventSettings: unknown) => {
  if (Array.isArray(eventSettings)) {
    return parseRaceFormatSettings(eventSettings[0]?.race_format_settings)
  }
  if (eventSettings && typeof eventSettings === 'object') {
    return parseRaceFormatSettings((eventSettings as Record<string, unknown>).race_format_settings)
  }
  return {}
}

const parseDrawModeFromEvent = (eventRow: Record<string, unknown>) => {
  const raceFormatSettings = extractRaceFormatSettings(eventRow.event_settings)
  return normalizeDrawMode(raceFormatSettings.draw_mode)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const auth = await requireAdmin(req.headers.get('authorization'))
  let query = adminClient
    .from('events')
    .select('id, name, location, event_date, status, is_public, created_at, updated_at, event_settings(race_format_settings)')
    .order('event_date', { ascending: false })
  if (status) {
    query = query.eq('status', status)
  }
  if (!auth.ok) {
    query = query.eq('is_public', true)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const normalizedData = (data ?? []).map((row) => {
    const drawMode = parseDrawModeFromEvent((row ?? {}) as Record<string, unknown>)
    const rowRecord = (row ?? {}) as Record<string, unknown>
    const { event_settings: _eventSettings, ...rest } = rowRecord
    return {
      ...rest,
      draw_mode: drawMode,
    }
  })
  return NextResponse.json({ data: normalizedData })
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { name, location, event_date, status = 'UPCOMING', is_public = true, draw_mode } = body ?? {}
  const drawMode = normalizeDrawMode(draw_mode)
  if (!name || !event_date) {
    return NextResponse.json({ error: 'name and event_date required' }, { status: 400 })
  }
  const { data, error } = await adminClient
    .from('events')
    .insert([{ name, location, event_date, status, is_public }])
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const { error: settingsError } = await adminClient.from('event_settings').upsert(
    [
      {
        event_id: data.id,
        race_format_settings: { draw_mode: drawMode },
      },
    ],
    { onConflict: 'event_id' }
  )

  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 400 })
  }

  return NextResponse.json({ data: { ...data, draw_mode: drawMode } })
}
