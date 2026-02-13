import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string; scheduleId: string }> }
) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId, scheduleId } = await params

  const body = await req.json()
  const { schedule_time, end_time, track_number } = body ?? {}

  const { data: existing, error: existingError } = await adminClient
    .from('race_schedules')
    .select('id, event_id')
    .eq('id', scheduleId)
    .single()

  if (existingError || !existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.event_id !== eventId) {
    return NextResponse.json({ error: 'Cross-event update is not allowed' }, { status: 400 })
  }

  const { data, error } = await adminClient
    .from('race_schedules')
    .update({ schedule_time, end_time, track_number })
    .eq('id', scheduleId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ eventId: string; scheduleId: string }> }
) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId, scheduleId } = await params

  const { data: existing, error: existingError } = await adminClient
    .from('race_schedules')
    .select('id, event_id')
    .eq('id', scheduleId)
    .single()

  if (existingError || !existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (existing.event_id !== eventId) {
    return NextResponse.json({ error: 'Cross-event delete is not allowed' }, { status: 400 })
  }

  const { error } = await adminClient.from('race_schedules').delete().eq('id', scheduleId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
