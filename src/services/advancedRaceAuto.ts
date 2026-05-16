'use server'

import { adminClient } from '../lib/auth'
import { resolveCategoryConfig } from './categoryResolver'
import { assertMotoNotUnderProtest } from '../lib/motoLock'
import {
  type CustomSplitRule,
  computeQualification,
  computeQualificationAdvancesFromRanks,
  computeQuarterFinal,
  computeSemiFinal,
  FINAL_CLASS_ORDER,
  resolveQualificationPrimaryAdvance,
  resolveQuarterFinalPrimaryAdvance,
} from './raceStageEngine'

type MotoRow = {
  id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
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

type StageResultSeedRow = {
  rider_id: string
  stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'FINAL'
  final_class: string | null
  batch_id: string | null
  position: number | null
  points: number | null
}

type CustomSplitRuleRow = {
  category_id: string
  source_stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'FINAL'
  rank_from: number
  rank_to: number
  target_stage: 'QUARTER_FINAL' | 'SEMI_FINAL' | 'FINAL'
  target_final_class: string | null
  sort_order: number
  split_basis?: 'COMBINED' | 'PER_BATCH' | 'CUSTOM_PER_BATCH' | null
  batch_no?: number | null
}

type QualificationRankRow = {
  riderId: string
  points: number
  rank: number
  batchId: string | null
  tieBreakers?: number[]
}

const compareTieBreakers = (a: number[] = [], b: number[] = []) => {
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const av = a[index] ?? 9999
    const bv = b[index] ?? 9999
    if (av !== bv) return av - bv
  }
  return 0
}

async function loadQualificationCustomSplitRules(categoryId: string): Promise<CustomSplitRule[]> {
  const { data, error } = await adminClient
    .from('race_category_custom_split_rule')
    .select('category_id, source_stage, rank_from, rank_to, target_stage, target_final_class, sort_order, split_basis, batch_no')
    .eq('category_id', categoryId)
    .eq('source_stage', 'QUALIFICATION')
    .order('sort_order', { ascending: true })
    .order('rank_from', { ascending: true })

  if (error) {
    console.warn(error.message)
    return []
  }

  return ((data ?? []) as CustomSplitRuleRow[]).map((row) => ({
    rankFrom: Number(row.rank_from),
    rankTo: Number(row.rank_to),
    targetStage: row.target_stage,
    targetFinalClass: row.target_final_class as CustomSplitRule['targetFinalClass'],
    sortOrder: Number(row.sort_order ?? 0),
    splitBasis: row.split_basis === 'CUSTOM_PER_BATCH' ? 'CUSTOM_PER_BATCH' : row.split_basis === 'PER_BATCH' ? 'PER_BATCH' : 'COMBINED',
    batchNo: row.batch_no != null ? Number(row.batch_no) : null,
  }))
}

const filterCustomSplitRulesForBatch = (
  rules: CustomSplitRule[],
  splitBasis: CustomSplitRule['splitBasis'],
  batchNo: number | null
) => {
  if (splitBasis === 'CUSTOM_PER_BATCH') {
    return rules.filter((rule) => (rule.batchNo ?? null) === batchNo)
  }
  return rules
}

const resolveAllowedFinalClasses = (resolvedFinalClasses: string[], customRules: CustomSplitRule[]) => {
  const allowed = new Set(resolvedFinalClasses)
  customRules.forEach((rule) => {
    if (rule.targetStage === 'FINAL' && rule.targetFinalClass) {
      allowed.add(rule.targetFinalClass)
    }
  })
  return allowed
}

const parseBatchKey = (name: string) => {
  const match = name.match(/moto\s*(\d+)\s*-\s*batch\s*(\d+)/i)
  if (!match) return null
  return { motoIndex: Number(match[1]), batchIndex: Number(match[2]) }
}

const safeMotoNameExists = async (eventId: string, categoryId: string, prefix: string) => {
  const { data, error } = await adminClient
    .from('motos')
    .select('id')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
    .ilike('moto_name', `${prefix}%`)
    .limit(1)
  if (error) return true
  return (data ?? []).length > 0
}

const tableExists = async (tableName: string) => {
  const { data, error } = await adminClient
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_name', tableName)
    .maybeSingle()
  if (error) return false
  return !!data?.table_name
}

const sortSeedRows = (rows: StageResultSeedRow[]) =>
  [...rows].sort((a, b) => {
    const positionDiff = (a.position ?? 9999) - (b.position ?? 9999)
    if (positionDiff !== 0) return positionDiff
    const pointsDiff = (a.points ?? 9999) - (b.points ?? 9999)
    if (pointsDiff !== 0) return pointsDiff
    const batchDiff = (a.batch_id ?? '').localeCompare(b.batch_id ?? '')
    if (batchDiff !== 0) return batchDiff
    return a.rider_id.localeCompare(b.rider_id)
  })

const sortFinalGateSeedRows = (rows: StageResultSeedRow[], batchOrderById: Record<string, number>) =>
  [...rows].sort((a, b) => {
    const pointsDiff = (a.points ?? 9999) - (b.points ?? 9999)
    if (pointsDiff !== 0) return pointsDiff
    const batchDiff = (a.batch_id ? batchOrderById[a.batch_id] ?? 9999 : 9999) - (b.batch_id ? batchOrderById[b.batch_id] ?? 9999 : 9999)
    if (batchDiff !== 0) return batchDiff
    const positionDiff = (a.position ?? 9999) - (b.position ?? 9999)
    if (positionDiff !== 0) return positionDiff
    return a.rider_id.localeCompare(b.rider_id)
  })

const orderRidersBySeedRows = (riderIds: string[], seedRows: StageResultSeedRow[]) => {
  const wanted = new Set(riderIds)
  const ordered = sortSeedRows(seedRows)
    .filter((row) => row.position !== null && wanted.has(row.rider_id))
    .map((row) => row.rider_id)

  const seen = new Set(ordered)
  const leftovers = riderIds.filter((id) => !seen.has(id)).sort((a, b) => a.localeCompare(b))
  return [...ordered, ...leftovers]
}

