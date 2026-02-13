import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'

export async function GET(_: Request, { params }: { params: Promise<{ riderId: string }> }) {
  const { riderId } = await params
  const { data, error } = await adminClient
    .from('rider_penalties')
    .select('id, rider_id, event_id, stage, rule_code, penalty_point, note, created_at')
    .eq('rider_id', riderId)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

export async function POST(req: Request, { params }: { params: Promise<{ riderId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { riderId } = await params
  const body = await req.json()
  const { event_id, stage = 'ALL', rule_code, penalty_point, note } = body ?? {}
  if (!event_id || !rule_code || !penalty_point) {
    return NextResponse.json({ error: 'event_id, rule_code, penalty_point required' }, { status: 400 })
  }

  const { data, error } = await adminClient
    .from('rider_penalties')
    .insert([
      {
        rider_id: riderId,
        event_id,
        stage,
        rule_code,
        penalty_point,
        note: note ?? null,
      },
    ])
    .select('id, rider_id, event_id, stage, rule_code, penalty_point, note, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
