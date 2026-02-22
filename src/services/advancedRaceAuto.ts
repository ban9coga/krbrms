'use server'

import { adminClient } from '../lib/auth'
import { resolveCategoryConfig } from './categoryResolver'
import { computeQualification } from './raceStageEngine'

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

const chunk = <T,>(items: T[], size: number) => {
  const out: T[][] = []
  let cursor = 0
  while (cursor < items.length) {
    out.push(items.slice(cursor, cursor + size))
    cursor += size
  }
  return out
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
    batches.map((b) => ({ batchId: b.batchId, riders: b.riders, finishes: b.finishes }))
  )

  const mappedAdvances = !resolved.stages.enableQuarterFinal && resolved.stages.enableSemiFinal
    ? advances.map((row) =>
        row.toStage === 'QUARTER_FINAL' ? { ...row, toStage: 'SEMI_FINAL' as const } : row
      )
    : advances

  const filteredAdvances = mappedAdvances.filter((row) => {
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

  const { data: stageRows, error } = await adminClient
    .from('race_stage_result')
    .select('rider_id, stage, final_class')
    .eq('category_id', categoryId)
  if (error) return { ok: false, warning: error.message }

  const quarterRiders = (stageRows ?? []).filter((r) => r.stage === 'QUARTER_FINAL').map((r) => r.rider_id)
  const semiRiders = (stageRows ?? []).filter((r) => r.stage === 'SEMI_FINAL').map((r) => r.rider_id)
  const finals = (stageRows ?? [])
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
      const groups = chunk(pendingQuarter, maxRiders)
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
      })
    }
  }

  const semiExists = await safeMotoNameExists(eventId, categoryId, 'Semi Final')
  if (!semiExists && semiRiders.length > 0) {
    const groups = chunk(semiRiders, maxRiders)
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
    })
  }

  const finalExists = await safeMotoNameExists(eventId, categoryId, 'Final')
  if (!finalExists && Object.keys(finals).length > 0) {
    const order = ['BEGINNER', 'AMATEUR', 'ACADEMY', 'ROOKIE', 'PRO', 'NOVICE', 'ELITE']
    const finalsToCreate = order.filter((key) => (finals[key] ?? []).length > 0)
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
      const riders = finals[key] ?? []
      riders.forEach((riderId) => newMotoRiders.push({ moto_id: m.id, rider_id: riderId }))
    })
  }

  if (newMotoRiders.length > 0) {
    const { error: riderError } = await adminClient.from('moto_riders').insert(newMotoRiders)
    if (riderError) return { ok: false, warning: riderError.message }
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
    const advances = ranked
      .map((r) => ({ riderId: r.riderId, rank: r.rank, points: r.points }))
      .flatMap((r) => {
        const next = []
        if (r.rank >= 1 && r.rank <= 4) {
          next.push({ toStage: 'SEMI_FINAL', finalClass: null })
        } else if (r.rank === 5 || r.rank === 6) {
          next.push({ toStage: 'FINAL', finalClass: 'PRO' })
        } else if (r.rank === 7 || r.rank === 8) {
          next.push({ toStage: 'FINAL', finalClass: 'ROOKIE' })
        }
        return next.map((n) => ({ riderId: r.riderId, ...n }))
      })

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
    ranked.forEach((r) => {
      semiRows.push({
        rider_id: r.riderId,
        category_id: categoryId,
        stage: 'SEMI_FINAL',
        position: r.rank,
        points: r.points,
      })
      if (r.rank >= 1 && r.rank <= 4) {
        finalRows.push({
          rider_id: r.riderId,
          category_id: categoryId,
          stage: 'FINAL',
          final_class: 'ELITE',
          position: null,
          points: null,
        })
      } else if (r.rank >= 5 && r.rank <= 8) {
        finalRows.push({
          rider_id: r.riderId,
          category_id: categoryId,
          stage: 'FINAL',
          final_class: 'NOVICE',
          position: null,
          points: null,
        })
      }
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