const orderFinalRidersBySeedRows = (
  riderIds: string[],
  seedRows: StageResultSeedRow[],
  batchOrderById: Record<string, number>
) => {
  const wanted = new Set(riderIds)
  const ordered = sortFinalGateSeedRows(seedRows, batchOrderById)
    .filter((row) => row.points !== null && wanted.has(row.rider_id))
    .map((row) => row.rider_id)

  const seen = new Set(ordered)
  const leftovers = riderIds.filter((id) => !seen.has(id)).sort((a, b) => a.localeCompare(b))
  return [...ordered, ...leftovers]
}

const buildQualificationSeedRowsFromCurrentResults = (
  motoRows: MotoRow[],
  motoRiderRows: MotoRiderRow[],
  resultRows: ResultRow[]
): StageResultSeedRow[] => {
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

  const requiredMotoCount = resolveQualificationMotoRequirement(batchMap.size)
  const batches = Array.from(batchMap.values())
    .filter((entry) => entry.moto1 && entry.moto2 && (requiredMotoCount < 3 || entry.moto3))
    .map((entry) => {
      const moto1 = entry.moto1 as MotoRow
      const moto2 = entry.moto2 as MotoRow
      const moto3 = entry.moto3 ?? null
      const riders = motoRiderRows.filter((row) => row.moto_id === moto1.id).map((row) => row.rider_id)
      const finishes = resultRows
        .filter((row) => row.moto_id === moto1.id || row.moto_id === moto2.id || (moto3 ? row.moto_id === moto3.id : false))
        .map((row) => ({
          riderId: row.rider_id,
          motoIndex: row.moto_id === moto1.id ? 1 : row.moto_id === moto2.id ? 2 : 3,
          finishOrder: row.finish_order,
        }))
      return { batchId: moto1.id, riders, finishes }
    })

  if (batches.length === 0) return []
  const qualificationReady = batches.every(
    (batch) => batch.riders.length > 0 && batch.finishes.length >= batch.riders.length * requiredMotoCount
  )
  if (!qualificationReady) return []

  const { batchRanks } = computeQualification(
    batches.map((batch) => ({ batchId: batch.batchId, riders: batch.riders, finishes: batch.finishes }))
  )

  return Object.entries(batchRanks).flatMap(([batchId, ranks]) =>
    ranks.map((row) => ({
      rider_id: row.riderId,
      stage: 'QUALIFICATION' as const,
      final_class: null,
      batch_id: batchId,
      position: row.rank,
      points: row.points,
    }))
  )
}

const distributeSeededHeats = (orderedRiders: string[], maxRiders: number) => {
  if (orderedRiders.length === 0) return [] as string[][]
  const heatCount = Math.max(1, Math.ceil(orderedRiders.length / maxRiders))
  const groups = Array.from({ length: heatCount }, () => [] as string[])

  orderedRiders.forEach((riderId, idx) => {
    const cycle = Math.floor(idx / heatCount)
    const offset = idx % heatCount
    const groupIndex = cycle % 2 === 0 ? offset : heatCount - 1 - offset
    groups[groupIndex].push(riderId)
  })

  return groups
}

const buildCenterOutGateOrder = (count: number) => {
  if (count <= 0) return [] as number[]

  if (count % 2 === 0) {
    const gateOrder: number[] = []
    let left = count / 2
    let right = left + 1
    while (gateOrder.length < count) {
      if (left >= 1) gateOrder.push(left)
      if (right <= count) gateOrder.push(right)
      left -= 1
      right += 1
    }
    return gateOrder
  }

  const gateOrder = [Math.ceil(count / 2)]
  let offset = 1
  while (gateOrder.length < count) {
    const left = gateOrder[0] - offset
    const right = gateOrder[0] + offset
    if (left >= 1) gateOrder.push(left)
    if (right <= count) gateOrder.push(right)
    offset += 1
  }
  return gateOrder
}

const buildGateRows = (motoId: string, riderIds: string[]) => {
  const gateOrder = buildCenterOutGateOrder(riderIds.length)
  return riderIds.map((riderId, index) => ({
    moto_id: motoId,
    rider_id: riderId,
    gate_position: gateOrder[index] ?? index + 1,
  }))
}

const buildSequentialGateRows = (motoId: string, riderIds: string[]) =>
  riderIds.map((riderId, index) => ({
    moto_id: motoId,
    rider_id: riderId,
    gate_position: index + 1,
  }))

const hasMotoResults = (motoId: string, resultRows: ResultRow[]) =>
  resultRows.some((row) => row.moto_id === motoId && row.finish_order !== null)

const isMotoComplete = (motoId: string, assignedRows: MotoRiderRow[], resultRows: ResultRow[]) => {
  const assignedRiders = assignedRows.filter((row) => row.moto_id === motoId).map((row) => row.rider_id)
  if (assignedRiders.length === 0) return false
  const completedRiders = new Set(resultRows.filter((row) => row.moto_id === motoId).map((row) => row.rider_id))
  return assignedRiders.every((riderId) => completedRiders.has(riderId))
}

const resolveQualificationMotoRequirement = (batchCount: number) => {
  if (batchCount === 1) return 3
  return 2
}

