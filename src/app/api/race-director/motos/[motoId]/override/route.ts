import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const auth = await requireJury(req, ['RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { motoId } = await params
  const body = await req.json()
  const { results, reason } = body ?? {}
  if (!Array.isArray(results) || results.length === 0) {
    return NextResponse.json({ error: 'results required' }, { status: 400 })
  }

  const { data: moto, error: motoError } = await adminClient
    .from('motos')
    .select('id, event_id')
    .eq('id', motoId)
    .maybeSingle()
  if (motoError || !moto?.event_id) {
    return NextResponse.json({ error: 'Moto not found' }, { status: 404 })
  }

  const payload = (results as Array<{ rider_id: string; finish_order?: number | null; result_status?: string }>).map((row) => ({
    event_id: moto.event_id,
    moto_id: motoId,
    rider_id: row.rider_id,
    finish_order: row.finish_order ?? null,
    result_status: row.result_status ?? 'FINISH',
  }))

  const { data: assigned, error: assignedError } = await adminClient
    .from('moto_riders')
    .select('rider_id')
    .eq('moto_id', motoId)
  if (assignedError) return NextResponse.json({ error: assignedError.message }, { status: 400 })
  const assignedSet = new Set((assigned ?? []).map((row) => row.rider_id))
  if (assignedSet.size === 0) {
    return NextResponse.json({ error: 'No riders assigned to moto' }, { status: 400 })
  }
  const invalid = payload.find((row) => !assignedSet.has(row.rider_id))
  if (invalid) {
    return NextResponse.json({ error: 'Rider not assigned to moto' }, { status: 400 })
  }

  const { error } = await adminClient.from('results').upsert(payload, { onConflict: 'moto_id,rider_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await adminClient.from('audit_log').insert([
    {
      action_type: 'RESULT_OVERRIDE',
      performed_by: auth.user.id,
      moto_id: motoId,
      event_id: moto.event_id,
      reason: reason ?? 'Override results',
    },
  ])

  return NextResponse.json({ ok: true })
}

