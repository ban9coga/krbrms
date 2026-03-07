import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../lib/auth'
import { computeQualificationAndStore, computeStageAdvances, generateStageMotos } from '../../../../services/advancedRaceAuto'

type DrawMode = 'internal_live_draw' | 'external_draw'

const normalizeDrawMode = (value: unknown): DrawMode =>
  value === 'external_draw' ? 'external_draw' : 'internal_live_draw'

const parseRaceFormatSettings = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

const getLatestRaceFormatSettings = async (eventId: string) => {
  const { data, error } = await adminClient
    .from('event_settings')
    .select('race_format_settings, updated_at')
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (error) return { error }
  const row = (data ?? [])[0]
  return { data: parseRaceFormatSettings(row?.race_format_settings), error: null }
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'))
  const { data, error } = await adminClient
    .from('events')
    .select('id, name, location, event_date, status, is_public, created_at, updated_at')
    .eq('id', eventId)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!auth.ok && data?.is_public === false) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const formatResult = await getLatestRaceFormatSettings(eventId)
  if (formatResult.error) return NextResponse.json({ error: formatResult.error.message }, { status: 400 })
  const drawMode = normalizeDrawMode(formatResult.data?.draw_mode)
  return NextResponse.json({ data: { ...(data ?? {}), draw_mode: drawMode } })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId } = await params
  const body = await req.json()
  const { name, location, event_date, status, is_public, draw_mode } = body ?? {}
  const requestedDrawMode = draw_mode == null ? null : normalizeDrawMode(draw_mode)
  let existingRaceFormatSettings: Record<string, unknown> = {}

  if (requestedDrawMode) {
    const formatResult = await getLatestRaceFormatSettings(eventId)
    if (formatResult.error) return NextResponse.json({ error: formatResult.error.message }, { status: 400 })
    existingRaceFormatSettings = formatResult.data ?? {}

    const currentDrawMode = normalizeDrawMode(existingRaceFormatSettings.draw_mode)
    if (currentDrawMode !== requestedDrawMode) {
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

  const { data: beforeRow } = await adminClient.from('events').select('status').eq('id', eventId).maybeSingle()
  const { data, error } = await adminClient
    .from('events')
    .update({ name, location, event_date, status, is_public })
    .eq('id', eventId)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (requestedDrawMode) {
    const mergedRaceFormatSettings = {
      ...existingRaceFormatSettings,
      draw_mode: requestedDrawMode,
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
      ...data,
      ...(requestedDrawMode ? { draw_mode: requestedDrawMode } : {}),
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
