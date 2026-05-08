import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const body = await req.json().catch(() => ({}))
  const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'Reset moto results'

  const { data: moto, error: motoError } = await adminClient
    .from('motos')
    .select('id, event_id, status')
    .eq('id', motoId)
    .maybeSingle()
  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })
  if (!moto) return NextResponse.json({ error: 'Moto not found' }, { status: 404 })

  const auth = await requireJury(req, ['RACE_DIRECTOR', 'super_admin', 'admin'], moto.event_id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const currentStatus = String(moto.status ?? '').toUpperCase()
  if (currentStatus === 'LOCKED') {
    return NextResponse.json({ error: 'Moto masih LOCKED. Unlock dulu sebelum reset results.' }, { status: 409 })
  }
  if (currentStatus === 'PROTEST_REVIEW') {
    return NextResponse.json({ error: 'Moto sedang PROTEST_REVIEW. Selesaikan review dulu sebelum reset.' }, { status: 409 })
  }

  const { data: riderAssignments, error: riderError } = await adminClient
    .from('moto_riders')
    .select('rider_id')
    .eq('moto_id', motoId)
  if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })

  const riderIds = Array.from(new Set((riderAssignments ?? []).map((row) => row.rider_id)))

  const { error: resultDeleteError } = await adminClient.from('results').delete().eq('moto_id', motoId)
  if (resultDeleteError) return NextResponse.json({ error: resultDeleteError.message }, { status: 400 })

  const { error: statusDeleteError } = await adminClient.from('rider_participation_status').delete().eq('moto_id', motoId)
  if (statusDeleteError) return NextResponse.json({ error: statusDeleteError.message }, { status: 400 })

  const { error: updateDeleteError } = await adminClient.from('rider_status_updates').delete().eq('moto_id', motoId)
  if (updateDeleteError) return NextResponse.json({ error: updateDeleteError.message }, { status: 400 })

  const { error: safetyDeleteError } = await adminClient.from('rider_safety_checks').delete().eq('moto_id', motoId)
  if (safetyDeleteError) return NextResponse.json({ error: safetyDeleteError.message }, { status: 400 })

  if (riderIds.length > 0) {
    const { data: penalties, error: penaltyLookupError } = await adminClient
      .from('rider_penalties')
      .select('id')
      .eq('event_id', moto.event_id)
      .eq('moto_id', motoId)
      .eq('stage', 'MOTO')
      .in('rider_id', riderIds)
    if (penaltyLookupError) return NextResponse.json({ error: penaltyLookupError.message }, { status: 400 })

    const penaltyIds = (penalties ?? []).map((row) => row.id)
    if (penaltyIds.length > 0) {
      const { error: approvalDeleteError } = await adminClient
        .from('rider_penalty_approvals')
        .delete()
        .in('penalty_id', penaltyIds)
      if (approvalDeleteError) return NextResponse.json({ error: approvalDeleteError.message }, { status: 400 })
    }

    const { error: penaltyDeleteError } = await adminClient
      .from('rider_penalties')
      .delete()
      .eq('event_id', moto.event_id)
      .eq('moto_id', motoId)
      .eq('stage', 'MOTO')
      .in('rider_id', riderIds)
    if (penaltyDeleteError) return NextResponse.json({ error: penaltyDeleteError.message }, { status: 400 })
  }

  const { error: motoUpdateError } = await adminClient
    .from('motos')
    .update({ status: 'LIVE', provisional_at: null, published_at: null, is_published: false })
    .eq('id', motoId)
  if (motoUpdateError) return NextResponse.json({ error: motoUpdateError.message }, { status: 400 })

  await adminClient.from('audit_log').insert([
    {
      action_type: 'RESULT_OVERRIDE',
      performed_by: auth.user.id,
      moto_id: motoId,
      event_id: moto.event_id,
      reason,
    },
  ])

  return NextResponse.json({ ok: true })
}
