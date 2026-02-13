import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'
import { computeQualificationAndStore, computeStageAdvances, generateStageMotos } from '../../../../../../services/advancedRaceAuto'

const isMoto2Batch = (name: string) => /moto\s*2\s*-\s*batch\s*\d+/i.test(name)

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const auth = await requireJury(req, ['FINISHER', 'CHECKER', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { motoId } = await params
  const { data: moto, error } = await adminClient
    .from('motos')
    .select('id, event_id, category_id, moto_name')
    .eq('id', motoId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!moto) return NextResponse.json({ error: 'Moto not found' }, { status: 404 })

  if (!moto.category_id || !isMoto2Batch(moto.moto_name)) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const result = await computeQualificationAndStore(moto.event_id, moto.category_id)
  if (!result.ok) {
    return NextResponse.json({ warning: result.warning ?? 'Advanced race skipped.' }, { status: 200 })
  }
  await generateStageMotos(moto.event_id, moto.category_id)
  await computeStageAdvances(moto.event_id, moto.category_id)

  return NextResponse.json({ ok: true })
}
