import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { data, error } = await adminClient
    .from('race_schedules')
    .select(
      `
        id,
        event_id,
        moto_id,
        schedule_time,
        end_time,
        track_number,
        motos (
          id,
          moto_name,
          moto_order,
          status,
          category_id
        )
      `
    )
    .eq('event_id', eventId)
    .order('schedule_time', { ascending: true, nullsFirst: false })
    .order('track_number', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId } = await params

  const body = await req.json()
  const { moto_id, schedule_time = null, end_time = null, track_number = null } = body ?? {}
  if (!moto_id) return NextResponse.json({ error: 'moto_id required' }, { status: 400 })

  const { data: moto, error: motoError } = await adminClient
    .from('motos')
    .select('id, event_id')
    .eq('id', moto_id)
    .single()

  if (motoError || !moto) return NextResponse.json({ error: 'Moto not found' }, { status: 404 })
  if (moto.event_id !== eventId) {
    return NextResponse.json({ error: 'Cross-event schedule is not allowed' }, { status: 400 })
  }

  const { data, error } = await adminClient
    .from('race_schedules')
    .insert([
      {
        event_id: eventId,
        moto_id,
        schedule_time,
        end_time,
        track_number,
      },
    ])
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
