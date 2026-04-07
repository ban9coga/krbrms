'use server'

import { adminClient } from '../lib/auth'
import { resolveCategoryConfig } from './categoryResolver'
import { assertMotoEditable, assertMotoNotUnderProtest } from '../lib/motoLock'
import {
  computeQualification,
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

const orderRidersBySeedRows = (riderIds: string[], seedRows: StageResultSeedRow[]) => {
  const wanted = new Set(riderIds)
  const ordered = sortSeedRows(seedRows)
    .filter((row) => row.position !== null && wanted.has(row.rider_id))
    .map((row) => row.rider_id)

  const seen = new Set(ordered)
  const leftovers = riderIds.filter((id) => !seen.has(id)).sort((a, b) => a.localeCompare(b))
  return [...ordered, ...leftovers]
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

const buildGateRows = (motoId: string, riderIds: string[]) =>
  riderIds.map((riderId, index) => ({
    moto_id: motoId,
    rider_id: riderId,
    gate_position: index + 1,
  }))

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
    return { ok: false, warning: resolved.warning ?? 'Qualification disabled by resolver.' }
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
      assertMotoEditable(status)
      assertMotoNotUnderProtest(status)
    })
  } catch (err: unknown) {
    return { ok: false, warning: err instanceof Error ? err.message : 'Moto locked.' }
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
      return { batchId: moto1.id, batchIndex, riders, finishes }
    })

  if (batches.length === 0) return { ok: false, warning: 'No qualifying batches found.' }

  const { batchRanks, advances } = computeQualification(
    batches.map((b) => ({ batchId: b.batchId, riders: b.riders, finishes: b.finishes })),
    undefined,
    resolveQualificationPrimaryAdvance(resolved.stages)
  )

  const filteredAdvances = advances.filter((row) => {
    if (row.toStage === 'QUARTER_FINAL' && !resolved.stages.enableQuarterFinal) return false
    if (row.toStage === 'SEMI_FINAL' && !resolved.stages.enableSemiFinal) return false
    if (row.toStage === 'FINAL') {
      return resolved.finalClasses.includes(row.finalClass ?? '')
    }
    return true
  })

  // Only clear stages for batches that are complete to allow incremental updates.
  const completedBatchIds = batches
    .filter((b) => {
      const totalMotoRiders = b.riders.length * 2
      return b.finishes.length >= totalMotoRiders
    })
    .map((b) => b.batchId)

  if (completedBatchIds.length > 0) {
    await adminClient
      .from('race_stage_result')
      .delete()
      .eq('category_id', categoryId)
      .in('batch_id', completedBatchIds)
      .in('stage', ['QUALIFICATION'])
  }

  const qualificationRows = Object.entries(batchRanks).flatMap(([batchId, ranks]) => {
    if (!completedBatchIds.includes(batchId)) return []
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
    .filter((row) => completedRiderIds.has(row.riderId))
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
    .select('enabled, max_riders_per_race')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
    .maybeSingle()
  if (!config?.enabled) return { ok: false, warning: 'Advanced race disabled.' }

  const maxRiders = Math.max(4, Number(config.max_riders_per_race ?? 8))

  const { data: existingMotos, error: motoError } = await adminClient
    .from('motos')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
  if (motoError) return { ok: false, warning: motoError.message }
  try {
    (existingMotos ?? []).forEach((m) => {
      const status = (m as { status?: string | null }).status ?? null
      assertMotoEditable(status)
      assertMotoNotUnderProtest(status)
    })
  } catch (err: unknown) {
    return { ok: false, warning: err instanceof Error ? err.message : 'Moto locked.' }
  }

  const { data: stageRows, error } = await adminClient
    .from('race_stage_result')
    .select('rider_id, stage, final_class, batch_id, position, points')
    .eq('category_id', categoryId)
  if (error) return { ok: false, warning: error.message }

  const stageSeedRows = (stageRows ?? []) as StageResultSeedRow[]
  const qualificationRows = stageSeedRows.filter((row) => row.stage === 'QUALIFICATION')
  const quarterResultRows = stageSeedRows.filter((row) => row.stage === 'QUARTER_FINAL' && row.position !== null)
  const semiResultRows = stageSeedRows.filter((row) => row.stage === 'SEMI_FINAL' && row.position !== null)

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

  if (quarterRiders.length > 0) {
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

  const semiExists = await safeMotoNameExists(eventId, categoryId, 'Semi Final')
  if (!semiExists && semiRiders.length > 0) {
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

  const finalExists = await safeMotoNameExists(eventId, categoryId, 'Final')
  if (!finalExists && Object.keys(finals).length > 0) {
    const finalsToCreate = FINAL_CLASS_ORDER.filter((key) => (finals[key] ?? []).length > 0)
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
      const sourceRows =
        key === 'AMATEUR' || key === 'NOVICE' || key === 'BEGINNER' || key === 'ROOKIE'
          ? qualificationRows
          : key === 'ADVANCED' || key === 'INTERMEDIATE'
            ? quarterResultRows
            : semiResultRows
      const riders = orderRidersBySeedRows(finals[key] ?? [], sourceRows)
      riders.forEach((riderId) => newMotoRiders.push({ moto_id: m.id, rider_id: riderId }))
      newGatePositions.push(...buildGateRows(m.id, riders))
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
    .select('id, status')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
  if (motoError) return { ok: false, warning: motoError.message }
  try {
    (existingMotos ?? []).forEach((m) => {
      const status = (m as { status?: string | null }).status ?? null
      assertMotoEditable(status)
      assertMotoNotUnderProtest(status)
    })
  } catch (err: unknown) {
    return { ok: false, warning: err instanceof Error ? err.message : 'Moto locked.' }
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

  await adminClient
    .from('race_stage_result')
    .delete()
    .eq('category_id', categoryId)
    .in('stage', ['QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'])

  const quarterRows: Array<{
    rider_id: string
    category_id: string
    stage: string
    position: number | null
    points: number | null
    final_class?: string | null
  }> = []
  const semiRows: typeof quarterRows = []
  const finalRows: typeof quarterRows = []

  for (const moto of quarterMotos) {
    const riders = (motoRiders ?? []).filter((r) => r.moto_id === moto.id).map((r) => r.rider_id)
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
        position: r.rank,
        points: r.points,
      })
    })

    advances.forEach((r) => {
      if (r.toStage === 'SEMI_FINAL') {
        semiRows.push({
          rider_id: r.riderId,
          category_id: categoryId,
          stage: 'SEMI_FINAL',
          position: null,
          points: null,
        })
      } else {
        finalRows.push({
          rider_id: r.riderId,
          category_id: categoryId,
          stage: 'FINAL',
          final_class: r.finalClass ?? null,
          position: null,
          points: null,
        })
      }
    })
  }

  for (const moto of semiMotos) {
    const riders = (motoRiders ?? []).filter((r) => r.moto_id === moto.id).map((r) => r.rider_id)
    const scores: Record<string, number> = {}
    riders.forEach((id) => {
      const row = resultRows.find((r) => r.moto_id === moto.id && r.rider_id === id)
      scores[id] = row?.finish_order ?? 9999
    })
    const ranked = rankByPoints(scores)
    const advances = computeSemiFinal(ranked)
    ranked.forEach((r) => {
      semiRows.push({
        rider_id: r.riderId,
        category_id: categoryId,
        stage: 'SEMI_FINAL',
        position: r.rank,
        points: r.points,
      })
      const nextRows = advances.filter((row) => row.riderId === r.riderId)
      nextRows.forEach((next) => {
        finalRows.push({
          rider_id: r.riderId,
          category_id: categoryId,
          stage: 'FINAL',
          final_class: next.finalClass ?? null,
          position: null,
          points: null,
        })
      })
    })
  }

  for (const moto of finalMotos) {
    const finalClass = moto.moto_name.replace(/^Final\s+/i, '').trim().toUpperCase()
    const riders = (motoRiders ?? []).filter((r) => r.moto_id === moto.id).map((r) => r.rider_id)
    riders.forEach((id) => {
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

  const payload = [...quarterRows, ...semiRows, ...finalRows]
  if (payload.length > 0) {
    const { error: insertError } = await adminClient.from('race_stage_result').insert(payload)
    if (insertError) return { ok: false, warning: insertError.message }
  }

  return { ok: true }
}
