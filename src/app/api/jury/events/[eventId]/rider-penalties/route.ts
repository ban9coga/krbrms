import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const juryAuth = await requireJury(req, ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'super_admin', 'admin'])
  if (!juryAuth.ok) {
    const adminAuth = await requireAdmin(req.headers.get('authorization'))
    if (!adminAuth.ok) return NextResponse.json({ error: juryAuth.error }, { status: juryAuth.status })
  }

  const { eventId } = await params
  const { data, error } = await adminClient
    .from('rider_penalties')
    .select('id, rider_id, rule_code, penalty_point, created_at, rider_penalty_approvals(approval_status)')
    .eq('event_id', eventId)
    .eq('stage', 'MOTO')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ data: data ?? [] })
}
