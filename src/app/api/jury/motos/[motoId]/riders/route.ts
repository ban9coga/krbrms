import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

type RiderRow = {
  id: string
  name: string
  no_plate_display: string
}

type StageSeedRow = {
  rider_id: string
  stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'REPECHAGE' | 'SEMI_FINAL' | 'FINAL'
  batch_id: string | null
  position: number | null
  points: number | null
}

const parseQualificationBatchIndex = (name: string) => {
  const match = name.match(/moto\s*(\d+)\s*(?:-\s*)?batch\s*(\d+)/i)
  if (!match) return null
  return Number(match[2])
}

const parseStageBatchIndex = (name: string) => {
  const match = name.match(/(?:heat|batch)\s*(\d+)/i)
  return match ? Number(match[1]) : null
}

const compareStageSeedRows = (a: StageSeedRow, b: StageSeedRow, batchOrderById: Map<string, number>) => {
  const positionDiff = (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)
  if (positionDiff !== 0) return positionDiff
  const batchDiff =
    (a.batch_id ? batchOrderById.get(a.batch_id) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER) -
    (b.batch_id ? batchOrderById.get(b.batch_id) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER)
  if (batchDiff !== 0) return batchDiff
  const pointsDiff = (a.points ?? Number.MAX_SAFE_INTEGER) - (b.points ?? Number.MAX_SAFE_INTEGER)
  if (pointsDiff !== 0) return pointsDiff
  return a.rider_id.localeCompare(b.rider_id)
}

const orderRidersByStageSeeds = (
  riderIds: string[],
  seedRows: StageSeedRow[],
  batchOrderById: Map<string, number>
) => {
  const wanted = new Set(riderIds)
  const groupedRows = [...seedRows]
    .sort((a, b) => compareStageSeedRows(a, b, batchOrderById))
    .filter((row) => row.position !== null && wanted.has(row.rider_id))
    .reduce<Map<string, StageSeedRow[]>>((acc, row) => {
      const batchId = row.batch_id ?? '__NO_BATCH__'
      const list = acc.get(batchId) ?? []
      list.push(row)
      acc.set(batchId, list)
      return acc
    }, new Map<string, StageSeedRow[]>())

  const orderedBatchIds = Array.from(groupedRows.keys()).sort((a, b) => {
    const aOrder = a === '__NO_BATCH__' ? Number.MAX_SAFE_INTEGER : batchOrderById.get(a) ?? Number.MAX_SAFE_INTEGER
    const bOrder = b === '__NO_BATCH__' ? Number.MAX_SAFE_INTEGER : batchOrderById.get(b) ?? Number.MAX_SAFE_INTEGER
    if (aOrder !== bOrder) return aOrder - bOrder
    return a.localeCompare(b)
  })

  const ordered: string[] = []
  const maxRows = orderedBatchIds.reduce((max, batchId) => Math.max(max, groupedRows.get(batchId)?.length ?? 0), 0)
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    for (const batchId of orderedBatchIds) {
      const row = groupedRows.get(batchId)?.[rowIndex]
      if (row) ordered.push(row.rider_id)
    }
  }

  const seen = new Set(ordered)
  const leftovers = riderIds.filter((id) => !seen.has(id)).sort((a, b) => a.localeCompare(b))
  return [...ordered, ...leftovers]
}

