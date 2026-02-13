import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { data, error } = await adminClient
    .from('rider_participation_status')
    .select('id, event_id, rider_id, participation_status, registration_order')
    .eq('event_id', eventId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId } = await params
  const body = await req.json()
  const { rider_id, participation_status, registration_order = 0 } = body ?? {}
  if (!rider_id || !participation_status) {
    return NextResponse.json({ error: 'rider_id and participation_status required' }, { status: 400 })
  }

  const { data, error } = await adminClient
    .from('rider_participation_status')
    .upsert(
      [
        {
          event_id: eventId,
          rider_id,
          participation_status,
          registration_order,
        },
      ],
      { onConflict: 'event_id,rider_id' }
    )
    .select('id, event_id, rider_id, participation_status, registration_order')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
