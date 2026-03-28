import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

export async function GET(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const { data: moto } = await adminClient.from('motos').select('event_id').eq('id', motoId).maybeSingle()
  const auth = await requireJury(req, ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'super_admin'], moto?.event_id ?? null)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { data } = await adminClient
    .from('moto_locks')
    .select('moto_id, is_locked, locked_at')
    .eq('moto_id', motoId)
    .eq('is_locked', true)
    .maybeSingle()
  return NextResponse.json({ data: data ?? null })
}
