import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireJury(req, ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { eventId } = await params
  const { data, error } = await adminClient
    .from('event_penalty_rules')
    .select('id, event_id, code, description, penalty_point, applies_to_stage, is_active')
    .eq('event_id', eventId)
    .eq('is_active', true)
    .in('applies_to_stage', ['MOTO', 'ALL'])
    .order('code', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
