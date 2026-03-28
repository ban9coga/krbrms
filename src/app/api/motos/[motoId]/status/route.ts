import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../lib/auth'
import { requireJury } from '../../../../../services/juryAuth'

const allowedTargets = ['LOCKED', 'PROVISIONAL'] as const
type TargetStatus = (typeof allowedTargets)[number]

const fetchMotoRiderIds = async (motoId: string) => {
  const { data: gates } = await adminClient
    .from('moto_gate_positions')
    .select('rider_id')
    .eq('moto_id', motoId)
  if (gates && gates.length > 0) {
    return Array.from(new Set(gates.map((g) => g.rider_id)))
  }
  const { data: assignments } = await adminClient
    .from('moto_riders')
    .select('rider_id')
    .eq('moto_id', motoId)
  return Array.from(new Set((assignments ?? []).map((a) => a.rider_id)))
}

const hasPendingApprovals = async (eventId: string, riderIds: string[]) => {
  if (riderIds.length === 0) return false

  const { data: pendingStatus } = await adminClient
    .from('rider_status_updates')
    .select('id')
    .eq('event_id', eventId)
    .eq('approval_status', 'PENDING')
    .in('rider_id', riderIds)

  if (pendingStatus && pendingStatus.length > 0) return true

  const { data: penalties } = await adminClient
    .from('rider_penalties')
    .select('id')
    .eq('event_id', eventId)
    .in('rider_id', riderIds)

  const penaltyIds = (penalties ?? []).map((p) => p.id)
  if (penaltyIds.length === 0) return false

  const { data: pendingPenalty } = await adminClient
    .from('rider_penalty_approvals')
    .select('id')
    .eq('approval_status', 'PENDING')
    .in('penalty_id', penaltyIds)

  return !!pendingPenalty?.length
}

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const body = await req.json().catch(() => ({}))
  const status = body?.status as TargetStatus | undefined
  if (!status || !allowedTargets.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { data: moto, error } = await adminClient
    .from('motos')
    .select('id, status, event_id')
    .eq('id', motoId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!moto) return NextResponse.json({ error: 'Moto not found' }, { status: 404 })
  const auth = await requireJury(req, ['RACE_DIRECTOR', 'super_admin', 'admin'], moto.event_id as string)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const current = (moto.status as string | null)?.toUpperCase() ?? ''

  if (current === 'LOCKED' && status === 'LOCKED') {
    return NextResponse.json({ error: 'Moto already locked. No modification allowed.' }, { status: 409 })
  }

  if (status === 'LOCKED') {
    if (current === 'UPCOMING') {
      return NextResponse.json({ error: 'Invalid transition: UPCOMING cannot go to LOCKED.' }, { status: 400 })
    }
    if (current === 'LIVE') {
      return NextResponse.json({ error: 'Invalid transition: LIVE cannot go directly to LOCKED.' }, { status: 400 })
    }
    if (!['PROVISIONAL', 'PROTEST_REVIEW'].includes(current)) {
      return NextResponse.json({ error: 'Invalid status transition.' }, { status: 400 })
    }

    const riderIds = await fetchMotoRiderIds(motoId)
    const pending = await hasPendingApprovals(moto.event_id as string, riderIds)
    if (pending) {
      return NextResponse.json({ error: 'Cannot lock moto. Pending approvals exist.' }, { status: 400 })
    }
  }

  if (status === 'PROVISIONAL') {
    if (current !== 'LOCKED') {
      return NextResponse.json({ error: 'Invalid status transition.' }, { status: 400 })
    }
    if (auth.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unlock requires super_admin.' }, { status: 403 })
    }
  }

  const { error: updateError } = await adminClient.from('motos').update({ status }).eq('id', motoId)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

  if (status === 'LOCKED') {
    await adminClient
      .from('moto_locks')
      .upsert(
        [
          {
            moto_id: motoId,
            event_id: moto.event_id,
            is_locked: true,
            locked_by: auth.user.id,
            locked_at: new Date().toISOString(),
          },
        ],
        { onConflict: 'moto_id' }
      )
  }
  if (status === 'PROVISIONAL') {
    await adminClient
      .from('moto_locks')
      .update({
        is_locked: false,
        unlocked_by: auth.user.id,
        unlocked_at: new Date().toISOString(),
      })
      .eq('moto_id', motoId)
  }

  return NextResponse.json({ ok: true })
}
