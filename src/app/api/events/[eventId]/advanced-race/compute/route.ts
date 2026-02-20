import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'
import { resolveCategoryConfig } from '../../../../../../services/categoryResolver'
import { computeQualification } from '../../../../../../services/raceStageEngine'
import { generateStageMotos } from '../../../../../../services/advancedRaceAuto'

type MotoRow = {
  id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'LIVE' | 'FINISHED'
}

type ResultRow = {
  moto_id: string
  rider_id: string
  finish_order: number | null
}

type MotoRiderRow = {
  moto_id: string
  rider_id: string
}

const parseBatchKey = (name: string) => {
  const match = name.match(/moto\s*(\d+)\s*-\s*batch\s*(\d+)/i)
  if (!match) return null
  return { motoIndex: Number(match[1]), batchIndex: Number(match[2]) }
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const body = await req.json().catch(() => ({}))
  const categoryId = body?.category_id as string | undefined
  if (!categoryId) return NextResponse.json({ error: 'category_id required' }, { status: 400 })

  const { data: config } = await adminClient
    .from('race_stage_config')
    .select('enabled, qualification_moto_count')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
    .maybeSingle()

  if (!config?.enabled) {
    return NextResponse.json({ warning: 'Advanced race disabled for this category.' }, { status: 200 })
  }

  const resolved = await resolveCategoryConfig(categoryId)
  if (!resolved.stages.enableQualification) {
    return NextResponse.json({ warning: resolved.warning ?? 'Qualification disabled by resolver.' }, { status: 200 })
  }

  const { data: motos, error: motoError } = await adminClient
    .from('motos')
    .select('id, moto_name, moto_order, status')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
    .order('moto_order', { ascending: true })

  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })
  const motoRows = (motos ?? []) as MotoRow[]
  if (motoRows.length === 0) {
    return NextResponse.json({ warning: 'No motos found for category.' }, { status: 200 })
  }

  const motoIds = motoRows.map((m) => m.id)
  const { data: results, error: resultError } = await adminClient
    .from('results')
    .select('moto_id, rider_id, finish_order')
    .in('moto_id', motoIds)

  if (resultError) return NextResponse.json({ error: resultError.message }, { status: 400 })
  const resultRows = (results ?? []) as ResultRow[]

  const { data: motoRiders, error: riderError } = await adminClient
    .from('moto_riders')
    .select('moto_id, rider_id')
    .in('moto_id', motoIds)

  if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })
  const motoRiderRows = (motoRiders ?? []) as MotoRiderRow[]

  const batchMap = new Map<number, { moto1?: MotoRow; moto2?: MotoRow }>()
  for (const moto of motoRows) {
    const parsed = parseBatchKey(moto.moto_name)
    if (!parsed) continue
    const entry = batchMap.get(parsed.batchIndex) ?? {}
    if (parsed.motoIndex === 1) entry.moto1 = moto
    if (parsed.motoIndex === 2) entry.moto2 = moto
    batchMap.set(parsed.batchIndex, entry)
  }

  const batches = Array.from(batchMap.entries())
    .filter(([, entry]) => entry.moto1 && entry.moto2)
    .map(([batchIndex, entry]) => {
      const moto1 = entry.moto1 as MotoRow
      const moto2 = entry.moto2 as MotoRow
      const riders = motoRiderRows
        .filter((row) => row.moto_id === moto1.id)
        .map((row) => row.rider_id)
      const finishes = resultRows
        .filter((row) => row.moto_id === moto1.id || row.moto_id === moto2.id)
        .map((row) => ({
          riderId: row.rider_id,
          motoIndex: row.moto_id === moto1.id ? 1 : 2,
          finishOrder: row.finish_order,
        }))
      return {
        batchId: moto1.id,
        batchIndex,
        riders,
        finishes,
      }
    })

  if (batches.length === 0) {
    return NextResponse.json({ warning: 'No qualifying batches found (Moto 1/2 - Batch X).' }, { status: 200 })
  }

  const { batchRanks, advances } = computeQualification(
    batches.map((b) => ({ batchId: b.batchId, riders: b.riders, finishes: b.finishes }))
  )

  const filteredAdvances = advances.filter((row) => {
    if (row.toStage === 'QUARTER_FINAL' && !resolved.stages.enableQuarterFinal) return false
    if (row.toStage === 'SEMI_FINAL' && !resolved.stages.enableSemiFinal) return false
    if (row.toStage === 'FINAL') {
      return resolved.finalClasses.includes(row.finalClass ?? '')
    }
    return true
  })

  await adminClient
    .from('race_stage_result')
    .delete()
    .eq('category_id', categoryId)
    .in('stage', ['QUALIFICATION', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'])

  const qualificationRows = Object.entries(batchRanks).flatMap(([batchId, ranks]) =>
    ranks.map((row) => ({
      rider_id: row.riderId,
      category_id: categoryId,
      stage: 'QUALIFICATION',
      batch_id: batchId,
      position: row.rank,
      points: row.points,
    }))
  )

  const advanceRows = filteredAdvances.map((row) => ({
    rider_id: row.riderId,
    category_id: categoryId,
    stage: row.toStage,
    final_class: row.finalClass ?? null,
    position: null,
    points: null,
  }))

  const payload = [...qualificationRows, ...advanceRows]
  if (payload.length > 0) {
    const { error: insertError } = await adminClient.from('race_stage_result').insert(payload)
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 })
  }

  await generateStageMotos(eventId, categoryId)

  return NextResponse.json({
    data: {
      batches: batches.length,
      qualification_rows: qualificationRows.length,
      advance_rows: advanceRows.length,
      stages: resolved.stages,
      final_classes: resolved.finalClasses,
    },
  })
}
