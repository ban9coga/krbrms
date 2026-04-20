import { NextResponse } from 'next/server'
import { adminClient, getAccessibleEventIds, requireAdmin } from '../../../lib/auth'

type DrawMode = 'internal_live_draw' | 'external_draw'
type EventScope = 'PUBLIC' | 'INTERNAL'

const normalizeDrawMode = (value: unknown): DrawMode =>
  value === 'external_draw' ? 'external_draw' : 'internal_live_draw'

const normalizeEventScope = (value: unknown): EventScope =>
  value === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC'

const parseRaceFormatSettings = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const auth = await requireAdmin(req.headers.get('authorization'))
  let query = adminClient
    .from('events')
    .select('id, name, location, event_date, status, is_public, created_at, updated_at')
    .order('event_date', { ascending: false })
  if (status) {
    query = query.eq('status', status)
  }
  if (!auth.ok) {
    query = query.eq('is_public', true)
  } else if (auth.role !== 'SUPER_ADMIN') {
    const accessibleEventIds = await getAccessibleEventIds(auth.user.id, ['ADMIN', 'SUPER_ADMIN'])
    if (accessibleEventIds.length === 0) {
      return NextResponse.json({ data: [] })
    }
    query = query.in('id', accessibleEventIds)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const events = (data ?? []) as Array<Record<string, unknown>>
  const eventIds = events.map((row) => String(row.id ?? '')).filter(Boolean)
  const drawModeByEventId = new Map<string, DrawMode>()
  const eventScopeByEventId = new Map<string, EventScope>()

  if (eventIds.length > 0) {
    const { data: settingsRows, error: settingsError } = await adminClient
      .from('event_settings')
      .select('event_id, race_format_settings, updated_at')
      .in('event_id', eventIds)
      .order('updated_at', { ascending: false })
    if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 400 })

    for (const row of settingsRows ?? []) {
      const eventId = typeof row.event_id === 'string' ? row.event_id : null
      if (!eventId || drawModeByEventId.has(eventId)) continue
      const settings = parseRaceFormatSettings(row.race_format_settings)
      drawModeByEventId.set(eventId, normalizeDrawMode(settings.draw_mode))
      if (settings.event_scope === 'INTERNAL' || settings.event_scope === 'PUBLIC') {
        eventScopeByEventId.set(eventId, normalizeEventScope(settings.event_scope))
      }
    }
  }

  const normalizedData = events.map((row) => {
    const eventId = String(row.id ?? '')
    const fallbackScope = row.is_public === false ? 'INTERNAL' : 'PUBLIC'
    return {
      ...row,
      draw_mode: drawModeByEventId.get(eventId) ?? 'internal_live_draw',
      event_scope: eventScopeByEventId.get(eventId) ?? fallbackScope,
    }
  })

  return NextResponse.json({ data: normalizedData })
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Only super admin can create events' }, { status: 403 })
  }
  const body = await req.json()
  const { name, location, event_date, status = 'UPCOMING', is_public, draw_mode, event_scope } = body ?? {}
  const drawMode = normalizeDrawMode(draw_mode)
  const normalizedIsPublic = is_public === undefined ? true : Boolean(is_public)
  const eventScope = normalizeEventScope(event_scope ?? (normalizedIsPublic ? 'PUBLIC' : 'INTERNAL'))
  if (!name || !event_date) {
    return NextResponse.json({ error: 'name and event_date required' }, { status: 400 })
  }
  const { data, error } = await adminClient
    .from('events')
    .insert([{ name, location, event_date, status, is_public: normalizedIsPublic }])
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const { error: settingsError } = await adminClient.from('event_settings').upsert(
    [
      {
        event_id: data.id,
        race_format_settings: { draw_mode: drawMode, event_scope: eventScope },
      },
    ],
    { onConflict: 'event_id' }
  )

  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 400 })
  }

  return NextResponse.json({ data: { ...data, draw_mode: drawMode, event_scope: eventScope } })
}
