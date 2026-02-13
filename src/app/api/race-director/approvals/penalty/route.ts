import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../lib/auth'
import { requireJury } from '../../../../../services/juryAuth'

export async function POST(req: Request) {
  const auth = await requireJury(req, ['RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()
  const { penalty_id, decision, reason } = body ?? {}
  if (!penalty_id || !decision) return NextResponse.json({ error: 'penalty_id and decision required' }, { status: 400 })

  const { data: penalty, error } = await adminClient
    .from('rider_penalties')
    .select('id, rider_id, event_id')
    .eq('id', penalty_id)
    .maybeSingle()

  if (error || !penalty) return NextResponse.json({ error: 'Penalty not found' }, { status: 404 })

  const approval_status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'

  await adminClient
    .from('rider_penalty_approvals')
    .update({
      approval_status,
      approved_by: auth.user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('penalty_id', penalty_id)

  await adminClient.from('audit_log').insert([
    {
      action_type: 'PENALTY_APPROVAL',
      performed_by: auth.user.id,
      rider_id: penalty.rider_id,
      event_id: penalty.event_id,
      reason: reason ?? null,
    },
  ])

  return NextResponse.json({ ok: true })
}
