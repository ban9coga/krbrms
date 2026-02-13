import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const auth = await requireJury(req, ['RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { motoId } = await params
  const body = await req.json()
  const { reason } = body ?? {}

  const { data: moto } = await adminClient.from('motos').select('id, event_id').eq('id', motoId).maybeSingle()
  if (!moto) return NextResponse.json({ error: 'Moto not found' }, { status: 404 })

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
          reason: reason ?? null,
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
      reason: reason ?? 'Lock moto',
    },
  ])

  return NextResponse.json({ ok: true })
}

