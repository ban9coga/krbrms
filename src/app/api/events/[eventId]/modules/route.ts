import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { data, error } = await adminClient
    .from('event_feature_flags')
    .select('event_id, penalty_enabled, absent_enabled')
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId } = await params
  const body = await req.json()
  const { penalty_enabled, absent_enabled } = body ?? {}

  const { data, error } = await adminClient
    .from('event_feature_flags')
    .upsert(
      [{ event_id: eventId, penalty_enabled: !!penalty_enabled, absent_enabled: !!absent_enabled }],
      { onConflict: 'event_id' }
    )
    .select('event_id, penalty_enabled, absent_enabled')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
