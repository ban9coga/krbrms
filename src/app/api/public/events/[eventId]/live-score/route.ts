import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { isMotoPublicVisible, isMotoUpcoming } from '../../../../../../lib/motoStatus'
import { resolveCategoryConfig } from '../../../../../../services/categoryResolver'
import { formatStageAdvanceLabel, resolveQualificationPrimaryAdvance } from '../../../../../../services/raceStageEngine'

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
}

type StageGroup = {
  title: string
  moto_id: string
  rows: StageRow[]
}

type QualificationRowStatus = 'FINISHED' | 'DNF' | 'DNS' | 'PENDING' | 'DQ'

type StageAssignmentRow = {
  rider_id: string
  stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'FINAL'
  final_class: string | null
}

type QualificationMotoStatus = 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING'

const shuffle = <T,>(items: T[]) => {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const rotateLeft = <T,>(items: T[], step = 1) => {
  if (items.length <= 1) return [...items]
  const shift = ((step % items.length) + items.length) % items.length
  if (shift === 0) return [...items]
  return [...items.slice(shift), ...items.slice(0, shift)]
}

const parseBatchKey = (name: string) => {
  const match = name.match(/moto\s*(\d+)\s*(?:-\s*)?batch\s*(\d+)/i)
  if (!match) return null
  return { motoIndex: Number(match[1]), batchIndex: Number(match[2]) }
}

const isMotoComplete = (motoId: string, gateRows: GateRow[], resultRows: ResultRow[]) => {
  const assignedRiders = gateRows.filter((row) => row.moto_id === motoId).map((row) => row.rider_id)
  if (assignedRiders.length === 0) return false
  const completedRiders = new Set(resultRows.filter((row) => row.moto_id === motoId).map((row) => row.rider_id))
  return assignedRiders.every((riderId) => completedRiders.has(riderId))
}

const buildQualificationProgress = (motoRows: MotoRow[], gateRows: GateRow[], resultRows: ResultRow[]) => {
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

  const requiredMotoCount = batchMap.size === 1 && Array.from(batchMap.values()).some((entry) => entry.moto3) ? 3 : 2

  const completeBatchIds = Array.from(batchMap.values()).filter((entry) => {
    if (!entry.moto1 || !entry.moto2) return false
    if (requiredMotoCount >= 3 && !entry.moto3) return false
    return (
      isMotoComplete(entry.moto1, gateRows, resultRows) &&
      isMotoComplete(entry.moto2, gateRows, resultRows) &&
      (requiredMotoCount < 3 || isMotoComplete(entry.moto3 as string, gateRows, resultRows))
    )
  })

  return {
    total: batchMap.size,
    complete: completeBatchIds.length,
    ready: batchMap.size > 0 && completeBatchIds.length === batchMap.size,
    requiredMotoCount,
  }
}

const dnsPointForMoto = (riderCount: number | null) => {
  if (!riderCount || riderCount <= 0) return null
  return riderCount + 2
}

const pointForMotoResult = (res: ResultRow | null, riderCount: number | null) => {
  const status = res?.result_status ?? null
  if (status === 'DQ') return null
  if (status === 'DNS') return dnsPointForMoto(riderCount)
  if (status === 'DNF') return riderCount
  return res?.finish_order ?? null
}

const resolvePenaltyStagesForMoto = (name: string): Array<'QUARTER' | 'SEMI' | 'FINAL' | 'ALL'> => {
  if (/^quarter final/i.test(name)) return ['QUARTER', 'ALL']
  if (/^semi final/i.test(name)) return ['SEMI', 'ALL']
  if (/^final /i.test(name)) return ['FINAL', 'ALL']
  return ['ALL']
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
  const resolvedCategory = await resolveCategoryConfig(categoryId)

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
      .select('moto_id, rider_id')
      .in('moto_id', missingGateMotoIds)
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
      const baseOrder = [...riders].sort()
      let ordered = baseOrder
      if (moto?.moto_name && /moto\s*2\s*-/i.test(moto.moto_name)) {
        ordered = [...baseOrder].reverse()
      } else if (moto?.moto_name && /moto\s*3\s*-/i.test(moto.moto_name)) {
        ordered = baseOrder.length > 2 ? rotateLeft(baseOrder, 1) : shuffle(baseOrder)
      }
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
    .select('moto_id, rider_id')
    .in('moto_id', motoIds)
  if (assignedMotoRiderError) return NextResponse.json({ error: assignedMotoRiderError.message }, { status: 400 })
  const motoRiderRows = (assignedMotoRiders ?? []) as Array<{ moto_id: string; rider_id: string }>

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
  if (riderIds.length > 0) {
    const { data: penalties, error: penaltyError } = await adminClient
      .from('rider_penalties')
      .select('rider_id, penalty_point, stage, rider_penalty_approvals!inner(approval_status)')
      .eq('event_id', eventId)
      .eq('rider_penalty_approvals.approval_status', 'APPROVED')
      .in('rider_id', riderIds)
    if (penaltyError) return NextResponse.json({ error: penaltyError.message }, { status: 400 })
    for (const row of penalties ?? []) {
      const amount = Number(row.penalty_point ?? 0)
      if (row.stage === 'MOTO') {
        const current = qualificationPenaltyMap.get(row.rider_id) ?? 0
        qualificationPenaltyMap.set(row.rider_id, current + amount)
      }
      if (row.stage === 'ALL') {
        const current = stagePenaltyMap.get(`${row.rider_id}:ALL`) ?? 0
        stagePenaltyMap.set(`${row.rider_id}:ALL`, current + amount)
      }
      if (row.stage === 'QUARTER' || row.stage === 'SEMI' || row.stage === 'FINAL') {
        const current = stagePenaltyMap.get(`${row.rider_id}:${row.stage}`) ?? 0
        stagePenaltyMap.set(`${row.rider_id}:${row.stage}`, current + amount)
      }
    }
  }

  const { data: riders, error: riderError } = await adminClient
    .from('riders')
    .select('id, name, rider_nickname, no_plate_display, club, photo_thumbnail_url')
    .in('id', riderIds)
  if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })
  const riderRows = (riders ?? []) as RiderRow[]
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
  const qualificationProgress = buildQualificationProgress(motoRows, gateRows, resultRows)
  const showAdvancedClasses = qualificationProgress.ready

  const { data: stageAssignments, error: stageAssignmentError } = await adminClient
    .from('race_stage_result')
    .select('rider_id, stage, final_class')
    .eq('category_id', categoryId)
    .in('stage', ['QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'])
  if (stageAssignmentError) return NextResponse.json({ error: stageAssignmentError.message }, { status: 400 })

  const stageAssignmentMap = new Map<string, string>()
  // Public live score should reflect the stored AMS assignments, not recompute custom split rules ad hoc.
  ;((stageAssignments ?? []) as StageAssignmentRow[]).forEach((row) => {
    if (row.stage === 'FINAL') {
      stageAssignmentMap.set(row.rider_id, `FINAL ${row.final_class ?? 'ELITE'}`)
      return
    }
    stageAssignmentMap.set(row.rider_id, row.stage.replace(/_/g, ' '))
  })

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
        const penaltyTotal = qualificationPenaltyMap.get(riderId) ?? 0
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

      const classForRank = (rank: number | null | undefined) => {
        if (!rank) return null
        if (batchEntries.length === 1 && rank >= 1 && rank <= 8) return 'FINAL ELITE'
        if (rank >= 1 && rank <= 4) return formatStageAdvanceLabel(resolveQualificationPrimaryAdvance(resolvedCategory.stages))
        if (!resolvedCategory.stages.enableSemiFinal && !resolvedCategory.stages.enableQuarterFinal) return 'FINAL NOVICE'
        if (resolvedCategory.stages.enableSemiFinal && !resolvedCategory.stages.enableQuarterFinal) {
          if (rank === 5 || rank === 6) return 'FINAL PRO'
          if (rank === 7 || rank === 8) return 'FINAL ROOKIE'
          return null
        }
        if (rank === 5) return 'FINAL ADVANCED'
        if (rank === 6) return 'FINAL ACADEMY'
        if (rank === 7) return 'FINAL AMATEUR'
        if (rank === 8) return 'FINAL BEGINNER'
        return null
      }

      const ordered = rows
        .map((r) => {
          const rank = rankMap.get(r.rider_id) ?? null
          return {
            ...r,
            rank_point: rank,
            class_label: showAdvancedClasses ? (stageAssignmentMap.get(r.rider_id) ?? classForRank(rank)) : null,
          }
        })
        .sort((a, b) => (a.gate_moto1 ?? 9999) - (b.gate_moto1 ?? 9999))

      const resolvedMotoStatus = (moto3?.status ?? moto2?.status ?? moto1.status ?? '').toUpperCase()
      return {
        batch_index: batchIndex,
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
    .sort((a, b) => a.batch_index - b.batch_index)

  const stageMotos = motoRows.filter((m) => !parseBatchKey(m.moto_name))
  const stageGroups: StageGroup[] = stageMotos.map((moto) => {
    const gates = gateRows.filter((g) => g.moto_id === moto.id)
    const gateMap = new Map(gates.map((g) => [g.rider_id, g.gate_position]))
    const assignedRiderIds = motoRiderRows.filter((row) => row.moto_id === moto.id).map((row) => row.rider_id)
    const riderIdsInMoto = Array.from(new Set([...assignedRiderIds, ...gates.map((g) => g.rider_id)]))
    const riderCount = riderIdsInMoto.length || null

    const stagePenaltyStages = resolvePenaltyStagesForMoto(moto.moto_name)
    const rows: StageRow[] = riderIdsInMoto.map((riderId) => {
      const rider = riderMap.get(riderId)
      const res = resultRows.find((r) => r.moto_id === moto.id && r.rider_id === riderId) ?? null
      const status = (res?.result_status ?? 'PENDING') as StageRow['status']
      const penaltyTotal = stagePenaltyStages.reduce((sum, stageKey) => {
        return sum + (stagePenaltyMap.get(`${riderId}:${stageKey}`) ?? 0)
      }, 0)
      return {
        rider_id: riderId,
        gate: gateMap.get(riderId) ?? null,
        name: rider?.name ?? '-',
        no_plate: rider?.no_plate_display ?? '-',
        club: rider?.club ?? '-',
        photo_thumbnail_url: rider?.photo_thumbnail_url ?? null,
        point: pointForMotoResult(res, riderCount),
        penalty_total: penaltyTotal || null,
        rank: null,
        status,
      }
    })

    const rankMap = new Map(
      [...rows]
        .filter((row) => row.point !== null)
        .sort((a, b) => {
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

    return {
      title: moto.moto_name,
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
