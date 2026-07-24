import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

const MOTO_STATE_SELECT = 'id, category_id, moto_name, moto_order, status, checker_prep_ready_at'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireJury(req, ['CHECKER', 'FINISHER', 'MC', 'RACE_DIRECTOR', 'ADMIN', 'super_admin'], eventId)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await adminClient
    .from('motos')
    .select(MOTO_STATE_SELECT)
    .eq('event_id', eventId)
    .order('moto_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json(
    { data: data ?? [] },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  )
}
