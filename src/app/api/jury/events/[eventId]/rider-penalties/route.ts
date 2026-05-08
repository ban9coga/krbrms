import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { searchParams } = new URL(req.url)
  const motoId = searchParams.get('moto_id')
  const juryAuth = await requireJury(req, ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'super_admin', 'admin'], eventId)
  if (!juryAuth.ok) {
    const adminAuth = await requireAdmin(req.headers.get('authorization'), eventId)
    if (!adminAuth.ok) return NextResponse.json({ error: juryAuth.error }, { status: juryAuth.status })
  }
  let query = adminClient
    .from('rider_penalties')
    .select('id, rider_id, moto_id, rule_code, penalty_point, created_at, rider_penalty_approvals(approval_status)')
    .eq('event_id', eventId)
    .eq('stage', 'MOTO')
    .order('created_at', { ascending: false })
  if (motoId) query = query.eq('moto_id', motoId)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ data: data ?? [] })
}
