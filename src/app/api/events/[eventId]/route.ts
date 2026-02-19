import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../lib/auth'
import { computeQualificationAndStore, computeStageAdvances, generateStageMotos } from '../../../../services/advancedRaceAuto'

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
  return NextResponse.json({ data })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId } = await params
  const body = await req.json()
  const { name, location, event_date, status, is_public } = body ?? {}
  const { data: beforeRow } = await adminClient.from('events').select('status').eq('id', eventId).maybeSingle()
  const { data, error } = await adminClient
    .from('events')
    .update({ name, location, event_date, status, is_public })
    .eq('id', eventId)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

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
  return NextResponse.json({ data })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(_.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId } = await params
  const { error } = await adminClient.from('events').delete().eq('id', eventId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
