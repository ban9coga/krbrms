import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const auth = await requireJury(req, ['RACE_DIRECTOR'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { motoId } = await params
  const body = await req.json().catch(() => ({}))
  const { reason } = body ?? {}

  const { data: moto } = await adminClient.from('motos').select('id, event_id, status').eq('id', motoId).maybeSingle()
  if (!moto) return NextResponse.json({ error: 'Moto not found' }, { status: 404 })

  const current = (moto.status ?? '').toUpperCase()
  if (current !== 'PROVISIONAL' && current !== 'PROTEST_REVIEW') {
    return NextResponse.json({ error: 'Moto must be PROVISIONAL or PROTEST_REVIEW before locking.' }, { status: 409 })
  }

  await adminClient
    .from('motos')
    .update({ status: 'LOCKED' })
    .eq('id', motoId)

  await adminClient
    .from('moto_locks')
    .upsert(
      [
        {
          moto_id: motoId,
          event_id: moto.event_id,
          is_locked: true,
          locked_by: auth.user.id,
          locked_at: new Date().toISOString(),
          reason: reason ?? 'Auto lock after submit',
        },
      ],
      { onConflict: 'moto_id' }
    )

  await adminClient.from('audit_log').insert([
    {
      action_type: 'RESULT_OVERRIDE',
      performed_by: auth.user.id,
      moto_id: motoId,
      event_id: moto.event_id,
      reason: reason ?? 'Auto lock after submit',
    },
  ])

  return NextResponse.json({ ok: true })
}
