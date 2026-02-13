import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { data, error } = await adminClient
    .from('event_penalty_rules')
    .select('id, event_id, code, description, penalty_point, applies_to_stage, is_active')
    .eq('event_id', eventId)
    .order('code', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId } = await params
  const body = await req.json()
  const { code, description, penalty_point, applies_to_stage, is_active } = body ?? {}
  if (!code || !penalty_point) {
    return NextResponse.json({ error: 'code and penalty_point required' }, { status: 400 })
  }
  const { data, error } = await adminClient
    .from('event_penalty_rules')
    .insert([
      {
        event_id: eventId,
        code,
        description: description ?? null,
        penalty_point,
        applies_to_stage: applies_to_stage ?? 'ALL',
        is_active: is_active ?? true,
      },
    ])
    .select('id, event_id, code, description, penalty_point, applies_to_stage, is_active')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
