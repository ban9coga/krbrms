import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../../lib/auth'
import { broadcastRaceState } from '../../../../../../../lib/broadcastRaceState'

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const heatId = typeof body?.heat_id === 'string' ? body.heat_id : ''
  const winnerId = typeof body?.winner_rider_id === 'string' ? body.winner_rider_id : ''
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
  if (!heatId || !reason) {
    return NextResponse.json({ error: 'Heat dan alasan koreksi wajib diisi.' }, { status: 400 })
  }

  const { data: heat, error: heatError } = await adminClient.from('drag_heats')
    .select('id, category_id, scoring_format, round_number, heat_number, run_number')
    .eq('id', heatId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (heatError || !heat) return NextResponse.json({ error: heatError?.message || 'Heat tidak ditemukan.' }, { status: 404 })
  if (heat.scoring_format === 'DRAG_TIMING') {
    const { data: sibling, error: siblingError } = await adminClient.from('drag_heats').select('id')
      .eq('event_id', eventId).eq('category_id', heat.category_id).eq('round_number', heat.round_number)
      .eq('heat_number', heat.heat_number).neq('id', heat.id).limit(1)
    if (siblingError) return NextResponse.json({ error: siblingError.message }, { status: 400 })
    if (heat.run_number !== 1 || (sibling ?? []).length) {
      return NextResponse.json({ error: 'Reset hanya tersedia untuk bracket timing baru.' }, { status: 409 })
    }
    const { data: invalidated, error } = await adminClient.rpc('reset_drag_timing_bracket_heat', {
      p_heat_id: heatId, p_actor_id: auth.user.id, p_reason: reason,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 409 })
    await broadcastRaceState(eventId, heatId, heat.category_id)
    return NextResponse.json({ data: { invalidated_heats: Number(invalidated ?? 0), reset: true } })
  }
  if (heat.scoring_format !== 'DRAG_MANUAL') return NextResponse.json({ error: 'Kategori ini bukan format Drag Race.' }, { status: 409 })
  if (!winnerId) return NextResponse.json({ error: 'Pilih pemenang baru.' }, { status: 400 })

  const { data: invalidated, error } = await adminClient.rpc('correct_drag_manual_heat_result', {
    p_heat_id: heatId,
    p_winner_rider_id: winnerId,
    p_outcome: 'FINISH',
    p_actor_id: auth.user.id,
    p_reason: reason,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 409 })

  await broadcastRaceState(eventId, heatId, heat.category_id)
  return NextResponse.json({ data: { invalidated_heats: Number(invalidated ?? 0) } })
}
