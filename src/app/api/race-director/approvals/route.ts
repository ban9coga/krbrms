import { NextResponse } from 'next/server'
import { adminClient } from '../../../../lib/auth'
import { requireJury } from '../../../../services/juryAuth'

export async function GET(req: Request) {
  const auth = await requireJury(req, ['RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data: statusUpdates } = await adminClient
    .from('rider_status_updates')
    .select('id, event_id, rider_id, proposed_status, approval_status, created_by, created_at')
    .eq('event_id', eventId)
    .eq('approval_status', 'PENDING')

  const { data: penaltyApprovals } = await adminClient
    .from('rider_penalty_approvals')
    .select('id, penalty_id, approval_status, created_at')
    .eq('approval_status', 'PENDING')

  const penaltyIds = (penaltyApprovals ?? []).map((p) => p.penalty_id)
  const { data: penalties } = penaltyIds.length
    ? await adminClient
        .from('rider_penalties')
        .select('id, rider_id, event_id, stage, rule_code, penalty_point, note, created_at')
        .in('id', penaltyIds)
        .eq('event_id', eventId)
    : { data: [] }

  return NextResponse.json({
    status_updates: statusUpdates ?? [],
    penalties: penalties ?? [],
    penalty_approvals: penaltyApprovals ?? [],
  })
}
