import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { compareMotoSequence } from '../../../../../../lib/motoSequence'
import { resolveBasePointForRaceResult, resolveNonFinishAutoPenalty } from '../../../../../../lib/nonFinishScoring'
import { requireJury } from '../../../../../../services/juryAuth'

type MotoRow = {
  id: string
  category_id: string
  moto_name: string
  moto_order: number
  status: string
  is_published: boolean | null
}

type RiderRow = {
  id: string
  name: string
  rider_nickname?: string | null
  no_plate_display: string
  club?: string | null
}

type McRankingRow = {
  rider_id: string
  finish_order: number | null
  base_point: number | null
  penalty_total: number | null
  total_point: number | null
  rider_name: string
  rider_nickname?: string | null
  plate: string
  club?: string | null
  gate_position?: number | null
  status: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'READY' | 'PENDING' | 'ABSENT'
}

type NextMotoRiderRow = {
  rider_id: string
  rider_name: string
  rider_nickname?: string | null
  plate: string
  club?: string | null
  gate_position?: number | null
  status: 'READY' | 'ABSENT' | 'DNS' | 'PENDING'
}

type StageSeedRow = {
  rider_id: string
  stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'REPECHAGE' | 'SEMI_FINAL' | 'FINAL'
  batch_id: string | null
  position: number | null
  points: number | null
}

const pickNowRacingMoto = (motos: MotoRow[]) => {
  const live = motos.filter((m) => m.status === 'LIVE')
  if (live.length > 0) return live[0]
  const upcoming = motos.filter((m) => m.status === 'UPCOMING')
  if (upcoming.length > 0) return upcoming[0]
  const provisional = motos.filter((m) => m.status === 'PROVISIONAL')
  if (provisional.length > 0) return provisional[provisional.length - 1]
  const locked = motos.filter((m) => m.status === 'LOCKED' || m.status === 'FINISHED')
  if (locked.length > 0) return locked[locked.length - 1]
  return motos[0] ?? null
}

const pickResultMoto = (motos: MotoRow[]) => {
  const provisional = motos.filter((m) => m.status === 'PROVISIONAL')
  if (provisional.length > 0) return provisional[provisional.length - 1]
  const locked = motos.filter((m) => m.status === 'LOCKED' || m.status === 'FINISHED')
  if (locked.length > 0) return locked[locked.length - 1]
  const live = motos.filter((m) => m.status === 'LIVE')
  if (live.length > 0) return live[0]
  const upcoming = motos.filter((m) => m.status === 'UPCOMING')
  if (upcoming.length > 0) return upcoming[0]
  return motos[0] ?? null
}

const parseBatch = (name: string) => {
  const match = name.match(/batch\s*(\d+)/i)
  return match ? `Batch ${match[1]}` : '-'
}

