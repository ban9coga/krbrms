import { NextResponse } from 'next/server'
import { adminClient } from '../../../../lib/auth'
import { requireJury } from '../../../../services/juryAuth'

export async function GET(req: Request) {
  const auth = await requireJury(req, ['RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('event_id')
  if (!eventId) return NextResponse.json({ error: 'event_id required' }, { status: 400 })

  const { data, error } = await adminClient
    .from('audit_log')
    .select('id, action_type, performed_by, rider_id, moto_id, event_id, reason, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: data ?? [] })
}
