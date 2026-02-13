import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const auth = await requireJury(req, ['RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { motoId } = await params
  const body = await req.json()
  const { reason } = body ?? {}

  const { data: lockRow } = await adminClient.from('moto_locks').select('moto_id, event_id').eq('moto_id', motoId).maybeSingle()
  if (!lockRow) return NextResponse.json({ error: 'Moto not locked' }, { status: 404 })

  await adminClient
    .from('moto_locks')
    .update({
      is_locked: false,
      unlocked_by: auth.user.id,
      unlocked_at: new Date().toISOString(),
      reason: reason ?? null,
    })
    .eq('moto_id', motoId)

  await adminClient.from('audit_log').insert([
    {
      action_type: 'RESULT_UNLOCK',
      performed_by: auth.user.id,
      moto_id: motoId,
      event_id: lockRow.event_id,
      reason: reason ?? 'Unlock moto',
    },
  ])

  return NextResponse.json({ ok: true })
}

