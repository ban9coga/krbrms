import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId } = await params

  const { data, error } = await adminClient
    .from('event_safety_requirements')
    .select('id, event_id, label, is_required, sort_order, penalty_code')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: data ?? [] })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId } = await params
  const body = await req.json()
  const { id, penalty_code } = body ?? {}

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data, error } = await adminClient
    .from('event_safety_requirements')
    .update({ penalty_code: penalty_code || null })
    .eq('id', id)
    .eq('event_id', eventId)
    .select('id, event_id, label, is_required, sort_order, penalty_code')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
