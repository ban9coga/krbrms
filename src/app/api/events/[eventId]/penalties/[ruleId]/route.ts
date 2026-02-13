import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string; ruleId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId, ruleId } = await params
  const body = await req.json()
  const { code, description, penalty_point, applies_to_stage, is_active } = body ?? {}

  const { data, error } = await adminClient
    .from('event_penalty_rules')
    .update({ code, description, penalty_point, applies_to_stage, is_active })
    .eq('id', ruleId)
    .eq('event_id', eventId)
    .select('id, event_id, code, description, penalty_point, applies_to_stage, is_active')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ eventId: string; ruleId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId, ruleId } = await params
  const { error } = await adminClient.from('event_penalty_rules').delete().eq('id', ruleId).eq('event_id', eventId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
