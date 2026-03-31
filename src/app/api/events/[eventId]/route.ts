import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../lib/auth'
import { computeQualificationAndStore, computeStageAdvances, generateStageMotos } from '../../../../services/advancedRaceAuto'
import type { BusinessSettings } from '../../../../lib/eventService'
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

const parseBusinessSettings = (value: unknown): BusinessSettings => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as BusinessSettings
  }
  return {}
}

const getLatestRaceFormatSettings = async (eventId: string) => {
  const { data, error } = await adminClient
    .from('event_settings')
    .select('race_format_settings, event_logo_url, sponsor_logo_urls, business_settings, updated_at')
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (error) return { error }
  const row = (data ?? [])[0]
  return {
    data: parseRaceFormatSettings(row?.race_format_settings),
    eventLogoUrl: typeof row?.event_logo_url === 'string' ? row.event_logo_url : null,
    sponsorLogoUrls: Array.isArray(row?.sponsor_logo_urls)
      ? row.sponsor_logo_urls.filter((item: unknown) => typeof item === 'string')
      : [],
    businessSettings: parseBusinessSettings(row?.business_settings),
    error: null,
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'))
  const { data, error } = await adminClient
    .from('events')
    .select('id, name, location, event_date, status, is_public, created_at, updated_at')
    .eq('id', eventId)
    .limit(1)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const eventRow = (data ?? [])[0]
  if (!eventRow) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!auth.ok && eventRow.is_public === false) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const formatResult = await getLatestRaceFormatSettings(eventId)
  if (formatResult.error) return NextResponse.json({ error: formatResult.error.message }, { status: 400 })
  const drawMode = normalizeDrawMode(formatResult.data?.draw_mode)
  const eventScope = normalizeEventScope(
    formatResult.data?.event_scope ?? (eventRow.is_public === false ? 'INTERNAL' : 'PUBLIC')
  )
  return NextResponse.json({
    data: {
      ...eventRow,
      draw_mode: drawMode,
      event_scope: eventScope,
      event_logo_url: formatResult.eventLogoUrl,
      sponsor_logo_urls: formatResult.sponsorLogoUrls,
      business_settings: formatResult.businessSettings,
    },
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId } = await params
  const body = await req.json()
  const { name, location, event_date, status, is_public, draw_mode, event_scope } = body ?? {}
  const requestedDrawMode = draw_mode == null ? null : normalizeDrawMode(draw_mode)
  const requestedEventScope = event_scope == null ? null : normalizeEventScope(event_scope)
  let existingRaceFormatSettings: Record<string, unknown> = {}
  const eventUpdatePayload: Record<string, unknown> = {}
  if (name !== undefined) eventUpdatePayload.name = name
  if (location !== undefined) eventUpdatePayload.location = location
  if (event_date !== undefined) eventUpdatePayload.event_date = event_date
  if (status !== undefined) eventUpdatePayload.status = status
  if (is_public !== undefined) eventUpdatePayload.is_public = is_public

  if (requestedDrawMode || requestedEventScope) {
    const formatResult = await getLatestRaceFormatSettings(eventId)
    if (formatResult.error) return NextResponse.json({ error: formatResult.error.message }, { status: 400 })
    existingRaceFormatSettings = formatResult.data ?? {}

    const currentDrawMode = normalizeDrawMode(existingRaceFormatSettings.draw_mode)
    if (requestedDrawMode && currentDrawMode !== requestedDrawMode) {
      const { data: existingMoto, error: motoCheckError } = await adminClient
        .from('motos')
        .select('id')
        .eq('event_id', eventId)
        .limit(1)
      if (motoCheckError) return NextResponse.json({ error: motoCheckError.message }, { status: 400 })
      if ((existingMoto ?? []).length > 0) {
        return NextResponse.json(
          { error: 'Draw mode cannot be changed after motos are created. Reset motos first.' },
          { status: 409 }
        )
      }
    }
  }

  const { data: beforeRows } = await adminClient.from('events').select('status').eq('id', eventId).limit(1)
  const beforeRow = (beforeRows ?? [])[0]
  let updatedEvent: Record<string, unknown> | null = null
  if (Object.keys(eventUpdatePayload).length > 0) {
    const { data, error } = await adminClient
      .from('events')
      .update(eventUpdatePayload)
      .eq('id', eventId)
      .select('*')
      .limit(1)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    updatedEvent = ((data ?? [])[0] as Record<string, unknown> | undefined) ?? null
  } else {
    const { data, error } = await adminClient.from('events').select('*').eq('id', eventId).limit(1)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    updatedEvent = ((data ?? [])[0] as Record<string, unknown> | undefined) ?? null
  }
  if (!updatedEvent) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  if (requestedDrawMode || requestedEventScope) {
    const mergedRaceFormatSettings = {
      ...existingRaceFormatSettings,
      ...(requestedDrawMode ? { draw_mode: requestedDrawMode } : {}),
      ...(requestedEventScope ? { event_scope: requestedEventScope } : {}),
    }
    const { error: settingsWriteError } = await adminClient.from('event_settings').upsert(
      [
        {
          event_id: eventId,
          race_format_settings: mergedRaceFormatSettings,
        },
      ],
      { onConflict: 'event_id' }
    )
    if (settingsWriteError) return NextResponse.json({ error: settingsWriteError.message }, { status: 400 })
  }

  if (status === 'LIVE' && beforeRow?.status !== 'LIVE') {
    try {
      const { data: configs } = await adminClient
        .from('race_stage_config')
        .select('category_id, enabled')
        .eq('event_id', eventId)
        .eq('enabled', true)
      for (const cfg of configs ?? []) {
        const result = await computeQualificationAndStore(eventId, cfg.category_id)
        if (result.ok) {
          await generateStageMotos(eventId, cfg.category_id)
          await computeStageAdvances(eventId, cfg.category_id)
        } else {
          console.warn(`Advanced race auto skipped: ${result.warning ?? 'unknown'}`)
        }
      }
    } catch (err) {
      console.warn('Advanced race auto failed', err)
    }
  }
  return NextResponse.json({
    data: {
      ...updatedEvent,
      ...(requestedDrawMode ? { draw_mode: requestedDrawMode } : {}),
      ...(requestedEventScope ? { event_scope: requestedEventScope } : {}),
    },
  })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(_.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId } = await params
  const { error } = await adminClient.from('events').delete().eq('id', eventId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

