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
    .from('event_approval_modes')
    .select('event_id, approval_mode')
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: data ?? { event_id: eventId, approval_mode: 'AUTO' } })
}

export async function PATCH(req: Request) {
  const auth = await requireJury(req, ['RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()
  const { event_id, approval_mode } = body ?? {}
  if (!event_id || !approval_mode) {
    return NextResponse.json({ error: 'event_id and approval_mode required' }, { status: 400 })
  }

  const { data, error } = await adminClient
    .from('event_approval_modes')
    .upsert([{ event_id, approval_mode }], { onConflict: 'event_id' })
    .select('event_id, approval_mode')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
