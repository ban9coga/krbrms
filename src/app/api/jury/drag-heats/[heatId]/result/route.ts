import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { broadcastRaceState } from '../../../../../../lib/broadcastRaceState'
import { requireJury } from '../../../../../../services/juryAuth'

export async function POST(req: Request, { params }: { params: Promise<{ heatId: string }> }) {
  const { heatId } = await params
  const { data: heat, error: heatError } = await adminClient.from('drag_heats')
    .select('id, event_id, category_id, scoring_format, status, round_number, heat_number, run_number, lane_a_rider_id, lane_b_rider_id')
    .eq('id', heatId).maybeSingle()
  if (heatError || !heat) return NextResponse.json({ error: heatError?.message || 'Heat tidak ditemukan.' }, { status: 404 })
  const auth = await requireJury(req, ['FINISHER', 'CHECKER', 'RACE_DIRECTOR', 'ADMIN', 'SUPER_ADMIN'], heat.event_id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.role === 'RACE_DIRECTOR') return NextResponse.json({ error: 'Race Director hanya dapat melihat hasil.' }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Payload tidak valid.' }, { status: 400 })
  try {
    if (heat.scoring_format === 'DRAG_MANUAL') {
      const winnerId = typeof body.winner_rider_id === 'string' ? body.winner_rider_id : null
      if (!winnerId) return NextResponse.json({ error: 'Pilih rider pemenang.' }, { status: 400 })
      const { error } = await adminClient.rpc('record_drag_manual_heat_result', {
        p_heat_id: heatId, p_winner_rider_id: winnerId, p_outcome: 'FINISH', p_actor_id: auth.user.id,
        p_note: typeof body.note === 'string' ? body.note : null,
      })
      if (error) throw new Error(error.message)
    } else {
      const resultStatus = typeof body.result_status === 'string' ? body.result_status : ''
      const riderId = typeof body.rider_id === 'string' ? body.rider_id : ''
      if (!riderId) return NextResponse.json({ error: 'Pilih rider.' }, { status: 400 })
      const { data: sibling, error: siblingError } = await adminClient.from('drag_heats').select('id').eq('event_id', heat.event_id).eq('category_id', heat.category_id).eq('round_number', heat.round_number).eq('heat_number', heat.heat_number).neq('id', heat.id).limit(1)
      if (siblingError) throw new Error(siblingError.message)
      const bracketMode = heat.run_number === 1 && !(sibling ?? []).length
      const timingInput = {
        p_heat_id: heatId,
        p_rider_id: riderId,
        p_result_status: resultStatus,
        p_reaction_time_seconds: body.reaction_time_seconds === '' || body.reaction_time_seconds == null ? null : Number(body.reaction_time_seconds),
        p_elapsed_time_seconds: body.elapsed_time_seconds === '' || body.elapsed_time_seconds == null ? null : Number(body.elapsed_time_seconds),
        p_jump_start: body.jump_start === true,
        p_dns_called_twice: body.dns_called_twice === true,
        p_actor_id: auth.user.id,
        p_note: typeof body.note === 'string' ? body.note : null,
      }
      const { error } = await adminClient.rpc('save_drag_timing_match_run_result', {
        ...timingInput,
        p_run_number: bracketMode ? Number(body.run_number ?? 1) : Number(heat.run_number ?? 1),
      })
      if (error) throw new Error(error.message)
    }
    await broadcastRaceState(heat.event_id, heat.id, heat.category_id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Hasil Drag Race gagal disimpan.' }, { status: 400 })
  }
}
