import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { formatMotoDisplayName } from '../../../../../../lib/motoDisplayOrder'
import { resolveBasePointForRaceResult, resolveNonFinishAutoPenalty } from '../../../../../../lib/nonFinishScoring'
import { isMotoPublicVisible, isMotoUpcoming } from '../../../../../../lib/motoStatus'
import { formatStageAdvanceLabel } from '../../../../../../services/raceStageEngine'

type MotoRow = {
  id: string
  moto_name: string
  moto_order: number
  status?: string | null
  is_published?: boolean | null
}

type GateRow = {
  moto_id: string
  rider_id: string
  gate_position: number
}

type MotoRiderRow = {
  moto_id: string
  rider_id: string
  created_at?: string | null
}

type ResultRow = {
  moto_id: string
  rider_id: string
  finish_order: number | null
  result_status?: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | null
}

type RiderRow = {
  id: string
  name: string
  rider_nickname?: string | null
  no_plate_display: string
  club: string | null
  photo_thumbnail_url?: string | null
}

type StageRow = {
  rider_id: string
  gate: number | null
  name: string
  no_plate: string
  club: string | null
  photo_thumbnail_url?: string | null
  point: number | null
  penalty_total: number | null
  rank: number | null
  status: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING'
  next_class_label?: string | null
}

type StageGroup = {
  title: string
  moto_id: string
  rows: StageRow[]
}

type QualificationRowStatus = 'FINISHED' | 'DNF' | 'DNS' | 'PENDING' | 'DQ'

type QualificationMotoStatus = 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING'

type QualificationCustomRuleRow = {
  source_stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'REPECHAGE' | 'SEMI_FINAL'
  rank_from: number
  rank_to: number
  target_stage: 'QUARTER_FINAL' | 'REPECHAGE' | 'SEMI_FINAL' | 'FINAL'
  target_final_class: string | null
  split_basis: 'COMBINED' | 'PER_BATCH' | 'CUSTOM_PER_BATCH' | null
  batch_no: number | null
}

type StageCustomRuleRow = QualificationCustomRuleRow

type StageSeedRow = {
  rider_id: string
  stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'REPECHAGE' | 'SEMI_FINAL' | 'FINAL'
  final_class?: string | null
  batch_id: string | null
  position: number | null
  points: number | null
}

const parseBatchKey = (name: string) => {
  const match = name.match(/moto\s*(\d+)\s*(?:-\s*)?batch\s*(\d+)/i)
  if (!match) return null
  return { motoIndex: Number(match[1]), batchIndex: Number(match[2]) }
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
  const leftovers = riderIds.filter((riderId) => !seen.has(riderId)).sort((a, b) => a.localeCompare(b))
  return [...ordered, ...leftovers]
}

const pointForMotoResult = (res: ResultRow | null, riderCount: number | null) => {
  return resolveBasePointForRaceResult(res?.result_status ?? null, res?.finish_order ?? null, riderCount)
}

const getStageStatusSortOrder = (status: StageRow['status']) => {
  switch (status) {
    case 'FINISH':
      return 0
    case 'DNF':
      return 1
    case 'DNS':
      return 2
    case 'DQ':
      return 3
    default:
      return 4
  }
}

const resolvePenaltyStagesForMoto = (name: string): Array<'QUARTER' | 'REPECHAGE' | 'SEMI' | 'FINAL' | 'ALL'> => {
  if (/^quarter final/i.test(name)) return ['QUARTER', 'ALL']
  if (/^repechage/i.test(name)) return ['REPECHAGE', 'ALL']
  if (/^semi final/i.test(name)) return ['SEMI', 'ALL']
  if (/^final /i.test(name)) return ['FINAL', 'ALL']
  return ['ALL']
}

const formatQualificationTargetLabel = (
  targetStage: QualificationCustomRuleRow['target_stage'],
  targetFinalClass: string | null
) => (targetStage === 'FINAL' ? `FINAL ${targetFinalClass ?? 'ELITE'}` : formatStageAdvanceLabel({ toStage: targetStage }))

