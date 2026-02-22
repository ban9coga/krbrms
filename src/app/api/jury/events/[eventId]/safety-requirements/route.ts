import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/auth'
import { requireJury } from '@/services/juryAuth'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireJury(req, ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { eventId } = await params

  const { data, error } = await adminClient
    .from('event_safety_requirements')
    .select('id, label, is_required, sort_order')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ data: data ?? [] })
}