const buildQualificationProgress = (
  motoRows: MotoRow[],
  assignedRows: MotoRiderRow[],
  resultRows: ResultRow[]
) => {
  const batchMap = new Map<number, { moto1?: string; moto2?: string; moto3?: string }>()

  for (const moto of motoRows) {
    const parsed = parseBatchKey(moto.moto_name)
    if (!parsed) continue
    const entry = batchMap.get(parsed.batchIndex) ?? {}
    if (parsed.motoIndex === 1) entry.moto1 = moto.id
    if (parsed.motoIndex === 2) entry.moto2 = moto.id
    if (parsed.motoIndex === 3) entry.moto3 = moto.id
    batchMap.set(parsed.batchIndex, entry)
  }

  const requiredMotoCount = resolveQualificationMotoRequirement(batchMap.size)

  const completeBatchIds = Array.from(batchMap.values()).filter((entry) => {
    if (!entry.moto1 || !entry.moto2) return false
    if (requiredMotoCount >= 3 && !entry.moto3) return false
    return (
      isMotoComplete(entry.moto1, assignedRows, resultRows) &&
      isMotoComplete(entry.moto2, assignedRows, resultRows) &&
      (requiredMotoCount < 3 || isMotoComplete(entry.moto3 as string, assignedRows, resultRows))
    )
  })

  return {
    total: batchMap.size,
    complete: completeBatchIds.length,
    ready: batchMap.size > 0 && completeBatchIds.length === batchMap.size,
    requiredMotoCount,
  }
}

const sortQualificationRankRows = (rows: QualificationRankRow[]) =>
  [...rows].sort((a, b) => {
    if (a.points !== b.points) return a.points - b.points
    const tieDiff = compareTieBreakers(a.tieBreakers, b.tieBreakers)
    if (tieDiff !== 0) return tieDiff
    if (a.rank !== b.rank) return a.rank - b.rank
    const batchDiff = (a.batchId ?? '').localeCompare(b.batchId ?? '')
    if (batchDiff !== 0) return batchDiff
    return a.riderId.localeCompare(b.riderId)
  })

const rankCombinedQualificationRows = (rows: QualificationRankRow[]) => {
  const sorted = sortQualificationRankRows(rows)
  let currentRank = 0
  let lastPoints: number | null = null
  let lastBatchRank: number | null = null
  let lastTieBreakers: number[] | null = null

  return sorted.map((row, index) => {
    if (
      lastPoints === null ||
      row.points !== lastPoints ||
      compareTieBreakers(row.tieBreakers, lastTieBreakers ?? []) !== 0 ||
      row.rank !== lastBatchRank
    ) {
      currentRank = index + 1
      lastPoints = row.points
      lastBatchRank = row.rank
      lastTieBreakers = row.tieBreakers ?? []
    }
    return {
      riderId: row.riderId,
      points: row.points,
      rank: currentRank,
    }
  })
}

const areAllMotosComplete = (motos: MotoRow[], assignedRows: MotoRiderRow[], resultRows: ResultRow[]) =>
  motos.length > 0 && motos.every((moto) => isMotoComplete(moto.id, assignedRows, resultRows))

const isFinalClassReady = (
  finalClass: string,
  stages: { enableQuarterFinal: boolean; enableSemiFinal: boolean },
  readiness: { qualificationReady: boolean; quarterReady: boolean; semiReady: boolean }
) => {
  if (finalClass === 'ADVANCED' || finalClass === 'ACADEMY' || finalClass === 'AMATEUR' || finalClass === 'BEGINNER') {
    return readiness.qualificationReady
  }

  if (finalClass === 'PRO' || finalClass === 'ROOKIE') {
    return stages.enableQuarterFinal ? readiness.quarterReady : readiness.qualificationReady
  }

  if (finalClass === 'ELITE' || finalClass === 'NOVICE') {
    if (stages.enableSemiFinal) return readiness.semiReady
    return readiness.qualificationReady
  }

  return readiness.qualificationReady
}

