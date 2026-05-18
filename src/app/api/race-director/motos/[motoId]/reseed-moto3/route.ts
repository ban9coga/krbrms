import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'
import { reseedSingleBatchMoto3FromMoto } from '../../../../../../services/moto3Reseed'

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const body = await req.json().catch(() => ({}))
  const reason =
    typeof body?.reason === 'string' && body.reason.trim()
      ? body.reason.trim()
      : 'Manual reseed Moto 3 gate from Moto 1 + Moto 2 standings'

  const { data: moto, error: motoError } = await adminClient
    .from('motos')
    .select('id, event_id, category_id, moto_name')
    .eq('id', motoId)
    .maybeSingle()

  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })
  if (!moto) return NextResponse.json({ error: 'Moto not found' }, { status: 404 })

  const auth = await requireJury(req, ['RACE_DIRECTOR', 'super_admin', 'admin', 'central_admin'], moto.event_id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const reseed = await reseedSingleBatchMoto3FromMoto(motoId)
  if (!reseed.ok) {
    return NextResponse.json({ error: reseed.warning ?? 'Failed to reseed Moto 3 gate.' }, { status: 400 })
  }

  await adminClient.from('audit_log').insert([
    {
      action_type: 'RESULT_OVERRIDE',
      performed_by: auth.user.id,
      moto_id: motoId,
      event_id: moto.event_id,
      reason,
    },
  ])

  return NextResponse.json({
    ok: true,
    moto3_id: reseed.moto3Id ?? null,
    moto3_name: reseed.moto3Name ?? null,
    ordered_rider_ids: reseed.orderedRiderIds ?? [],
  })
}