const parseMotoLabel = (name: string) => {
  const match = name.match(/moto\s*(\d+)/i)
  return match ? `Moto ${match[1]}` : name
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

const resolvePenaltyStage = (motoName: string): 'MOTO' | 'QUARTER' | 'REPECHAGE' | 'SEMI' | 'FINAL' => {
  if (/quarter\s*final/i.test(motoName)) return 'QUARTER'
  if (/repechage/i.test(motoName)) return 'REPECHAGE'
  if (/semi\s*final/i.test(motoName)) return 'SEMI'
  if (/final/i.test(motoName)) return 'FINAL'
  return 'MOTO'
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

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireJury(req, ['MC'], eventId)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: eventRow, error: eventError } = await adminClient
    .from('events')
    .select('id, name')
    .eq('id', eventId)
    .maybeSingle()
  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 400 })

  const { data: reviewMotos } = await adminClient
    .from('motos')
    .select('id, moto_name, moto_order, status, category_id, is_published')
    .eq('event_id', eventId)
    .eq('status', 'PROTEST_REVIEW')
    .order('moto_order', { ascending: true })

  const { data: motos, error: motoError } = await adminClient
    .from('motos')
    .select('id, moto_name, moto_order, status, category_id, is_published')
    .eq('event_id', eventId)
    .in('status', ['UPCOMING', 'LIVE', 'PROVISIONAL', 'LOCKED', 'FINISHED'])
    .order('moto_order', { ascending: true })

  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })

  const { data: categories, error: categoryError } = await adminClient
    .from('categories')
    .select('id, label')
    .eq('event_id', eventId)
  if (categoryError) return NextResponse.json({ error: categoryError.message }, { status: 400 })
  const categoryMap = new Map((categories ?? []).map((row) => [row.id, row.label]))

  const sortedReviewMotos = [...(reviewMotos ?? [])].sort(compareMotoSequence)
  const underReview = sortedReviewMotos.length > 0
  if (underReview) {
    const reviewMoto = sortedReviewMotos[0]
    return NextResponse.json({
      data: {
        under_review: true,
        event_name: eventRow?.name ?? 'Event',
        review_moto: reviewMoto,
      },
    })
  }

  const list = [...((motos ?? []) as MotoRow[])].sort(compareMotoSequence)
  const nowRacingMoto = pickNowRacingMoto(list)
  const resultMoto = pickResultMoto(list)
  if (!nowRacingMoto && !resultMoto) {
    return NextResponse.json({
      data: {
        under_review: false,
        event_name: eventRow?.name ?? 'Event',
        moto: null,
        now_moto: null,
        category: null,
        now_category: null,
        batch: null,
        now_batch: null,
        ranking: [],
        next_moto_riders: [],
        next_moto: null,
      },
    })
  }

  const rankingMoto = resultMoto ?? nowRacingMoto
  const activeMoto = nowRacingMoto ?? resultMoto
  if (!rankingMoto || !activeMoto) {
    return NextResponse.json({
      data: {
        under_review: false,
        event_name: eventRow?.name ?? 'Event',
        moto: null,
        now_moto: null,
        category: null,
        now_category: null,
        batch: null,
        now_batch: null,
        ranking: [],
        next_moto_riders: [],
        next_moto: null,
      },
    })
  }

  const currentCategoryLabel = categoryMap.get(rankingMoto.category_id) ?? null
  const nowCategoryLabel = categoryMap.get(activeMoto.category_id) ?? null
  const listForNext = [...((motos ?? []) as MotoRow[])].sort(compareMotoSequence)
  const currentIndex = listForNext.findIndex((row) => row.id === activeMoto.id)
  const nextMoto =
    currentIndex >= 0
      ? listForNext
          .slice(currentIndex + 1)
          .find((row) => ['UPCOMING', 'LIVE', 'PROVISIONAL'].includes((row.status ?? '').toUpperCase())) ??
        listForNext.find((row) => ['UPCOMING', 'LIVE', 'PROVISIONAL'].includes((row.status ?? '').toUpperCase())) ??
        listForNext.slice(currentIndex + 1)[0] ??
        null
      : listForNext.find((row) => ['UPCOMING', 'LIVE', 'PROVISIONAL'].includes((row.status ?? '').toUpperCase())) ?? null

  const buildDerivedGateMap = async (
    targetMoto: MotoRow,
    assignedRiderIds: string[],
    existingGateRows: Array<{ rider_id: string; gate_position: number | null }>
  ) => {
    const gateMap = new Map(existingGateRows.map((row) => [row.rider_id, Number(row.gate_position ?? 0) || null]))
    if (gateMap.size > 0 || assignedRiderIds.length === 0) return gateMap

    if (
      !/^final /i.test(targetMoto.moto_name) &&
      !/^quarter final/i.test(targetMoto.moto_name) &&
      !/^repechage/i.test(targetMoto.moto_name) &&
      !/^semi final/i.test(targetMoto.moto_name)
    ) {
      assignedRiderIds.forEach((riderId, index) => gateMap.set(riderId, index + 1))
      return gateMap
    }

    const [{ data: categoryMotos }, { data: stageSeedRows }] = await Promise.all([
      adminClient
        .from('motos')
        .select('id, moto_name, moto_order')
        .eq('event_id', eventId)
        .eq('category_id', targetMoto.category_id)
        .order('moto_order', { ascending: true }),
      adminClient
        .from('race_stage_result')
        .select('rider_id, stage, batch_id, position, points')
        .eq('category_id', targetMoto.category_id),
    ])

    const batchOrderById = new Map<string, number>()
    for (const moto of categoryMotos ?? []) {
      const qualificationBatchIndex = parseQualificationBatchIndex(moto.moto_name)
      if (qualificationBatchIndex !== null) {
        batchOrderById.set(moto.id, qualificationBatchIndex)
        continue
      }
      const stageBatchIndex = parseStageBatchIndex(moto.moto_name)
      if (stageBatchIndex !== null) {
        batchOrderById.set(moto.id, stageBatchIndex)
      }
    }

    const seedRows = (stageSeedRows ?? []) as StageSeedRow[]
    const qualificationStageSeedRows = seedRows.filter((row) => row.stage === 'QUALIFICATION')
    const quarterStageResultRows = seedRows.filter((row) => row.stage === 'QUARTER_FINAL' && row.position !== null)
    const repechageStageResultRows = seedRows.filter((row) => row.stage === 'REPECHAGE' && row.position !== null)
    const semiStageResultRows = seedRows.filter((row) => row.stage === 'SEMI_FINAL' && row.position !== null)
    const repechageStageRiderIds = new Set(repechageStageResultRows.map((row) => row.rider_id))
    const quarterStageRiderIds = new Set(quarterStageResultRows.map((row) => row.rider_id))
    const semiStageRiderIds = new Set(semiStageResultRows.map((row) => row.rider_id))

    if (/^final /i.test(targetMoto.moto_name)) {
      const qualificationDirect = assignedRiderIds.filter(
        (riderId) =>
          !repechageStageRiderIds.has(riderId) &&
          !quarterStageRiderIds.has(riderId) &&
          !semiStageRiderIds.has(riderId)
      )
      const repechageDerived = assignedRiderIds.filter(
        (riderId) =>
          repechageStageRiderIds.has(riderId) &&
          !quarterStageRiderIds.has(riderId) &&
          !semiStageRiderIds.has(riderId)
      )
      const quarterDerived = assignedRiderIds.filter((riderId) => quarterStageRiderIds.has(riderId) && !semiStageRiderIds.has(riderId))
      const semiDerived = assignedRiderIds.filter((riderId) => semiStageRiderIds.has(riderId))

      const ordered = [
        ...orderRidersByStageSeeds(qualificationDirect, qualificationStageSeedRows, batchOrderById),
        ...orderRidersByStageSeeds(repechageDerived, repechageStageResultRows, batchOrderById),
        ...orderRidersByStageSeeds(quarterDerived, quarterStageResultRows, batchOrderById),
        ...orderRidersByStageSeeds(semiDerived, semiStageResultRows, batchOrderById),
      ]
      ordered.forEach((riderId, index) => gateMap.set(riderId, index + 1))
      return gateMap
    }

    const stageSource =
      /^quarter final/i.test(targetMoto.moto_name)
        ? 'QUARTER_FINAL'
        : /^repechage/i.test(targetMoto.moto_name)
          ? 'REPECHAGE'
          : /^semi final/i.test(targetMoto.moto_name)
            ? 'SEMI_FINAL'
            : null
    const sourceRows =
      stageSource === 'QUARTER_FINAL'
        ? qualificationStageSeedRows
        : stageSource === 'REPECHAGE'
          ? [...qualificationStageSeedRows, ...quarterStageResultRows, ...semiStageResultRows]
          : [...quarterStageResultRows, ...repechageStageResultRows, ...qualificationStageSeedRows]
    const ordered = orderRidersByStageSeeds(assignedRiderIds, sourceRows, batchOrderById)
    ordered.forEach((riderId, index) => gateMap.set(riderId, index + 1))
    return gateMap
  }

  const { data: results, error: resultError } = await adminClient
    .from('results')
    .select('rider_id, finish_order, result_status')
    .eq('moto_id', rankingMoto.id)
    .order('finish_order', { ascending: true, nullsFirst: false })
  if (resultError) return NextResponse.json({ error: resultError.message }, { status: 400 })

  const { data: motoRiders } = await adminClient
    .from('moto_riders')
    .select('rider_id')
    .eq('moto_id', rankingMoto.id)
  const lastPosition = (motoRiders ?? []).length || null
  const { data: gatePositions } = await adminClient
    .from('moto_gate_positions')
    .select('rider_id, gate_position')
    .eq('moto_id', rankingMoto.id)

  const riderIds = Array.from(new Set([...(results ?? []).map((r) => r.rider_id), ...((motoRiders ?? []).map((r) => r.rider_id))]))
  const gateMap = await buildDerivedGateMap(rankingMoto, riderIds, (gatePositions ?? []) as Array<{ rider_id: string; gate_position: number | null }>)
  const penaltyStage = resolvePenaltyStage(rankingMoto.moto_name)
  const { data: riders } = await adminClient
    .from('riders')
    .select('id, name, rider_nickname, no_plate_display, club')
    .in('id', riderIds)
  const riderMap = new Map((riders ?? []).map((r: RiderRow) => [r.id, r]))
  const resultMap = new Map((results ?? []).map((row) => [row.rider_id, row]))
  const { data: participationRows } = await adminClient
    .from('rider_participation_status')
    .select('rider_id, participation_status')
    .eq('event_id', eventId)
    .eq('moto_id', rankingMoto.id)
    .in('rider_id', riderIds)
  const participationMap = new Map((participationRows ?? []).map((row) => [row.rider_id, row.participation_status as string | null]))

  const penaltyMap = new Map<string, number>()
  if (riderIds.length > 0) {
    const { data: penalties, error: penaltyError } = await adminClient
      .from('rider_penalties')
      .select('rider_id, penalty_point, stage, rider_penalty_approvals!inner(approval_status)')
      .eq('event_id', eventId)
      .eq('rider_penalty_approvals.approval_status', 'APPROVED')
      .in('rider_id', riderIds)
    if (penaltyError) return NextResponse.json({ error: penaltyError.message }, { status: 400 })
    for (const row of penalties ?? []) {
      const appliesToCurrentMoto = row.stage === 'ALL' || row.stage === penaltyStage
      if (!appliesToCurrentMoto) continue
      const current = penaltyMap.get(row.rider_id) ?? 0
      penaltyMap.set(row.rider_id, current + Number(row.penalty_point ?? 0))
    }
  }

  const { data: pointOverrideConfig } = await adminClient
    .from('race_stage_config')
    .select('dnf_point_override, dns_point_override')
    .eq('event_id', eventId)
    .eq('category_id', rankingMoto.category_id)
    .maybeSingle()

  const ranking: McRankingRow[] = riderIds.map((riderId) => {
    const row = resultMap.get(riderId)
    const rider = riderMap.get(riderId)
    const participationStatus = participationMap.get(riderId)
    const status = (
      participationStatus === 'ABSENT'
        ? 'ABSENT'
        : row?.result_status ??
          (participationStatus === 'ACTIVE' ? 'READY' : 'PENDING')
    ) as 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'READY' | 'PENDING' | 'ABSENT'
    const basePoint = resolveBasePointForRaceResult(status, row?.finish_order ?? null, lastPosition)
    const penalty = (penaltyMap.get(riderId) ?? 0) + resolveNonFinishAutoPenalty(status, pointOverrideConfig ?? undefined)
    const total = basePoint !== null ? basePoint + penalty : null
    return {
      rider_id: riderId,
      finish_order: row?.finish_order ?? null,
      base_point: basePoint,
      penalty_total: penalty,
      total_point: total,
      rider_name: rider?.name ?? '-',
      rider_nickname: rider?.rider_nickname ?? null,
      plate: rider?.no_plate_display ?? '-',
      club: rider?.club ?? null,
      gate_position: gateMap.get(riderId) ?? null,
      status,
    }
  })

  ranking.sort((a, b) => {
    const aStatusWeight =
      a.status === 'FINISH'
        ? 0
        : a.status === 'DNF'
          ? 1
          : a.status === 'READY'
            ? 2
            : a.status === 'PENDING'
              ? 3
              : a.status === 'ABSENT'
                ? 4
                : a.status === 'DNS'
                  ? 5
                  : 6
    const bStatusWeight =
      b.status === 'FINISH'
        ? 0
        : b.status === 'DNF'
          ? 1
          : b.status === 'READY'
            ? 2
            : b.status === 'PENDING'
              ? 3
              : b.status === 'ABSENT'
                ? 4
                : b.status === 'DNS'
                  ? 5
                  : 6
    if (aStatusWeight !== bStatusWeight) return aStatusWeight - bStatusWeight
    const at = a.total_point ?? 9999
    const bt = b.total_point ?? 9999
    if (at !== bt) return at - bt
    const aGate = a.gate_position ?? 9999
    const bGate = b.gate_position ?? 9999
    if (aGate !== bGate) return aGate - bGate
    return a.plate.localeCompare(b.plate)
  })

  let nextMotoRiders: NextMotoRiderRow[] = []
  if (nextMoto) {
    const [{ data: nextMotoAssignments }, { data: nextMotoGates }, { data: nextMotoParticipationRows }] = await Promise.all([
      adminClient.from('moto_riders').select('rider_id').eq('moto_id', nextMoto.id),
      adminClient.from('moto_gate_positions').select('rider_id, gate_position').eq('moto_id', nextMoto.id),
      adminClient
        .from('rider_participation_status')
        .select('rider_id, participation_status')
        .eq('event_id', eventId)
        .eq('moto_id', nextMoto.id),
    ])
    const nextRiderIds = Array.from(new Set((nextMotoAssignments ?? []).map((row) => row.rider_id)))
    if (nextRiderIds.length > 0) {
      const nextGateMap = await buildDerivedGateMap(
        nextMoto,
        nextRiderIds,
        (nextMotoGates ?? []) as Array<{ rider_id: string; gate_position: number | null }>
      )
      const { data: nextRiders } = await adminClient
        .from('riders')
        .select('id, name, rider_nickname, no_plate_display, club')
        .in('id', nextRiderIds)
      const nextRiderMap = new Map((nextRiders ?? []).map((row: RiderRow) => [row.id, row]))
      const nextParticipationMap = new Map(
        (nextMotoParticipationRows ?? []).map((row) => [row.rider_id, row.participation_status as string | null])
      )
      nextMotoRiders = nextRiderIds
        .map((riderId) => {
          const rider = nextRiderMap.get(riderId)
          const participationStatus = nextParticipationMap.get(riderId)
          const status =
            participationStatus === 'ACTIVE'
              ? 'READY'
              : participationStatus === 'ABSENT'
                ? 'ABSENT'
                : participationStatus === 'DNS'
                  ? 'DNS'
                  : 'PENDING'
          return {
            rider_id: riderId,
            rider_name: rider?.name ?? '-',
            rider_nickname: rider?.rider_nickname ?? null,
            plate: rider?.no_plate_display ?? '-',
            club: rider?.club ?? null,
            gate_position: nextGateMap.get(riderId) ?? null,
            status: status as NextMotoRiderRow['status'],
          }
        })
        .sort((a, b) => {
          const aGate = a.gate_position ?? 9999
          const bGate = b.gate_position ?? 9999
          if (aGate !== bGate) return aGate - bGate
          return a.plate.localeCompare(b.plate)
        })
    }
  }

  return NextResponse.json({
    data: {
      under_review: false,
      event_name: eventRow?.name ?? 'Event',
      moto: rankingMoto,
      now_moto: activeMoto,
      category: currentCategoryLabel,
      now_category: nowCategoryLabel,
      batch: parseBatch(rankingMoto.moto_name),
      now_batch: parseBatch(activeMoto.moto_name),
      ranking,
      next_moto_riders: nextMotoRiders,
      next_moto: nextMoto
        ? {
            id: nextMoto.id,
            moto_name: nextMoto.moto_name,
            moto_label: parseMotoLabel(nextMoto.moto_name),
            moto_order: nextMoto.moto_order,
            status: nextMoto.status,
            category: categoryMap.get(nextMoto.category_id) ?? null,
            batch: parseBatch(nextMoto.moto_name),
          }
        : null,
    },
  })
}