export async function computeQualificationAndStore(eventId: string, categoryId: string) {
  const { data: config } = await adminClient
    .from('race_stage_config')
    .select('enabled, qualification_moto_count')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
    .maybeSingle()
  if (!config?.enabled) return { ok: false, warning: 'Advanced race disabled.' }

  const resolved = await resolveCategoryConfig(categoryId)
  if (!resolved.stages.enableQualification) {
    return { ok: true, warning: 'Qualification not required for single batch.' }
  }

  const { data: motos, error: motoError } = await adminClient
    .from('motos')
    .select('id, moto_name, moto_order, status')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
    .order('moto_order', { ascending: true })
  if (motoError) return { ok: false, warning: motoError.message }
  const motoRows = (motos ?? []) as MotoRow[]
  if (motoRows.length === 0) return { ok: false, warning: 'No motos for category.' }
  try {
    motoRows.forEach((m) => {
      const status = (m as { status?: string | null }).status ?? null
      assertMotoNotUnderProtest(status)
    })
  } catch (err: unknown) {
    return { ok: false, warning: err instanceof Error ? err.message : 'Moto under protest review.' }
  }

  const motoIds = motoRows.map((m) => m.id)
  const { data: results, error: resultError } = await adminClient
    .from('results')
    .select('moto_id, rider_id, finish_order')
    .in('moto_id', motoIds)
  if (resultError) return { ok: false, warning: resultError.message }
  const resultRows = (results ?? []) as ResultRow[]

  const { data: motoRiders, error: riderError } = await adminClient
    .from('moto_riders')
    .select('moto_id, rider_id')
    .in('moto_id', motoIds)
  if (riderError) return { ok: false, warning: riderError.message }
  const motoRiderRows = (motoRiders ?? []) as MotoRiderRow[]

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

  const requiredMotoCount = resolveQualificationMotoRequirement(batchMap.size)
  const allowSingleBatchThreeMotoQualification = batchMap.size === 1 && requiredMotoCount >= 3
  if (!resolved.stages.enableQualification && !allowSingleBatchThreeMotoQualification) {
    return { ok: false, warning: resolved.warning ?? 'Qualification disabled by resolver.' }
  }

  const batches = Array.from(batchMap.entries())
    .filter(([, entry]) => entry.moto1 && entry.moto2 && (requiredMotoCount < 3 || entry.moto3))
    .map(([batchIndex, entry]) => {
      const moto1 = entry.moto1 as MotoRow
      const moto2 = entry.moto2 as MotoRow
      const moto3 = entry.moto3 ?? null
      const riders = motoRiderRows
        .filter((row) => row.moto_id === moto1.id)
        .map((row) => row.rider_id)
      const finishes = resultRows
        .filter((row) => row.moto_id === moto1.id || row.moto_id === moto2.id || (moto3 ? row.moto_id === moto3.id : false))
        .map((row) => ({
          riderId: row.rider_id,
          motoIndex: row.moto_id === moto1.id ? 1 : row.moto_id === moto2.id ? 2 : 3,
          finishOrder: row.finish_order,
        }))
      return { batchId: moto1.id, batchIndex, riders, finishes }
    })

  if (batches.length === 0) return { ok: false, warning: 'No qualifying batches found.' }

  const customQualificationRules = await loadQualificationCustomSplitRules(categoryId)
  const qualificationReady = batches.every(
    (batch) => batch.riders.length > 0 && batch.finishes.length >= batch.riders.length * requiredMotoCount
  )
  if (!qualificationReady) {
    return { ok: false, warning: 'Qualification incomplete.' }
  }
  const allowedFinalClasses = resolveAllowedFinalClasses(resolved.finalClasses, customQualificationRules)

  const { batchRanks } = computeQualification(
    batches.map((b) => ({ batchId: b.batchId, riders: b.riders, finishes: b.finishes })),
    undefined,
    resolveQualificationPrimaryAdvance(resolved.stages),
    customQualificationRules,
    { singleBatchFinalElite: batches.length === 1 }
  )
  const customSplitBasis = customQualificationRules[0]?.splitBasis ?? 'COMBINED'
  const useCombinedCustomSplit =
    customQualificationRules.length > 0 && customSplitBasis === 'COMBINED' && batches.length > 1
  const combinedQualificationRanks = useCombinedCustomSplit
    ? rankCombinedQualificationRows(
        Object.entries(batchRanks).flatMap(([batchId, ranks]) =>
          ranks.map((row) => ({
            riderId: row.riderId,
            points: row.points,
            rank: row.rank,
            batchId,
            tieBreakers: row.tieBreakers ?? [],
          }))
        )
      )
    : []
  const effectiveAdvances = useCombinedCustomSplit
    ? computeQualificationAdvancesFromRanks(
        combinedQualificationRanks,
        resolveQualificationPrimaryAdvance(resolved.stages),
        customQualificationRules
      )
    : batches.flatMap((batch) =>
        computeQualificationAdvancesFromRanks(
          batchRanks[batch.batchId] ?? [],
          resolveQualificationPrimaryAdvance(resolved.stages),
          filterCustomSplitRulesForBatch(customQualificationRules, customSplitBasis, batch.batchIndex),
          { singleBatchFinalElite: batches.length === 1 }
        )
      )

  const filteredAdvances = effectiveAdvances.filter((row) => {
    if (row.toStage === 'QUARTER_FINAL' && !resolved.stages.enableQuarterFinal) return false
    if (row.toStage === 'SEMI_FINAL' && !resolved.stages.enableSemiFinal) return false
    if (row.toStage === 'FINAL') {
      return allowedFinalClasses.has(row.finalClass ?? '')
    }
    return true
  })

  await adminClient
    .from('race_stage_result')
    .delete()
    .eq('category_id', categoryId)
    .in('stage', ['QUALIFICATION'])

  const qualificationRows = Object.entries(batchRanks).flatMap(([batchId, ranks]) => {
    return ranks.map((row) => ({
      rider_id: row.riderId,
      category_id: categoryId,
      stage: 'QUALIFICATION',
      batch_id: batchId,
      position: row.rank,
      points: row.points,
    }))
  })

  const completedRiderIds = new Set(
    qualificationRows.map((row) => row.rider_id)
  )

  const completedRiderList = Array.from(completedRiderIds)
  if (completedRiderList.length > 0) {
    await adminClient
      .from('race_stage_result')
      .delete()
      .eq('category_id', categoryId)
      .in('rider_id', completedRiderList)
      .in('stage', ['QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'])
  }

  const advanceRows = filteredAdvances
    .map((row) => ({
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
    if (insertError) return { ok: false, warning: insertError.message }
  }

  return { ok: true }
}

export async function generateStageMotos(eventId: string, categoryId: string) {
  const { data: config } = await adminClient
    .from('race_stage_config')
    .select('enabled, max_riders_per_race, qualification_moto_count')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
    .maybeSingle()
  if (!config?.enabled) return { ok: false, warning: 'Advanced race disabled.' }

  const maxRiders = Math.max(4, Number(config.max_riders_per_race ?? 8))
  const resolved = await resolveCategoryConfig(categoryId)

  const { data: existingMotos, error: motoError } = await adminClient
    .from('motos')
    .select('id, moto_name, moto_order, status')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
    .order('moto_order', { ascending: true })
  if (motoError) return { ok: false, warning: motoError.message }
  try {
    (existingMotos ?? []).forEach((m) => {
      const status = (m as { status?: string | null }).status ?? null
      assertMotoNotUnderProtest(status)
    })
  } catch (err: unknown) {
    return { ok: false, warning: err instanceof Error ? err.message : 'Moto under protest review.' }
  }
  const existingMotoRows = (existingMotos ?? []) as MotoRow[]
  const existingMotoIds = existingMotoRows.map((m) => m.id)

  const { data: categoryMotoRiders, error: riderSnapshotError } = existingMotoIds.length
    ? await adminClient.from('moto_riders').select('moto_id, rider_id').in('moto_id', existingMotoIds)
    : { data: [], error: null }
  if (riderSnapshotError) return { ok: false, warning: riderSnapshotError.message }

  const { data: categoryResults, error: resultSnapshotError } = existingMotoIds.length
    ? await adminClient.from('results').select('moto_id, rider_id, finish_order').in('moto_id', existingMotoIds)
    : { data: [], error: null }
  if (resultSnapshotError) return { ok: false, warning: resultSnapshotError.message }

  const categoryMotoRiderRows = (categoryMotoRiders ?? []) as MotoRiderRow[]
  const categoryResultRows = (categoryResults ?? []) as ResultRow[]
  const seedBatchOrderById = existingMotoRows.reduce<Record<string, number>>((acc, moto) => {
    const batchKey = parseBatchKey(moto.moto_name)
    if (batchKey && batchKey.motoIndex === 1) {
      acc[moto.id] = batchKey.batchIndex
      return acc
    }
    const heatMatch = moto.moto_name.match(/heat\s*(\d+)/i)
    if (heatMatch) {
      acc[moto.id] = Number(heatMatch[1])
    }
    return acc
  }, {})
  const qualificationProgress = buildQualificationProgress(
    existingMotoRows,
    categoryMotoRiderRows,
    categoryResultRows
  )
  const existingQuarterMotos = existingMotoRows.filter((moto) => /^Quarter Final/i.test(moto.moto_name))
  const existingSemiMotos = existingMotoRows.filter((moto) => /^Semi Final/i.test(moto.moto_name))
  const existingFinalMotos = existingMotoRows.filter((moto) => /^Final /i.test(moto.moto_name))
  const readiness = {
    qualificationReady: qualificationProgress.ready,
    quarterReady: areAllMotosComplete(existingQuarterMotos, categoryMotoRiderRows, categoryResultRows),
    semiReady: areAllMotosComplete(existingSemiMotos, categoryMotoRiderRows, categoryResultRows),
  }

  const { data: stageRows, error } = await adminClient
    .from('race_stage_result')
    .select('rider_id, stage, final_class, batch_id, position, points')
    .eq('category_id', categoryId)
  if (error) return { ok: false, warning: error.message }

  const stageSeedRows = (stageRows ?? []) as StageResultSeedRow[]
  const qualificationRows = stageSeedRows.filter((row) => row.stage === 'QUALIFICATION')
  const currentQualificationSeedRows = buildQualificationSeedRowsFromCurrentResults(
    existingMotoRows,
    categoryMotoRiderRows,
    categoryResultRows
  )
  const finalGateSeedRows = currentQualificationSeedRows.length > 0 ? currentQualificationSeedRows : qualificationRows
  const quarterResultRows = stageSeedRows.filter((row) => row.stage === 'QUARTER_FINAL' && row.position !== null)

  const quarterRiders = orderRidersBySeedRows(
    stageSeedRows.filter((r) => r.stage === 'QUARTER_FINAL').map((r) => r.rider_id),
    qualificationRows
  )
  const semiRiders = orderRidersBySeedRows(
    stageSeedRows.filter((r) => r.stage === 'SEMI_FINAL').map((r) => r.rider_id),
    quarterResultRows
  )
  const finals = stageSeedRows
    .filter((r) => r.stage === 'FINAL' && r.final_class)
    .reduce<Record<string, string[]>>((acc, r) => {
      const key = r.final_class as string
      if (!acc[key]) acc[key] = []
      acc[key].push(r.rider_id)
      return acc
    }, {})

  const { data: lastOrderRow } = await adminClient
    .from('motos')
    .select('moto_order')
    .eq('event_id', eventId)
    .order('moto_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  let nextOrder = (lastOrderRow?.moto_order ?? 0) + 1

  const newMotos: Array<{ event_id: string; category_id: string; moto_name: string; moto_order: number; status: string }> = []
  const newMotoRiders: Array<{ moto_id: string; rider_id: string }> = []
  const newGatePositions: Array<{ moto_id: string; rider_id: string; gate_position: number }> = []
  const gateTableReady = await tableExists('moto_gate_positions')

  if (readiness.qualificationReady && quarterRiders.length > 0) {
    const existingQuarterMotos = await loadStageMotos(eventId, categoryId, 'Quarter Final')
    const existingQuarterIds = existingQuarterMotos.map((m) => m.id)
    const assignedQuarter = new Set<string>()
    if (existingQuarterIds.length > 0) {
      const { data: assignedRows } = await adminClient
        .from('moto_riders')
        .select('moto_id, rider_id')
        .in('moto_id', existingQuarterIds)
      for (const row of assignedRows ?? []) {
        assignedQuarter.add(row.rider_id)
      }
    }

    const pendingQuarter = quarterRiders.filter((id) => !assignedQuarter.has(id))
    if (pendingQuarter.length > 0) {
      const groups = distributeSeededHeats(pendingQuarter, maxRiders)
      const startIndex = existingQuarterMotos.length
      groups.forEach((_, idx) => {
        newMotos.push({
          event_id: eventId,
          category_id: categoryId,
          moto_name: `Quarter Final - Heat ${startIndex + idx + 1}`,
          moto_order: nextOrder++,
          status: 'UPCOMING',
        })
      })
      const { data: motoRows, error: motoError } = await adminClient
        .from('motos')
        .insert(newMotos.slice(-groups.length))
        .select('id')
      if (motoError || !motoRows) return { ok: false, warning: motoError?.message || 'Failed to create QF motos.' }
      motoRows.forEach((m, i) => {
        groups[i].forEach((riderId) => newMotoRiders.push({ moto_id: m.id, rider_id: riderId }))
        newGatePositions.push(...buildGateRows(m.id, groups[i]))
      })
    }
  }

  const semiSourceReady = resolved.stages.enableQuarterFinal ? readiness.quarterReady : readiness.qualificationReady
  const semiExists = await safeMotoNameExists(eventId, categoryId, 'Semi Final')
  if (semiSourceReady && !semiExists && semiRiders.length > 0) {
    const groups = distributeSeededHeats(semiRiders, maxRiders)
    const { data: motoRows, error: motoError } = await adminClient
      .from('motos')
      .insert(
        groups.map((_, idx) => ({
          event_id: eventId,
          category_id: categoryId,
          moto_name: `Semi Final - Heat ${idx + 1}`,
          moto_order: nextOrder++,
          status: 'UPCOMING',
        }))
      )
      .select('id')
    if (motoError || !motoRows) return { ok: false, warning: motoError?.message || 'Failed to create SF motos.' }
    motoRows.forEach((m, i) => {
      groups[i].forEach((riderId) => newMotoRiders.push({ moto_id: m.id, rider_id: riderId }))
      newGatePositions.push(...buildGateRows(m.id, groups[i]))
    })
  }

  const existingFinalClasses = new Set(
    existingFinalMotos.map((moto) => moto.moto_name.replace(/^Final\s+/i, '').trim().toUpperCase())
  )
  const existingFinalMotoRiders = existingFinalMotos.length
    ? (
        await adminClient
          .from('moto_riders')
          .select('moto_id, rider_id')
          .in('moto_id', existingFinalMotos.map((m) => m.id))
      ).data ?? []
    : []
  const existingFinalRiderMap = new Map<string, string[]>()
  for (const row of existingFinalMotoRiders as MotoRiderRow[]) {
    const list = existingFinalRiderMap.get(row.moto_id) ?? []
    list.push(row.rider_id)
    existingFinalRiderMap.set(row.moto_id, list)
  }

  for (const moto of existingFinalMotos) {
    const finalClass = moto.moto_name.replace(/^Final\s+/i, '').trim().toUpperCase()
    const desiredRiders = finals[finalClass] ?? []
    const finalReady = isFinalClassReady(finalClass, resolved.stages, readiness)
    const motoHasResults = hasMotoResults(moto.id, categoryResultRows)
    const currentRiders = [...(existingFinalRiderMap.get(moto.id) ?? [])].sort((a, b) => a.localeCompare(b))
    const orderedDesiredRiders = orderFinalRidersBySeedRows(desiredRiders, finalGateSeedRows, seedBatchOrderById)
    const desiredSorted = [...orderedDesiredRiders].sort((a, b) => a.localeCompare(b))

    if ((!finalReady || desiredRiders.length === 0) && !motoHasResults) {
      await adminClient.from('motos').delete().eq('id', moto.id)
      existingFinalClasses.delete(finalClass)
      continue
    }

    if (!motoHasResults) {
      const sameAssignments =
        currentRiders.length === desiredSorted.length &&
        currentRiders.every((riderId, index) => riderId === desiredSorted[index])

      if (!sameAssignments) {
        await adminClient.from('moto_riders').delete().eq('moto_id', moto.id)
        if (orderedDesiredRiders.length > 0) {
          await adminClient
            .from('moto_riders')
            .insert(orderedDesiredRiders.map((riderId) => ({ moto_id: moto.id, rider_id: riderId })))
        }
      }

      if (gateTableReady && orderedDesiredRiders.length > 0) {
        await adminClient.from('moto_gate_positions').delete().eq('moto_id', moto.id)
        const { error: gateRefreshError } = await adminClient
          .from('moto_gate_positions')
          .insert(buildSequentialGateRows(moto.id, orderedDesiredRiders))
        if (gateRefreshError) return { ok: false, warning: gateRefreshError.message }
      }
    }
  }

  const finalsToCreate = FINAL_CLASS_ORDER.filter(
    (key) => (finals[key] ?? []).length > 0 && !existingFinalClasses.has(key) && isFinalClassReady(key, resolved.stages, readiness)
  )
  if (finalsToCreate.length > 0) {
    const { data: motoRows, error: motoError } = await adminClient
      .from('motos')
      .insert(
        finalsToCreate.map((finalClass) => ({
          event_id: eventId,
          category_id: categoryId,
          moto_name: `Final ${finalClass}`,
          moto_order: nextOrder++,
          status: 'UPCOMING',
        }))
      )
      .select('id, moto_name')
    if (motoError || !motoRows) return { ok: false, warning: motoError?.message || 'Failed to create Final motos.' }
    motoRows.forEach((m) => {
      const key = m.moto_name.replace('Final ', '')
      const riders = orderFinalRidersBySeedRows(finals[key] ?? [], finalGateSeedRows, seedBatchOrderById)
      riders.forEach((riderId) => newMotoRiders.push({ moto_id: m.id, rider_id: riderId }))
      newGatePositions.push(...buildSequentialGateRows(m.id, riders))
    })
  }

  if (newMotoRiders.length > 0) {
    const { error: riderError } = await adminClient.from('moto_riders').insert(newMotoRiders)
    if (riderError) return { ok: false, warning: riderError.message }
  }

  if (gateTableReady && newGatePositions.length > 0) {
    const { error: gateError } = await adminClient.from('moto_gate_positions').insert(newGatePositions)
    if (gateError) return { ok: false, warning: gateError.message }
  }

  return { ok: true }
}

type RankedRow = { riderId: string; points: number; rank: number }

const rankByPoints = (scores: Record<string, number>): RankedRow[] => {
  const rows = Object.entries(scores)
    .map(([riderId, points]) => ({ riderId, points }))
    .sort((a, b) => a.points - b.points)
  let currentRank = 0
  let lastPoints: number | null = null
  return rows.map((row, idx) => {
    if (lastPoints === null || row.points !== lastPoints) {
      currentRank = idx + 1
      lastPoints = row.points
    }
    return { ...row, rank: currentRank }
  })
}

const loadStageMotos = async (eventId: string, categoryId: string, prefix: string) => {
  const { data, error } = await adminClient
    .from('motos')
    .select('id, moto_name')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
    .ilike('moto_name', `${prefix}%`)
    .order('moto_order', { ascending: true })
  if (error) return []
  return data ?? []
}

export async function computeStageAdvances(eventId: string, categoryId: string) {
  const { data: config } = await adminClient
    .from('race_stage_config')
    .select('enabled, max_riders_per_race')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
    .maybeSingle()
  if (!config?.enabled) return { ok: false, warning: 'Advanced race disabled.' }
  const resolved = await resolveCategoryConfig(categoryId)

  const { data: existingMotos, error: motoError } = await adminClient
    .from('motos')
    .select('id, moto_name, status')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
  if (motoError) return { ok: false, warning: motoError.message }
  try {
    (existingMotos ?? []).forEach((m) => {
      const status = (m as { status?: string | null }).status ?? null
      assertMotoNotUnderProtest(status)
    })
  } catch (err: unknown) {
    return { ok: false, warning: err instanceof Error ? err.message : 'Moto under protest review.' }
  }

  const quarterMotos = await loadStageMotos(eventId, categoryId, 'Quarter Final')
  const semiMotos = await loadStageMotos(eventId, categoryId, 'Semi Final')
  const finalMotos = await loadStageMotos(eventId, categoryId, 'Final ')

  const allMotos = [...quarterMotos, ...semiMotos, ...finalMotos]
  if (allMotos.length === 0) return { ok: false, warning: 'No stage motos found.' }

  const motoIds = allMotos.map((m) => m.id)
  const { data: results, error: resultError } = await adminClient
    .from('results')
    .select('moto_id, rider_id, finish_order')
    .in('moto_id', motoIds)
  if (resultError) return { ok: false, warning: resultError.message }
  const resultRows = (results ?? []) as Array<{ moto_id: string; rider_id: string; finish_order: number | null }>

  const { data: motoRiders, error: riderError } = await adminClient
    .from('moto_riders')
    .select('moto_id, rider_id')
    .in('moto_id', motoIds)
  if (riderError) return { ok: false, warning: riderError.message }
  const motoRiderRows = (motoRiders ?? []) as MotoRiderRow[]

  const { data: qualificationStageRows, error: qualificationStageError } = await adminClient
    .from('race_stage_result')
    .select('rider_id, batch_id, position, points')
    .eq('category_id', categoryId)
    .eq('stage', 'QUALIFICATION')
  if (qualificationStageError) return { ok: false, warning: qualificationStageError.message }

  await adminClient
    .from('race_stage_result')
    .delete()
    .eq('category_id', categoryId)
    .in('stage', ['QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'])

  const quarterRows: Array<{
    rider_id: string
    category_id: string
    stage: string
    batch_id?: string | null
    position: number | null
    points: number | null
    final_class?: string | null
  }> = []
  const semiRows: typeof quarterRows = []
  const finalRows: typeof quarterRows = []

  const addFinalAssignment = (target: Map<string, string>, riderId: string, finalClass: string | null | undefined) => {
    if (!finalClass) return
    target.set(riderId, finalClass)
  }

  const qualificationRanksByBatch = ((qualificationStageRows ?? []) as Array<{
    rider_id: string
    batch_id: string | null
    position: number | null
    points: number | null
  }>)
    .filter((row) => row.batch_id && row.position !== null)
    .reduce<Record<string, RankedRow[]>>((acc, row) => {
      const batchId = row.batch_id as string
      if (!acc[batchId]) acc[batchId] = []
      acc[batchId].push({
        riderId: row.rider_id,
        points: row.points ?? 9999,
        rank: row.position ?? 9999,
      })
      return acc
    }, {})
  const qualificationBatchIndexById = ((existingMotos ?? []) as Array<{ id: string; moto_name?: string | null }>)
    .reduce<Record<string, number>>((acc, moto) => {
      const parsed = parseBatchKey(moto.moto_name ?? '')
      if (parsed && parsed.motoIndex === 1) {
        acc[moto.id] = parsed.batchIndex
      }
      return acc
    }, {})

  const pendingQuarterRiders = new Set<string>()
  const pendingSemiRiders = new Set<string>()
  const pendingFinalAssignments = new Map<string, string>()
  const customQualificationRules = await loadQualificationCustomSplitRules(categoryId)
  const qualificationBatchCount = Object.keys(qualificationRanksByBatch).length
  const customSplitBasis = customQualificationRules[0]?.splitBasis ?? 'COMBINED'
  const useCombinedCustomSplit =
    customQualificationRules.length > 0 && customSplitBasis === 'COMBINED' && qualificationBatchCount > 1
  const qualificationAdvances = useCombinedCustomSplit
    ? computeQualificationAdvancesFromRanks(
        rankCombinedQualificationRows(
          Object.entries(qualificationRanksByBatch).flatMap(([batchId, rankedRows]) =>
            rankedRows.map((row) => ({
              riderId: row.riderId,
              points: row.points,
              rank: row.rank,
              batchId,
            }))
          )
        ),
        resolveQualificationPrimaryAdvance(resolved.stages),
        customQualificationRules
      )
    : Object.entries(qualificationRanksByBatch).flatMap(([batchId, rankedRows]) => {
        const batchIndex = qualificationBatchIndexById[batchId] ?? null
        const orderedRanks = [...rankedRows].sort(
          (a, b) => a.rank - b.rank || a.points - b.points || a.riderId.localeCompare(b.riderId)
        )
        return computeQualificationAdvancesFromRanks(
          orderedRanks,
          resolveQualificationPrimaryAdvance(resolved.stages),
          filterCustomSplitRulesForBatch(customQualificationRules, customSplitBasis, batchIndex),
          { singleBatchFinalElite: qualificationBatchCount === 1 }
        )
      })

  qualificationAdvances.forEach((advance) => {
    if (advance.toStage === 'QUARTER_FINAL') {
      pendingQuarterRiders.add(advance.riderId)
      return
    }
    if (advance.toStage === 'SEMI_FINAL') {
      pendingSemiRiders.add(advance.riderId)
      return
    }
    addFinalAssignment(pendingFinalAssignments, advance.riderId, advance.finalClass)
  })

  const completedQuarterRiders = new Set<string>()
  const quarterDerivedSemiRiders = new Set<string>()
  const quarterDerivedFinalAssignments = new Map<string, string>()

  for (const moto of quarterMotos) {
    if (!isMotoComplete(moto.id, motoRiderRows, resultRows)) continue

    const riders = motoRiderRows.filter((r) => r.moto_id === moto.id).map((r) => r.rider_id)
    const scores: Record<string, number> = {}
    riders.forEach((id) => {
      const row = resultRows.find((r) => r.moto_id === moto.id && r.rider_id === id)
      scores[id] = row?.finish_order ?? 9999
    })
    const ranked = rankByPoints(scores)
    const advances = computeQuarterFinal(ranked, resolveQuarterFinalPrimaryAdvance(resolved.stages))

    ranked.forEach((r) => {
      quarterRows.push({
        rider_id: r.riderId,
        category_id: categoryId,
        stage: 'QUARTER_FINAL',
        batch_id: moto.id,
        position: r.rank,
        points: r.points,
      })
    })

    advances.forEach((r) => {
      completedQuarterRiders.add(r.riderId)
      if (r.toStage === 'SEMI_FINAL') {
        quarterDerivedSemiRiders.add(r.riderId)
      } else {
        addFinalAssignment(quarterDerivedFinalAssignments, r.riderId, r.finalClass)
      }
    })
  }

  Array.from(pendingQuarterRiders)
    .filter((riderId) => !completedQuarterRiders.has(riderId))
    .forEach((riderId) => {
      quarterRows.push({
        rider_id: riderId,
        category_id: categoryId,
        stage: 'QUARTER_FINAL',
        position: null,
        points: null,
      })
    })

  const completedSemiRiders = new Set<string>()
  const semiDerivedFinalAssignments = new Map<string, string>()

  for (const moto of semiMotos) {
    if (!isMotoComplete(moto.id, motoRiderRows, resultRows)) continue

    const riders = motoRiderRows.filter((r) => r.moto_id === moto.id).map((r) => r.rider_id)
    const scores: Record<string, number> = {}
    riders.forEach((id) => {
      const row = resultRows.find((r) => r.moto_id === moto.id && r.rider_id === id)
      scores[id] = row?.finish_order ?? 9999
    })
    const ranked = rankByPoints(scores)
    const advances = computeSemiFinal(ranked)
    ranked.forEach((r) => {
      completedSemiRiders.add(r.riderId)
      semiRows.push({
        rider_id: r.riderId,
        category_id: categoryId,
        stage: 'SEMI_FINAL',
        batch_id: moto.id,
        position: r.rank,
        points: r.points,
      })
      const nextRows = advances.filter((row) => row.riderId === r.riderId)
      nextRows.forEach((next) => {
        addFinalAssignment(semiDerivedFinalAssignments, r.riderId, next.finalClass)
      })
    })
  }

  Array.from(new Set([...pendingSemiRiders, ...quarterDerivedSemiRiders]))
    .filter((riderId) => !completedSemiRiders.has(riderId))
    .forEach((riderId) => {
      semiRows.push({
        rider_id: riderId,
        category_id: categoryId,
        stage: 'SEMI_FINAL',
        position: null,
        points: null,
      })
    })

  const completedFinalRiders = new Set<string>()
  for (const moto of finalMotos) {
    if (!isMotoComplete(moto.id, motoRiderRows, resultRows)) continue

    const finalClass = moto.moto_name.replace(/^Final\s+/i, '').trim().toUpperCase()
    const riders = motoRiderRows.filter((r) => r.moto_id === moto.id).map((r) => r.rider_id)
    riders.forEach((id) => {
      completedFinalRiders.add(id)
      const row = resultRows.find((r) => r.moto_id === moto.id && r.rider_id === id)
      finalRows.push({
        rider_id: id,
        category_id: categoryId,
        stage: 'FINAL',
        final_class: finalClass,
        position: row?.finish_order ?? null,
        points: row?.finish_order ?? null,
      })
    })
  }

  const finalAssignments = new Map<string, string>()
  pendingFinalAssignments.forEach((finalClass, riderId) => addFinalAssignment(finalAssignments, riderId, finalClass))
  quarterDerivedFinalAssignments.forEach((finalClass, riderId) => addFinalAssignment(finalAssignments, riderId, finalClass))
  semiDerivedFinalAssignments.forEach((finalClass, riderId) => addFinalAssignment(finalAssignments, riderId, finalClass))

  finalAssignments.forEach((finalClass, riderId) => {
    if (completedFinalRiders.has(riderId)) return
    finalRows.push({
      rider_id: riderId,
      category_id: categoryId,
      stage: 'FINAL',
      final_class: finalClass,
      position: null,
      points: null,
    })
  })

  const payload = [...quarterRows, ...semiRows, ...finalRows]
  if (payload.length > 0) {
    const { error: insertError } = await adminClient.from('race_stage_result').insert(payload)
    if (insertError) return { ok: false, warning: insertError.message }
  }

  return { ok: true }
}

export async function syncAdvancedRaceProgress(eventId: string, categoryId: string) {
  const qualificationResult = await computeQualificationAndStore(eventId, categoryId)
  if (qualificationResult.ok && qualificationResult.warning === 'Qualification not required for single batch.') {
    return { ok: true, warning: qualificationResult.warning }
  }
  if (!qualificationResult.ok && qualificationResult.warning !== 'No qualifying batches found.') {
    return qualificationResult
  }

  const stageAdvanceResult = await computeStageAdvances(eventId, categoryId)
  if (!stageAdvanceResult.ok && stageAdvanceResult.warning !== 'No stage motos found.') {
    return stageAdvanceResult
  }

  return generateStageMotos(eventId, categoryId)
}