const parseStageHeatIndex = (name: string) => {
  const match = name.match(/(?:heat|batch)\s*(\d+)/i)
  if (!match) return null
  return Number(match[1])
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { searchParams } = new URL(req.url)
  const categoryId = searchParams.get('category_id')
  const includeUpcoming = ['1', 'true', 'yes'].includes(
    (searchParams.get('include_upcoming') ?? '').toLowerCase()
  )
  if (!categoryId) return NextResponse.json({ error: 'category_id required' }, { status: 400 })

  const { data: category, error: catError } = await adminClient
    .from('categories')
    .select('id, event_id, label')
    .eq('id', categoryId)
    .maybeSingle()
  if (catError || !category || category.event_id !== eventId) {
    return NextResponse.json({ error: 'Category not found in event' }, { status: 404 })
  }
  const { data: settingsRow } = await adminClient
    .from('event_settings')
    .select('business_settings')
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const businessSettings =
    settingsRow?.business_settings && typeof settingsRow.business_settings === 'object' && !Array.isArray(settingsRow.business_settings)
      ? (settingsRow.business_settings as Record<string, unknown>)
      : {}
  const includePhotosParam = searchParams.get('include_photos')
  const includePhotos =
    includePhotosParam === '0' || includePhotosParam === 'false'
      ? false
      : typeof businessSettings.show_rider_photos_public === 'boolean'
      ? businessSettings.show_rider_photos_public
      : true
  const { data: pointOverrideConfig } = await adminClient
    .from('race_stage_config')
    .select('dnf_point_override, dns_point_override')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
    .maybeSingle()

  const { data: motos, error: motoError } = await adminClient
    .from('motos')
    .select('id, moto_name, moto_order, status, is_published')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
    .order('moto_order', { ascending: true })
  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })
  const motoRows = ((motos ?? []) as MotoRow[]).filter((m) => {
    if (isMotoPublicVisible(m.status, m.is_published)) return true
    if (includeUpcoming && isMotoUpcoming(m.status)) return true
    return false
  })

  const motoIds = motoRows.map((m) => m.id)
  if (motoIds.length === 0) return NextResponse.json({ data: { batches: [], category: category.label } })

  const { data: gates, error: gateError } = await adminClient
    .from('moto_gate_positions')
    .select('moto_id, rider_id, gate_position')
    .in('moto_id', motoIds)
  if (gateError) return NextResponse.json({ error: gateError.message }, { status: 400 })
  const gateRows = (gates ?? []) as GateRow[]

  const gateCountByMoto = new Map<string, number>()
  for (const row of gateRows) {
    gateCountByMoto.set(row.moto_id, (gateCountByMoto.get(row.moto_id) ?? 0) + 1)
  }

  const motoById = new Map(motoRows.map((m) => [m.id, m]))
  const missingGateMotoIds = motoIds.filter((id) => !gateCountByMoto.get(id))

  if (missingGateMotoIds.length > 0) {
    const { data: motoRiders, error: mrError } = await adminClient
      .from('moto_riders')
      .select('moto_id, rider_id, created_at')
      .in('moto_id', missingGateMotoIds)
      .order('created_at', { ascending: true })
    if (mrError) return NextResponse.json({ error: mrError.message }, { status: 400 })

    const grouped = new Map<string, string[]>()
    for (const row of motoRiders ?? []) {
      const list = grouped.get(row.moto_id) ?? []
      list.push(row.rider_id)
      grouped.set(row.moto_id, list)
    }

    const insertRows: GateRow[] = []
    for (const [motoId, riders] of grouped.entries()) {
      const moto = motoById.get(motoId)
      if (moto?.moto_name && !parseBatchKey(moto.moto_name)) {
        continue
      }
      const ordered = [...riders]
      ordered.forEach((riderId, idx) => {
        insertRows.push({ moto_id: motoId, rider_id: riderId, gate_position: idx + 1 })
      })
    }

    if (insertRows.length > 0) {
      const { error: insertError } = await adminClient.from('moto_gate_positions').insert(insertRows)
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 })
      gateRows.push(...insertRows)
    }
  }

  const { data: results, error: resultError } = await adminClient
    .from('results')
    .select('moto_id, rider_id, finish_order, result_status')
    .in('moto_id', motoIds)
  if (resultError) return NextResponse.json({ error: resultError.message }, { status: 400 })
  const resultRows = (results ?? []) as ResultRow[]

  const { data: assignedMotoRiders, error: assignedMotoRiderError } = await adminClient
    .from('moto_riders')
    .select('moto_id, rider_id, created_at')
    .in('moto_id', motoIds)
    .order('created_at', { ascending: true })
  if (assignedMotoRiderError) return NextResponse.json({ error: assignedMotoRiderError.message }, { status: 400 })
  const motoRiderRows = (assignedMotoRiders ?? []) as MotoRiderRow[]

  const riderIds = Array.from(new Set([
    ...gateRows.map((g) => g.rider_id),
    ...motoRiderRows.map((row) => row.rider_id),
  ]))
  const statusMap = new Map<string, 'ACTIVE' | 'DNS' | 'DNF' | 'ABSENT'>()
  if (riderIds.length > 0) {
    const { data: statuses, error: statusError } = await adminClient
      .from('rider_participation_status')
      .select('moto_id, rider_id, participation_status')
      .eq('event_id', eventId)
      .in('rider_id', riderIds)
    if (statusError) return NextResponse.json({ error: statusError.message }, { status: 400 })
    for (const row of statuses ?? []) {
      statusMap.set(`${row.moto_id}:${row.rider_id}`, row.participation_status)
    }
  }

  const qualificationPenaltyMap = new Map<string, number>()
  const stagePenaltyMap = new Map<string, number>()
  const motoPenaltyMap = new Map<string, number>()
  if (riderIds.length > 0) {
    const { data: penalties, error: penaltyError } = await adminClient
      .from('rider_penalties')
      .select('rider_id, moto_id, penalty_point, stage, rider_penalty_approvals!inner(approval_status)')
      .eq('event_id', eventId)
      .eq('rider_penalty_approvals.approval_status', 'APPROVED')
      .in('rider_id', riderIds)
    if (penaltyError) return NextResponse.json({ error: penaltyError.message }, { status: 400 })
    for (const row of penalties ?? []) {
      const amount = Number(row.penalty_point ?? 0)
      if (row.moto_id) {
        const key = `${row.moto_id}:${row.rider_id}`
        const current = motoPenaltyMap.get(key) ?? 0
        motoPenaltyMap.set(key, current + amount)
      }
      if (row.stage === 'MOTO') {
        const current = qualificationPenaltyMap.get(row.rider_id) ?? 0
        qualificationPenaltyMap.set(row.rider_id, current + amount)
      }
      if (row.stage === 'ALL') {
        const key = `${row.rider_id}:ALL`
        const current = stagePenaltyMap.get(key) ?? 0
        stagePenaltyMap.set(key, current + amount)
      }
      if (row.stage === 'QUARTER' || row.stage === 'REPECHAGE' || row.stage === 'SEMI' || row.stage === 'FINAL') {
        const key = `${row.rider_id}:${row.stage}`
        const current = stagePenaltyMap.get(key) ?? 0
        stagePenaltyMap.set(key, current + amount)
      }
    }
  }

  const riderSelect = includePhotos
    ? 'id, name, rider_nickname, no_plate_display, club, photo_thumbnail_url'
    : 'id, name, rider_nickname, no_plate_display, club'
  const { data: riders, error: riderError } = await adminClient
    .from('riders')
    .select(riderSelect)
    .in('id', riderIds)
  if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })
  const riderRows = (riders ?? []) as unknown as RiderRow[]
  const riderMap = new Map(riderRows.map((r) => [r.id, r]))

  const batchMap = new Map<number, { moto1?: MotoRow; moto2?: MotoRow; moto3?: MotoRow }>()
  for (const moto of motoRows) {
    const parsed = parseBatchKey(moto.moto_name)
    if (!parsed) continue
    const entry = batchMap.get(parsed.batchIndex) ?? {}
    if (parsed.motoIndex === 1) entry.moto1 = moto
    if (parsed.motoIndex === 2) entry.moto2 = moto
    if (parsed.motoIndex === 3) entry.moto3 = moto
    batchMap.set(parsed.batchIndex, entry)
  }

  const batchEntries = Array.from(batchMap.entries()).filter(([, entry]) => entry.moto1)
  const qualificationSeedMap = new Map<string, { points: number; position: number; batchOrder: number }>()
  const stageBatchOrderById = new Map<string, number>()
  const { data: qualificationSeeds, error: qualificationSeedError } = await adminClient
    .from('race_stage_result')
    .select('rider_id, batch_id, position, points')
    .eq('category_id', categoryId)
    .eq('stage', 'QUALIFICATION')
  if (qualificationSeedError) return NextResponse.json({ error: qualificationSeedError.message }, { status: 400 })
  for (const moto of motoRows) {
    const parsed = parseBatchKey(moto.moto_name)
    if (parsed && parsed.motoIndex === 1) {
      stageBatchOrderById.set(moto.id, parsed.batchIndex)
      continue
    }
    const stageBatchIndex = parseStageBatchIndex(moto.moto_name)
    if (stageBatchIndex !== null) {
      stageBatchOrderById.set(moto.id, stageBatchIndex)
    }
  }
  for (const row of qualificationSeeds ?? []) {
    qualificationSeedMap.set(row.rider_id, {
      points: row.points ?? Number.MAX_SAFE_INTEGER,
      position: row.position ?? Number.MAX_SAFE_INTEGER,
      batchOrder: row.batch_id ? stageBatchOrderById.get(row.batch_id) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER,
    })
  }

  const { data: stageSeedData, error: stageSeedError } = await adminClient
    .from('race_stage_result')
    .select('rider_id, stage, final_class, batch_id, position, points')
    .eq('category_id', categoryId)
  if (stageSeedError) return NextResponse.json({ error: stageSeedError.message }, { status: 400 })
  const stageSeedRows = (stageSeedData ?? []) as StageSeedRow[]
  const qualificationStageSeedRows = stageSeedRows.filter((row) => row.stage === 'QUALIFICATION')
  const quarterStageResultRows = stageSeedRows.filter((row) => row.stage === 'QUARTER_FINAL' && row.position !== null)
  const repechageStageResultRows = stageSeedRows.filter((row) => row.stage === 'REPECHAGE' && row.position !== null)
  const semiStageResultRows = stageSeedRows.filter((row) => row.stage === 'SEMI_FINAL' && row.position !== null)
  const quarterStageRiderIds = new Set(stageSeedRows.filter((row) => row.stage === 'QUARTER_FINAL').map((row) => row.rider_id))
  const repechageStageRiderIds = new Set(stageSeedRows.filter((row) => row.stage === 'REPECHAGE').map((row) => row.rider_id))
  const semiStageRiderIds = new Set(stageSeedRows.filter((row) => row.stage === 'SEMI_FINAL').map((row) => row.rider_id))

  const { data: qualificationCustomRules, error: qualificationCustomRulesError } = await adminClient
    .from('race_category_custom_split_rule')
    .select('source_stage, rank_from, rank_to, target_stage, target_final_class, split_basis, batch_no')
    .eq('category_id', categoryId)
    .eq('source_stage', 'QUALIFICATION')
    .order('sort_order', { ascending: true })
    .order('rank_from', { ascending: true })
  if (qualificationCustomRulesError) {
    return NextResponse.json({ error: qualificationCustomRulesError.message }, { status: 400 })
  }
  const qualificationRules = (qualificationCustomRules ?? []) as QualificationCustomRuleRow[]
  const qualificationSplitBasis = qualificationRules[0]?.split_basis ?? null

  const { data: stageCustomRules, error: stageCustomRulesError } = await adminClient
    .from('race_category_custom_split_rule')
    .select('source_stage, rank_from, rank_to, target_stage, target_final_class, split_basis, batch_no')
    .eq('category_id', categoryId)
    .in('source_stage', ['QUARTER_FINAL', 'REPECHAGE', 'SEMI_FINAL'])
    .order('sort_order', { ascending: true })
    .order('rank_from', { ascending: true })
  if (stageCustomRulesError) {
    return NextResponse.json({ error: stageCustomRulesError.message }, { status: 400 })
  }
  const stageRulesBySource = new Map<string, StageCustomRuleRow[]>()
  for (const rule of (stageCustomRules ?? []) as StageCustomRuleRow[]) {
    const key = rule.source_stage
    const list = stageRulesBySource.get(key) ?? []
    list.push(rule)
    stageRulesBySource.set(key, list)
  }

  const batches = batchEntries
    .map(([batchIndex, entry]) => {
      const moto1 = entry.moto1 as MotoRow
      const moto2 = entry.moto2 ?? null
      const moto3 = entry.moto3 ?? null
      const gates1 = gateRows.filter((g) => g.moto_id === moto1.id)
      const gates2 = moto2 ? gateRows.filter((g) => g.moto_id === moto2.id) : []
      const gates3 = moto3 ? gateRows.filter((g) => g.moto_id === moto3.id) : []
      const gate1Map = new Map(gates1.map((g) => [g.rider_id, g.gate_position]))
      const gate2Map = new Map(gates2.map((g) => [g.rider_id, g.gate_position]))
      const gate3Map = new Map(gates3.map((g) => [g.rider_id, g.gate_position]))
      const riderIdsInBatch = Array.from(new Set([...gate1Map.keys(), ...gate2Map.keys(), ...gate3Map.keys()]))

      const rows = riderIdsInBatch.map((riderId) => {
        const rider = riderMap.get(riderId)
        const moto1Result = resultRows.find((r) => r.moto_id === moto1.id && r.rider_id === riderId)
        const moto2Result = moto2
          ? resultRows.find((r) => r.moto_id === moto2.id && r.rider_id === riderId)
          : null
        const moto3Result = moto3
          ? resultRows.find((r) => r.moto_id === moto3.id && r.rider_id === riderId)
          : null
        const riderCount1 = gate1Map.size || null
        const riderCount2 = gate2Map.size || null
        const riderCount3 = gate3Map.size || null
        const riderStatus = statusMap.get(`${moto1.id}:${riderId}`) ?? 'ACTIVE'
        const point1 = pointForMotoResult(moto1Result ?? null, riderCount1)
        const point2 = pointForMotoResult(moto2Result ?? null, riderCount2)
        const point3 = pointForMotoResult(moto3Result ?? null, riderCount3)
        const hasRecordedResult = Boolean(moto1Result || moto2Result || moto3Result)
        const basePoint = [point1, point2, point3].filter((v) => v !== null).length
          ? [point1, point2, point3].reduce<number>((acc, v) => acc + (v ?? 0), 0)
          : null
        const autoPenaltyTotal =
          resolveNonFinishAutoPenalty(moto1Result?.result_status ?? null, pointOverrideConfig ?? undefined) +
          resolveNonFinishAutoPenalty(moto2Result?.result_status ?? null, pointOverrideConfig ?? undefined) +
          resolveNonFinishAutoPenalty(moto3Result?.result_status ?? null, pointOverrideConfig ?? undefined)
        const motoSpecificPenaltyTotal =
          (moto1?.id ? motoPenaltyMap.get(`${moto1.id}:${riderId}`) ?? 0 : 0) +
          (moto2?.id ? motoPenaltyMap.get(`${moto2.id}:${riderId}`) ?? 0 : 0) +
          (moto3?.id ? motoPenaltyMap.get(`${moto3.id}:${riderId}`) ?? 0 : 0)
        const stageWideQualificationPenalty = qualificationPenaltyMap.get(riderId) ?? 0
        const penaltyTotal =
          (motoSpecificPenaltyTotal > 0 ? motoSpecificPenaltyTotal : stageWideQualificationPenalty) + autoPenaltyTotal
        const penaltyTotalDisplay = hasRecordedResult ? penaltyTotal : null
        const totalPoint = basePoint !== null ? basePoint + penaltyTotal : null
        const tiebreakers = [point3, point2, point1]

        const status: QualificationRowStatus =
          moto1Result?.result_status === 'DQ' ||
          (moto2 ? moto2Result?.result_status === 'DQ' : false) ||
          (moto3 ? moto3Result?.result_status === 'DQ' : false)
            ? 'DQ'
            : riderStatus === 'ABSENT' && hasRecordedResult
              ? 'FINISHED'
              : moto1Result && (!moto2 || moto2Result) && (!moto3 || moto3Result)
                ? 'FINISHED'
                : 'PENDING'
        return {
          rider_id: riderId,
          gate_moto1: gate1Map.get(riderId) ?? null,
          gate_moto2: gate2Map.get(riderId) ?? null,
          gate_moto3: gate3Map.get(riderId) ?? null,
          name: rider?.name ?? '-',
          rider_nickname: rider?.rider_nickname ?? null,
          no_plate: rider?.no_plate_display ?? '-',
          club: rider?.club ?? '-',
          photo_thumbnail_url: rider?.photo_thumbnail_url ?? null,
          point_moto1: point1,
          point_moto2: point2,
          point_moto3: point3,
          moto1_status: (moto1Result?.result_status ?? 'PENDING') as QualificationMotoStatus,
          moto2_status: (moto2Result?.result_status ?? 'PENDING') as QualificationMotoStatus,
          moto3_status: (moto3Result?.result_status ?? 'PENDING') as QualificationMotoStatus,
          penalty_total: penaltyTotalDisplay,
          total_point: totalPoint,
          status,
          tiebreakers,
        }
      })

      const rankedRows = [...rows].sort((a, b) => {
        const aPoint = a.total_point ?? Number.MAX_SAFE_INTEGER
        const bPoint = b.total_point ?? Number.MAX_SAFE_INTEGER
        if (aPoint !== bPoint) return aPoint - bPoint
        const maxTieLength = Math.max(a.tiebreakers.length, b.tiebreakers.length)
        for (let index = 0; index < maxTieLength; index += 1) {
          const aTie = a.tiebreakers[index] ?? Number.MAX_SAFE_INTEGER
          const bTie = b.tiebreakers[index] ?? Number.MAX_SAFE_INTEGER
          if (aTie !== bTie) return aTie - bTie
        }
        return a.rider_id.localeCompare(b.rider_id)
      })
      const rankMap = new Map(
        rankedRows
          .filter((r) => r.total_point !== null)
          .map((r, idx) => ({ rider_id: r.rider_id, rank: idx + 1 }))
          .map((r) => [r.rider_id, r.rank])
      )

      const nextQualificationLabelForRank = (rank: number | null | undefined) => {
        if (!rank || qualificationRules.length === 0) return null
        const matchingRules =
          qualificationSplitBasis === 'CUSTOM_PER_BATCH'
            ? qualificationRules.filter((rule) => (rule.batch_no ?? 1) === batchIndex)
            : qualificationRules
        const matchedRule = matchingRules.find((rule) => rank >= rule.rank_from && rank <= rule.rank_to)
        if (!matchedRule) return null
        return formatQualificationTargetLabel(matchedRule.target_stage, matchedRule.target_final_class)
      }

      const ordered = rows
        .map((r) => {
          const rank = rankMap.get(r.rider_id) ?? null
          return {
            ...r,
            rank_point: rank,
            class_label: nextQualificationLabelForRank(rank),
          }
        })
        .sort((a, b) => (a.gate_moto1 ?? 9999) - (b.gate_moto1 ?? 9999))

      const resolvedMotoStatus = (moto3?.status ?? moto2?.status ?? moto1.status ?? '').toUpperCase()
      return {
        batch_index: batchIndex,
        sequence_order: Math.min(
          moto1.moto_order,
          moto2?.moto_order ?? Number.MAX_SAFE_INTEGER,
          moto3?.moto_order ?? Number.MAX_SAFE_INTEGER
        ),
        moto1_id: moto1.id,
        moto2_id: moto2?.id ?? null,
        moto3_id: moto3?.id ?? null,
        moto_status: resolvedMotoStatus || null,
        isProvisional: resolvedMotoStatus === 'PROVISIONAL',
        isUnderReview: resolvedMotoStatus === 'PROTEST_REVIEW',
        isOfficial: resolvedMotoStatus === 'LOCKED',
        rows: ordered,
      }
    })
    .sort((a, b) => {
      if (a.sequence_order !== b.sequence_order) return a.sequence_order - b.sequence_order
      return a.batch_index - b.batch_index
    })

  const stageMotos = motoRows.filter((m) => !parseBatchKey(m.moto_name))
  const stageGroups: StageGroup[] = stageMotos.map((moto) => {
    const gates = gateRows.filter((g) => g.moto_id === moto.id)
    const gateMap = new Map(gates.map((g) => [g.rider_id, g.gate_position]))
    const assignedRiderIds = motoRiderRows.filter((row) => row.moto_id === moto.id).map((row) => row.rider_id)
    const riderIdsInMoto = Array.from(new Set([...assignedRiderIds, ...gates.map((g) => g.rider_id)]))
    const stageSource =
      /^quarter final/i.test(moto.moto_name)
        ? 'QUARTER_FINAL'
        : /^repechage/i.test(moto.moto_name)
          ? 'REPECHAGE'
          : /^semi final/i.test(moto.moto_name)
            ? 'SEMI_FINAL'
            : null
    if (gateMap.size === 0 && /^final /i.test(moto.moto_name)) {
      const qualificationDirect = riderIdsInMoto.filter(
        (riderId) =>
          !repechageStageRiderIds.has(riderId) &&
          !quarterStageRiderIds.has(riderId) &&
          !semiStageRiderIds.has(riderId)
      )
      const repechageDerived = riderIdsInMoto.filter(
        (riderId) =>
          repechageStageRiderIds.has(riderId) &&
          !quarterStageRiderIds.has(riderId) &&
          !semiStageRiderIds.has(riderId)
      )
      const quarterDerived = riderIdsInMoto.filter(
        (riderId) => quarterStageRiderIds.has(riderId) && !semiStageRiderIds.has(riderId)
      )
      const semiDerived = riderIdsInMoto.filter((riderId) => semiStageRiderIds.has(riderId))

      const ordered = [
        ...orderRidersByStageSeeds(qualificationDirect, qualificationStageSeedRows, stageBatchOrderById),
        ...orderRidersByStageSeeds(repechageDerived, repechageStageResultRows, stageBatchOrderById),
        ...orderRidersByStageSeeds(quarterDerived, quarterStageResultRows, stageBatchOrderById),
        ...orderRidersByStageSeeds(semiDerived, semiStageResultRows, stageBatchOrderById),
      ]
      ordered.forEach((riderId, index) => gateMap.set(riderId, index + 1))
    } else if (gateMap.size === 0 && stageSource && riderIdsInMoto.length > 0) {
      const seedRows =
        stageSource === 'QUARTER_FINAL'
          ? qualificationStageSeedRows
          : stageSource === 'REPECHAGE'
            ? [...qualificationStageSeedRows, ...quarterStageResultRows, ...semiStageResultRows]
            : [...quarterStageResultRows, ...repechageStageResultRows, ...qualificationStageSeedRows]
      const ordered = orderRidersByStageSeeds(assignedRiderIds.length > 0 ? assignedRiderIds : riderIdsInMoto, seedRows, stageBatchOrderById)
      ordered.forEach((riderId, index) => gateMap.set(riderId, index + 1))
    } else if (gateMap.size === 0 && riderIdsInMoto.length > 0) {
      const ordered = assignedRiderIds.length > 0 ? [...assignedRiderIds] : [...riderIdsInMoto].sort((a, b) => a.localeCompare(b))
      ordered.forEach((riderId, index) => gateMap.set(riderId, index + 1))
    }
    const riderCount = riderIdsInMoto.length || null

    const stagePenaltyStages = resolvePenaltyStagesForMoto(moto.moto_name)
    const rows: StageRow[] = riderIdsInMoto.map((riderId) => {
      const rider = riderMap.get(riderId)
      const res = resultRows.find((r) => r.moto_id === moto.id && r.rider_id === riderId) ?? null
      const status = (res?.result_status ?? 'PENDING') as StageRow['status']
      const manualPenaltyTotal = stagePenaltyStages.reduce((sum, stageKey) => {
        return sum + (stagePenaltyMap.get(`${riderId}:${stageKey}`) ?? 0)
      }, 0) + (motoPenaltyMap.get(`${moto.id}:${riderId}`) ?? 0)
      const autoPenaltyTotal = resolveNonFinishAutoPenalty(status, pointOverrideConfig ?? undefined)
      return {
        rider_id: riderId,
        gate: gateMap.get(riderId) ?? null,
        name: rider?.name ?? '-',
        no_plate: rider?.no_plate_display ?? '-',
        club: rider?.club ?? '-',
        photo_thumbnail_url: rider?.photo_thumbnail_url ?? null,
        point: pointForMotoResult(res, riderCount),
        penalty_total: manualPenaltyTotal + autoPenaltyTotal || null,
        rank: null,
        status,
      }
    })

    const rankMap = new Map(
      [...rows]
        .filter((row) => row.point !== null)
        .sort((a, b) => {
          const aStatusOrder = getStageStatusSortOrder(a.status)
          const bStatusOrder = getStageStatusSortOrder(b.status)
          if (aStatusOrder !== bStatusOrder) return aStatusOrder - bStatusOrder
          const aPoint = (a.point ?? Number.MAX_SAFE_INTEGER) + (a.penalty_total ?? 0)
          const bPoint = (b.point ?? Number.MAX_SAFE_INTEGER) + (b.penalty_total ?? 0)
          if (aPoint !== bPoint) return aPoint - bPoint
          const aGate = a.gate ?? Number.MAX_SAFE_INTEGER
          const bGate = b.gate ?? Number.MAX_SAFE_INTEGER
          if (aGate !== bGate) return aGate - bGate
          return a.rider_id.localeCompare(b.rider_id)
        })
        .map((row, index) => [row.rider_id, index + 1] as const)
    )

    rows.forEach((row) => {
      row.rank = rankMap.get(row.rider_id) ?? null
    })

    const stageHeatIndex = parseStageHeatIndex(moto.moto_name)
    const stageRules = stageSource ? stageRulesBySource.get(stageSource) ?? [] : []
    const stageSplitBasis = stageRules[0]?.split_basis ?? null

    const nextLabelForRank = (rank: number | null) => {
      if (!rank || !stageSource || stageRules.length === 0) return null
      const matchingRules =
        stageSplitBasis === 'CUSTOM_PER_BATCH'
          ? stageRules.filter((rule) => (rule.batch_no ?? 1) === stageHeatIndex)
          : stageRules
      const matchedRule = matchingRules.find((rule) => rank >= rule.rank_from && rank <= rule.rank_to)
      if (!matchedRule) return null
      return formatQualificationTargetLabel(matchedRule.target_stage, matchedRule.target_final_class)
    }

    rows.forEach((row) => {
      row.next_class_label = nextLabelForRank(row.rank)
    })

    return {
      title: formatMotoDisplayName(moto.moto_name),
      moto_id: moto.id,
      rows: rows.sort((a, b) => {
        const aRank = a.rank ?? Number.MAX_SAFE_INTEGER
        const bRank = b.rank ?? Number.MAX_SAFE_INTEGER
        if (aRank !== bRank) return aRank - bRank
        const aGate = a.gate ?? Number.MAX_SAFE_INTEGER
        const bGate = b.gate ?? Number.MAX_SAFE_INTEGER
        if (aGate !== bGate) return aGate - bGate
        return a.name.localeCompare(b.name)
      }),
    }
  })

  return NextResponse.json({
    data: {
      category: category.label,
      batches,
      stages: stageGroups,
    },
  })
}