const deriveAdvancedGateOrder = async (
  eventId: string,
  categoryId: string,
  motoName: string,
  assignedRiderIds: string[]
) => {
  if (assignedRiderIds.length === 0) return assignedRiderIds
  const isAdvancedMoto = /^final /i.test(motoName) || /^quarter final/i.test(motoName) || /^repechage/i.test(motoName) || /^semi final/i.test(motoName)
  if (!isAdvancedMoto) return assignedRiderIds

  const [{ data: categoryMotos }, { data: stageSeedRows }] = await Promise.all([
    adminClient
      .from('motos')
      .select('id, moto_name, moto_order')
      .eq('event_id', eventId)
      .eq('category_id', categoryId)
      .order('moto_order', { ascending: true }),
    adminClient
      .from('race_stage_result')
      .select('rider_id, stage, batch_id, position, points')
      .eq('category_id', categoryId),
  ])

  const batchOrderById = new Map<string, number>()
  for (const moto of categoryMotos ?? []) {
    const qualificationBatchIndex = parseQualificationBatchIndex(moto.moto_name)
    if (qualificationBatchIndex !== null) {
      batchOrderById.set(moto.id, qualificationBatchIndex)
      continue
    }
    const stageBatchIndex = parseStageBatchIndex(moto.moto_name)
    if (stageBatchIndex !== null) batchOrderById.set(moto.id, stageBatchIndex)
  }

  const seedRows = (stageSeedRows ?? []) as StageSeedRow[]
  const qualificationRows = seedRows.filter((row) => row.stage === 'QUALIFICATION')
  const quarterRows = seedRows.filter((row) => row.stage === 'QUARTER_FINAL' && row.position !== null)
  const repechageRows = seedRows.filter((row) => row.stage === 'REPECHAGE' && row.position !== null)
  const semiRows = seedRows.filter((row) => row.stage === 'SEMI_FINAL' && row.position !== null)
  const repechageRiderIds = new Set(repechageRows.map((row) => row.rider_id))
  const quarterRiderIds = new Set(quarterRows.map((row) => row.rider_id))
  const semiRiderIds = new Set(semiRows.map((row) => row.rider_id))

  if (/^final /i.test(motoName)) {
    const qualificationDirect = assignedRiderIds.filter(
      (riderId) => !repechageRiderIds.has(riderId) && !quarterRiderIds.has(riderId) && !semiRiderIds.has(riderId)
    )
    const repechageDerived = assignedRiderIds.filter(
      (riderId) => repechageRiderIds.has(riderId) && !quarterRiderIds.has(riderId) && !semiRiderIds.has(riderId)
    )
    const quarterDerived = assignedRiderIds.filter((riderId) => quarterRiderIds.has(riderId) && !semiRiderIds.has(riderId))
    const semiDerived = assignedRiderIds.filter((riderId) => semiRiderIds.has(riderId))
    return [
      ...orderRidersByStageSeeds(qualificationDirect, qualificationRows, batchOrderById),
      ...orderRidersByStageSeeds(repechageDerived, repechageRows, batchOrderById),
      ...orderRidersByStageSeeds(quarterDerived, quarterRows, batchOrderById),
      ...orderRidersByStageSeeds(semiDerived, semiRows, batchOrderById),
    ]
  }

  const stageSource =
    /^quarter final/i.test(motoName)
      ? 'QUARTER_FINAL'
      : /^repechage/i.test(motoName)
        ? 'REPECHAGE'
        : /^semi final/i.test(motoName)
          ? 'SEMI_FINAL'
          : null
  const sourceRows =
    stageSource === 'QUARTER_FINAL'
      ? qualificationRows
      : stageSource === 'REPECHAGE'
        ? [...qualificationRows, ...quarterRows, ...semiRows]
        : [...quarterRows, ...repechageRows, ...qualificationRows]
  return orderRidersByStageSeeds(assignedRiderIds, sourceRows, batchOrderById)
}

export async function GET(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const { data: moto } = await adminClient.from('motos').select('event_id, category_id, moto_name').eq('id', motoId).maybeSingle()
  const auth = await requireJury(req, ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'ADMIN', 'super_admin'], moto?.event_id ?? null)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: gates, error: gateError } = await adminClient
    .from('moto_gate_positions')
    .select('rider_id, gate_position')
    .eq('moto_id', motoId)
    .order('gate_position', { ascending: true })

  if (gateError) return NextResponse.json({ error: gateError.message }, { status: 400 })

  if (gates && gates.length > 0) {
    const riderIds = Array.from(new Set(gates.map((g) => g.rider_id)))
    const { data: riders, error: riderError } = await adminClient
      .from('riders')
      .select('id, name, no_plate_display')
      .in('id', riderIds)

    if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })

    const riderMap = new Map<string, RiderRow>()
    for (const r of riders ?? []) riderMap.set(r.id, r)

    const data = gates
      .map((g) => {
        const rider = riderMap.get(g.rider_id)
        if (!rider) return null
        return { ...rider, gate_position: g.gate_position }
      })
      .filter(Boolean)

    return NextResponse.json({ data })
  }

  const { data: assignments, error: assignError } = await adminClient
    .from('moto_riders')
    .select('rider_id, created_at')
    .eq('moto_id', motoId)
    .order('created_at', { ascending: true })

  if (assignError) return NextResponse.json({ error: assignError.message }, { status: 400 })

  const riderIds = Array.from(new Set((assignments ?? []).map((a) => a.rider_id)))
  const { data: riders, error: riderError } = await adminClient
    .from('riders')
    .select('id, name, no_plate_display')
    .in('id', riderIds)

  if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })

  const riderMap = new Map<string, RiderRow>()
  for (const r of riders ?? []) riderMap.set(r.id, r)

  const assignmentRows = (assignments ?? []) as Array<{ rider_id: string; created_at?: string | null }>
  const assignedRiderIds = assignmentRows.map((a) => a.rider_id)
  const orderedRiderIds = moto?.event_id && moto?.category_id && moto?.moto_name
    ? await deriveAdvancedGateOrder(moto.event_id, moto.category_id, moto.moto_name, assignedRiderIds)
    : assignedRiderIds
  const orderByRider = new Map(orderedRiderIds.map((riderId, index) => [riderId, index + 1]))

  const data = orderedRiderIds
    .map((riderId, idx) => {
      const rider = riderMap.get(riderId)
      if (!rider) return null
      return { ...rider, gate_position: orderByRider.get(riderId) ?? idx + 1 }
    })
    .filter(Boolean)

  return NextResponse.json({ data })
}
