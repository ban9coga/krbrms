import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { normalizeFinalClassValue } from '../../../../../../lib/advancedRaceDefaults'
import {
  compareQualificationTieBreakData,
  createQualificationTieBreakData,
} from '../../../../../../lib/qualificationRanking'
import {
  compareFinalRankingEntries,
  resolveFinalRankingSourceSeed,
  type FinalRankingSourceCandidate,
} from '../../../../../../lib/finalRanking'
import { compareMotoDisplayOrder, formatMotoDisplayName } from '../../../../../../lib/motoDisplayOrder'
import { resolveBasePointForRaceResult, resolveNonFinishAutoPenalty } from '../../../../../../lib/nonFinishScoring'
import { isMotoPublicVisible, isMotoReady, isMotoUpcoming } from '../../../../../../lib/motoStatus'
import {
  formatStageAdvanceLabel,
} from '../../../../../../services/raceStageEngine'

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

type QualificationOverallRow = {
  rider_id: string
  name: string
  no_plate: string
  rank: number
  total_point: number | null
  next_class_label: string | null
  total_point_moto1: number | null
  total_point_moto2: number | null
  total_point_moto3: number | null
}

type ResultRow = {
  moto_id: string
  rider_id: string
  finish_order: number | null
  result_status?: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | null
  dnf_progress_percent?: number | null
}

type RiderParticipationHistory = {
  dnsCount: number
  dnfCount: number
  dqCount: number
  finishCount: number
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
  total_point: number | null
  rank: number | null
  status: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING'
  next_class_label?: string | null
}

type StageGroup = {
  title: string
  moto_id: string
  status: string | null
  rows: StageRow[]
}

type QualificationRowStatus = 'FINISHED' | 'DNF' | 'DNS' | 'PENDING' | 'DQ'

type QualificationMotoStatus = 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING'

type QualificationCustomRuleRow = {
  source_stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'REPECHAGE' | 'SEMI_FINAL'
  rank_from: number
  rank_to: number
  target_stage: 'QUARTER_FINAL' | 'REPECHAGE' | 'SEMI_FINAL' | 'FINAL' | null
  target_outcome?: 'STAGE' | 'FINISHER' | null
  target_final_class: string | null
  split_basis: 'COMBINED' | 'PER_BATCH' | 'CUSTOM_PER_BATCH' | 'GLOBAL_ACTIVE_FIRST' | null
  batch_no: number | null
}

type StageCustomRuleRow = QualificationCustomRuleRow

type EventSnapshotPayload = {
  event?: { status?: string | null }
  live_scores?: Record<string, unknown>
}

const FINISHED_ARCHIVE_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
}

type StageSeedRow = {
  rider_id: string
  stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'REPECHAGE' | 'SEMI_FINAL' | 'FINAL'
  final_class?: string | null
  batch_id: string | null
  position: number | null
  points: number | null
  qualification_next_outcome?: 'STAGE' | 'FINISHER' | 'UNASSIGNED' | null
  qualification_next_stage?: 'QUARTER_FINAL' | 'REPECHAGE' | 'SEMI_FINAL' | 'FINAL' | null
  qualification_next_final_class?: string | null
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

  // A rider may carry more than one historical seed (for example from
  // Qualification and Repechage). Keep the first matching seed, exactly as
  // the Jury gate reader does, so fallback gates remain identical.
  const uniqueOrdered = Array.from(new Set(ordered))
  const seen = new Set(uniqueOrdered)
  const leftovers = riderIds.filter((riderId) => !seen.has(riderId)).sort((a, b) => a.localeCompare(b))
  return [...uniqueOrdered, ...leftovers]
}

const pointForMotoResult = (res: ResultRow | null, riderCount: number | null, dnsCount: number = 0) => {
  return resolveBasePointForRaceResult(res?.result_status ?? null, res?.finish_order ?? null, riderCount, dnsCount)
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

const compareNullableNumber = (a: number | null | undefined, b: number | null | undefined) =>
  Number(a ?? Number.MAX_SAFE_INTEGER) - Number(b ?? Number.MAX_SAFE_INTEGER)

const buildParticipationHistory = (rows: ResultRow[], excludedMotoIds: Set<string>) => {
  const historyByRider = new Map<string, RiderParticipationHistory>()
  rows.forEach((row) => {
    if (excludedMotoIds.has(row.moto_id)) return
    const history = historyByRider.get(row.rider_id) ?? { dnsCount: 0, dnfCount: 0, dqCount: 0, finishCount: 0 }
    if (row.result_status === 'DNS') history.dnsCount += 1
    else if (row.result_status === 'DNF') history.dnfCount += 1
    else if (row.result_status === 'DQ') history.dqCount += 1
    else if (row.result_status === 'FINISH') history.finishCount += 1
    historyByRider.set(row.rider_id, history)
  })
  return historyByRider
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
  targetFinalClass: string | null,
  targetOutcome?: QualificationCustomRuleRow['target_outcome']
) => targetOutcome === 'FINISHER'
  ? 'FINISHER'
  : targetStage === 'FINAL'
    ? `FINAL ${targetFinalClass ?? 'ELITE'}`
    : targetStage
      ? formatStageAdvanceLabel({ toStage: targetStage })
      : null

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
  const snapshotRefreshSecret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const forceArchiveRefresh =
    snapshotRefreshSecret.length > 0 &&
    req.headers.get('x-racepushbike-snapshot-refresh') === snapshotRefreshSecret
  const cacheHeaders = includeUpcoming
    ? { 'Cache-Control': 'no-store' }
    : { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' }
  if (!categoryId) return NextResponse.json({ error: 'category_id required' }, { status: 400 })

  const includePhotosParam = searchParams.get('include_photos')
  let includePhotos = includePhotosParam === '1' || includePhotosParam === 'true'
  const shouldLoadPhotoSettings = includePhotosParam !== '0' && includePhotosParam !== 'false' && !includePhotos

  const [categoryResult, settingsResult, pointOverrideResult, featureFlagsResult, motoResult] = await Promise.all([
    adminClient
      .from('categories')
      .select('id, event_id, label, events!inner(status)')
      .eq('id', categoryId)
      .maybeSingle(),
    adminClient
      .from('event_settings')
      .select('business_settings, race_format_settings')
      .eq('event_id', eventId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    adminClient
      .from('race_stage_config')
      .select('dnf_point_override, dns_point_override, qualification_moto_count')
      .eq('event_id', eventId)
      .eq('category_id', categoryId)
      .maybeSingle(),
    adminClient
      .from('event_feature_flags')
      .select('dnf_progress_enabled')
      .eq('event_id', eventId)
      .maybeSingle(),
    adminClient
      .from('motos')
      .select('id, moto_name, moto_order, status, is_published')
      .eq('event_id', eventId)
      .eq('category_id', categoryId)
      .order('moto_order', { ascending: true }),
  ])

  const { data: category, error: catError } = categoryResult
  if (catError || !category || category.event_id !== eventId) {
    return NextResponse.json({ error: 'Category not found in event' }, { status: 404 })
  }

  const relatedEvent = Array.isArray(category.events) ? category.events[0] : category.events
  const isFinishedEvent = relatedEvent?.status === 'FINISHED'
  let snapshotPayload: EventSnapshotPayload | null = null
  if (isFinishedEvent && !forceArchiveRefresh) {
    const { data: snapshot, error: snapshotError } = await adminClient
      .from('event_public_snapshots')
      .select('payload')
      .eq('event_id', eventId)
      .maybeSingle()
    if (snapshotError) return NextResponse.json({ error: snapshotError.message }, { status: 500 })
    if (snapshot?.payload && typeof snapshot.payload === 'object') {
      snapshotPayload = snapshot.payload as EventSnapshotPayload
      const archivedScore = snapshotPayload.live_scores?.[categoryId]
      if (archivedScore) {
        return NextResponse.json({ data: archivedScore }, { headers: FINISHED_ARCHIVE_CACHE_HEADERS })
      }
    }
  }

  if (settingsResult.error) return NextResponse.json({ error: settingsResult.error.message }, { status: 400 })
  if (shouldLoadPhotoSettings) {
    const settingsRow = settingsResult.data
    const businessSettings =
      settingsRow?.business_settings && typeof settingsRow.business_settings === 'object' && !Array.isArray(settingsRow.business_settings)
        ? (settingsRow.business_settings as Record<string, unknown>)
        : {}
    includePhotos =
      typeof businessSettings.show_rider_photos_public === 'boolean'
        ? businessSettings.show_rider_photos_public
        : false
  }

  const raceFormatSettings =
    settingsResult.data?.race_format_settings &&
    typeof settingsResult.data.race_format_settings === 'object' &&
    !Array.isArray(settingsResult.data.race_format_settings)
      ? (settingsResult.data.race_format_settings as Record<string, unknown>)
      : {}
  const qualificationBatchMode = raceFormatSettings.qualification_batch_mode === 'ROTATE_EACH_MOTO'
    ? 'ROTATE_EACH_MOTO'
    : 'FIXED'
  const qualificationTieBreakRepechage = raceFormatSettings.qualification_tiebreak_repechage === true

  const { data: pointOverrideConfig } = pointOverrideResult
  const dnfProgressEnabled = featureFlagsResult.data?.dnf_progress_enabled === true
  const { data: motos, error: motoError } = motoResult
  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })
  const allMotoRows = (motos ?? []) as MotoRow[]
  const qualificationTieBreakMotoRows = allMotoRows.filter((moto) =>
    /^repechage\s*-\s*batch\s*\d+\s*-\s*tie[ -]?break\b/i.test(moto.moto_name)
  )
  const motoRows = allMotoRows.filter((m) => {
    if (isMotoPublicVisible(m.status, m.is_published)) return true
    if (includeUpcoming && (isMotoUpcoming(m.status) || isMotoReady(m.status))) return true
    return false
  })

  const motoIds = motoRows.map((m) => m.id)
  if (motoIds.length === 0) {
    return NextResponse.json({ data: { batches: [], category: category.label } }, { headers: cacheHeaders })
  }
  const liveScoreMotoIds = Array.from(new Set([
    ...motoIds,
    ...qualificationTieBreakMotoRows.map((moto) => moto.id),
  ]))

  const [
    gateResult,
    assignedMotoRiderResult,
    resultResult,
    stageSeedResult,
    qualificationCustomRulesResult,
    stageCustomRulesResult,
  ] = await Promise.all([
    adminClient
      .from('moto_gate_positions')
      .select('moto_id, rider_id, gate_position')
      .in('moto_id', motoIds),
    adminClient
      .from('moto_riders')
      .select('moto_id, rider_id, created_at')
      .in('moto_id', liveScoreMotoIds)
      .order('created_at', { ascending: true }),
    adminClient
      .from('results')
      .select('moto_id, rider_id, finish_order, result_status, dnf_progress_percent')
      .in('moto_id', liveScoreMotoIds),
    adminClient
      .from('race_stage_result')
      .select('rider_id, stage, final_class, batch_id, position, points, qualification_next_outcome, qualification_next_stage, qualification_next_final_class')
      .eq('category_id', categoryId),
    adminClient
      .from('race_category_custom_split_rule')
      .select('source_stage, rank_from, rank_to, target_stage, target_outcome, target_final_class, split_basis, batch_no')
      .eq('category_id', categoryId)
      .eq('source_stage', 'QUALIFICATION')
      .order('sort_order', { ascending: true })
      .order('rank_from', { ascending: true }),
    adminClient
      .from('race_category_custom_split_rule')
      .select('source_stage, rank_from, rank_to, target_stage, target_outcome, target_final_class, split_basis, batch_no')
      .eq('category_id', categoryId)
      .in('source_stage', ['QUARTER_FINAL', 'REPECHAGE', 'SEMI_FINAL'])
      .order('sort_order', { ascending: true })
      .order('rank_from', { ascending: true }),
  ])

  const { data: gates, error: gateError } = gateResult
  if (gateError) return NextResponse.json({ error: gateError.message }, { status: 400 })
  const gateRows = (gates ?? []) as GateRow[]

  const { data: assignedMotoRiders, error: assignedMotoRiderError } = assignedMotoRiderResult
  if (assignedMotoRiderError) return NextResponse.json({ error: assignedMotoRiderError.message }, { status: 400 })
  const motoRiderRows = (assignedMotoRiders ?? []) as MotoRiderRow[]
  const assignedRiderCountByMoto = new Map<string, number>()
  motoRiderRows.forEach((row) => {
    assignedRiderCountByMoto.set(row.moto_id, (assignedRiderCountByMoto.get(row.moto_id) ?? 0) + 1)
  })

  const { data: results, error: resultError } = resultResult
  if (resultError) return NextResponse.json({ error: resultError.message }, { status: 400 })
  const resultRows = (results ?? []) as ResultRow[]
  const resultByMotoAndRider = new Map(resultRows.map((row) => [`${row.moto_id}:${row.rider_id}`, row]))
  const scoringRiderCountByMoto = new Map<string, number>()
  motoRiderRows.forEach((row) => {
    if (resultByMotoAndRider.get(`${row.moto_id}:${row.rider_id}`)?.result_status === 'DQ') return
    scoringRiderCountByMoto.set(row.moto_id, (scoringRiderCountByMoto.get(row.moto_id) ?? 0) + 1)
  })
  const finalMotoIds = new Set(motoRows.filter((moto) => /^final\b/i.test(moto.moto_name)).map((moto) => moto.id))
  const participationHistoryByRider = buildParticipationHistory(resultRows, finalMotoIds)

  const { data: stageSeedData, error: stageSeedError } = stageSeedResult
  if (stageSeedError) return NextResponse.json({ error: stageSeedError.message }, { status: 400 })
  const stageSeedRows = (stageSeedData ?? []) as StageSeedRow[]
  const finalSourceCandidatesByRider = new Map<string, FinalRankingSourceCandidate[]>()
  for (const row of stageSeedRows) {
    if (row.stage === 'FINAL' || row.position === null) continue
    const candidates = finalSourceCandidatesByRider.get(row.rider_id) ?? []
    candidates.push({ stage: row.stage, position: row.position, points: row.points })
    finalSourceCandidatesByRider.set(row.rider_id, candidates)
  }
  const finalSourceSeedByRider = new Map(
    Array.from(finalSourceCandidatesByRider, ([riderId, candidates]) => [
      riderId,
      resolveFinalRankingSourceSeed(candidates),
    ])
  )
  const finalRankByClassAndRider = new Map<string, number>()
  for (const row of stageSeedRows) {
    const finalClass = normalizeFinalClassValue(row.final_class)
    if (row.stage !== 'FINAL' || !finalClass || row.position === null) continue
    finalRankByClassAndRider.set(`${finalClass}:${row.rider_id}`, row.position)
  }

  const { data: qualificationCustomRules, error: qualificationCustomRulesError } = qualificationCustomRulesResult
  if (qualificationCustomRulesError) {
    return NextResponse.json({ error: qualificationCustomRulesError.message }, { status: 400 })
  }
  const qualificationRules = (qualificationCustomRules ?? []) as QualificationCustomRuleRow[]
  const qualificationSplitBasis = qualificationRules[0]?.split_basis ?? null
  const allQualificationMotos = ((motos ?? []) as MotoRow[]).filter((moto) => parseBatchKey(moto.moto_name))
  const qualificationResultsOfficial =
    allQualificationMotos.length > 0 &&
    allQualificationMotos.every((moto) => moto.status?.toUpperCase() === 'LOCKED')

  const { data: stageCustomRules, error: stageCustomRulesError } = stageCustomRulesResult
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

  const gateCountByMoto = new Map<string, number>()
  for (const row of gateRows) {
    gateCountByMoto.set(row.moto_id, (gateCountByMoto.get(row.moto_id) ?? 0) + 1)
  }

  const motoById = new Map(motoRows.map((m) => [m.id, m]))
  const missingGateMotoIds = motoIds.filter((id) => !gateCountByMoto.get(id))

  if (missingGateMotoIds.length > 0) {
    const grouped = new Map<string, string[]>()
    for (const row of motoRiderRows) {
      if (!missingGateMotoIds.includes(row.moto_id)) continue
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

    gateRows.push(...insertRows)
  }

  const riderIds = Array.from(new Set([
    ...gateRows.map((g) => g.rider_id),
    ...motoRiderRows.map((row) => row.rider_id),
  ]))

  const riderSelect = includePhotos
    ? 'id, name, rider_nickname, no_plate_display, club, photo_thumbnail_url'
    : 'id, name, rider_nickname, no_plate_display, club'

  const [statusResult, penaltyResult, riderResult] =
    riderIds.length > 0
      ? await Promise.all([
          adminClient
            .from('rider_participation_status')
            .select('moto_id, rider_id, participation_status')
            .eq('event_id', eventId)
            .in('rider_id', riderIds),
          adminClient
            .from('rider_penalties')
            .select('rider_id, moto_id, penalty_point, stage, rider_penalty_approvals!inner(approval_status)')
            .eq('event_id', eventId)
            .eq('rider_penalty_approvals.approval_status', 'APPROVED')
            .in('rider_id', riderIds),
          adminClient
            .from('riders')
            .select(riderSelect)
            .in('id', riderIds),
        ])
      : [
          { data: [], error: null },
          { data: [], error: null },
          { data: [], error: null },
        ]

  const statusMap = new Map<string, 'ACTIVE' | 'DNS' | 'DNF' | 'ABSENT'>()
  const { data: statuses, error: statusError } = statusResult
  if (statusError) return NextResponse.json({ error: statusError.message }, { status: 400 })
  for (const row of statuses ?? []) {
    statusMap.set(`${row.moto_id}:${row.rider_id}`, row.participation_status)
  }

  const qualificationPenaltyMap = new Map<string, number>()
  const stagePenaltyMap = new Map<string, number>()
  const motoPenaltyMap = new Map<string, number>()
  const { data: penalties, error: penaltyError } = penaltyResult
  if (penaltyError) return NextResponse.json({ error: penaltyError.message }, { status: 400 })
  for (const row of penalties ?? []) {
    const amount = Number(row.penalty_point ?? 0)
    if (row.moto_id) {
      const key = `${row.moto_id}:${row.rider_id}`
      const current = motoPenaltyMap.get(key) ?? 0
      motoPenaltyMap.set(key, current + amount)
      continue
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

  const { data: riders, error: riderError } = riderResult
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
  const qualificationMoto3 = batchEntries.length === 1 ? batchEntries[0][1].moto3 : null
  const qualificationMoto3AssignedCount = qualificationMoto3
    ? assignedRiderCountByMoto.get(qualificationMoto3.id) ?? 0
    : 0
  const qualificationMoto3ResultCount = qualificationMoto3
    ? resultRows.filter((row) => row.moto_id === qualificationMoto3.id).length
    : 0
  const hasCompletedQualificationMoto3 =
    Number(pointOverrideConfig?.qualification_moto_count ?? 2) >= 3 ||
    (batchEntries.length === 1 && qualificationMoto3AssignedCount > 0 && qualificationMoto3ResultCount >= qualificationMoto3AssignedCount)
  const qualificationTieBreakMotoIndexes = hasCompletedQualificationMoto3 ? [3, 2, 1] : [2, 1]
  const qualificationTieBreakOptions = {
    dnfProgressEnabled: qualificationTieBreakRepechage ? false : dnfProgressEnabled,
    motoIndexes: qualificationTieBreakMotoIndexes,
    statusTiebreakEnabled: !qualificationTieBreakRepechage,
  }
  const stageBatchOrderById = new Map<string, number>()
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

  const qualificationStageSeedRows = stageSeedRows.filter((row) => row.stage === 'QUALIFICATION')
  const completedQualificationTieBreakRiderIds = new Set<string>()
  const activeQualificationTieBreakRiderIds = new Set<string>()
  let qualificationH2HPendingCount = 0
  let qualificationH2HAppliedCount = 0
  for (const moto of qualificationTieBreakMotoRows) {
    const assigned = motoRiderRows.filter((row) => row.moto_id === moto.id).map((row) => row.rider_id)
    if (assigned.length === 0) continue
    const completed = new Set(resultRows.filter((row) => row.moto_id === moto.id).map((row) => row.rider_id))
    const tieBreakComplete =
      ['LOCKED', 'FINISHED'].includes(String(moto.status ?? '').toUpperCase()) &&
      assigned.length > 0 &&
      assigned.every((riderId) => completed.has(riderId))
    if (tieBreakComplete) {
      qualificationH2HAppliedCount += 1
      assigned.forEach((riderId) => completedQualificationTieBreakRiderIds.add(riderId))
    } else {
      qualificationH2HPendingCount += 1
      assigned.forEach((riderId) => activeQualificationTieBreakRiderIds.add(riderId))
    }
  }
  const quarterStageResultRows = stageSeedRows.filter((row) => row.stage === 'QUARTER_FINAL' && row.position !== null)
  const repechageStageResultRows = stageSeedRows.filter((row) => row.stage === 'REPECHAGE' && row.position !== null)
  const semiStageResultRows = stageSeedRows.filter((row) => row.stage === 'SEMI_FINAL' && row.position !== null)
  const quarterStageRiderIds = new Set(stageSeedRows.filter((row) => row.stage === 'QUARTER_FINAL').map((row) => row.rider_id))
  const repechageStageRiderIds = new Set(stageSeedRows.filter((row) => row.stage === 'REPECHAGE').map((row) => row.rider_id))
  const semiStageRiderIds = new Set(stageSeedRows.filter((row) => row.stage === 'SEMI_FINAL').map((row) => row.rider_id))

  const finalQualificationSeedByRider = new Map<string, StageSeedRow>()
  for (const row of qualificationStageSeedRows) {
    if (row.position === null) continue
    const current = finalQualificationSeedByRider.get(row.rider_id)
    if (
      !current ||
      row.position < (current.position ?? Number.MAX_SAFE_INTEGER) ||
      (row.position === current.position && (row.points ?? Number.MAX_SAFE_INTEGER) < (current.points ?? Number.MAX_SAFE_INTEGER))
    ) {
      finalQualificationSeedByRider.set(row.rider_id, row)
    }
  }

  const qualificationGateByRider = new Map<string, number>()
  for (const moto of motoRows) {
    const parsed = parseBatchKey(moto.moto_name)
    if (!parsed || parsed.motoIndex !== 1) continue
    for (const gate of gateRows.filter((row) => row.moto_id === moto.id)) {
      qualificationGateByRider.set(gate.rider_id, gate.gate_position)
    }
  }

  const nextQualificationLabelForRank = (rank: number | null | undefined, riderId: string, batchIndex: number) => {
    const qualificationAssignment = qualificationStageSeedRows.find((row) => row.rider_id === riderId)
    if (qualificationStageSeedRows.length > 0) {
      if (qualificationAssignment?.qualification_next_outcome === 'FINISHER') return 'FINISHER'
      if (qualificationAssignment?.qualification_next_outcome === 'UNASSIGNED') return null
      if (
        qualificationAssignment?.qualification_next_outcome === 'STAGE' &&
        qualificationAssignment.qualification_next_stage
      ) {
        if (qualificationAssignment.qualification_next_stage === 'REPECHAGE') {
          const subsequentStage = (['FINAL', 'SEMI_FINAL', 'QUARTER_FINAL'] as const)
            .map((stage) => stageSeedRows.find((row) => row.rider_id === riderId && row.stage === stage))
            .find((row) => row !== undefined)
          if (subsequentStage) {
            const label = formatQualificationTargetLabel(subsequentStage.stage as QualificationCustomRuleRow['target_stage'], subsequentStage.final_class ?? null)
            return label ? `${label} (via Repechage)` : null
          }
          if (completedQualificationTieBreakRiderIds.has(riderId)) {
            const repechageResult = stageSeedRows.find((row) => row.rider_id === riderId && row.stage === 'REPECHAGE')
            if (repechageResult?.qualification_next_outcome === 'FINISHER') {
              return 'FINISHER (via Repechage)'
            }
          }
          return 'REPECHAGE'
        }
        return formatQualificationTargetLabel(
          qualificationAssignment.qualification_next_stage,
          qualificationAssignment.qualification_next_final_class ?? null
        )
      }

      // Older generated brackets predate the frozen fields; use their saved
      // stage assignment rather than recalculating an already-generated route.
      const hadRepechage = stageSeedRows.some((row) => row.rider_id === riderId && row.stage === 'REPECHAGE')
      const storedStageAssignment = (['FINAL', 'SEMI_FINAL', 'QUARTER_FINAL', 'REPECHAGE'] as const)
        .map((stage) => stageSeedRows.find((row) => row.rider_id === riderId && row.stage === stage))
        .find((row) => row !== undefined)
      if (storedStageAssignment && storedStageAssignment.stage !== 'QUALIFICATION') {
        const label = formatQualificationTargetLabel(storedStageAssignment.stage, storedStageAssignment.final_class ?? null)
        if (label && hadRepechage && storedStageAssignment.stage !== 'REPECHAGE') {
          return `${label} (via Repechage)`
        }
        return label
      }
    }
    if (
      qualificationTieBreakRepechage &&
      (activeQualificationTieBreakRiderIds.has(riderId) || completedQualificationTieBreakRiderIds.has(riderId))
    ) {
      if (completedQualificationTieBreakRiderIds.has(riderId)) {
        const subsequentStage = (['FINAL', 'SEMI_FINAL', 'QUARTER_FINAL'] as const)
          .map((stage) => stageSeedRows.find((row) => row.rider_id === riderId && row.stage === stage))
          .find((row) => row !== undefined)
        if (subsequentStage) {
          const label = formatQualificationTargetLabel(subsequentStage.stage as QualificationCustomRuleRow['target_stage'], subsequentStage.final_class ?? null)
          return label ? `${label} (via Repechage)` : null
        }
      }
      return 'REPECHAGE'
    }
    const rankForRules = qualificationAssignment?.position ?? rank
    if (!rankForRules || qualificationRules.length === 0) return null
    if (qualificationSplitBasis === 'GLOBAL_ACTIVE_FIRST') {
      const riderAssignments = stageSeedRows.filter(
        (stageRow) => stageRow.rider_id === riderId && stageRow.stage !== 'QUALIFICATION'
      )
      const assigned = riderAssignments.find((stageRow) => stageRow.position === null) ?? riderAssignments[0]
      if (assigned && assigned.stage !== 'QUALIFICATION') {
        return formatQualificationTargetLabel(assigned.stage, assigned.final_class ?? null)
      }
      if (qualificationStageSeedRows.length === 0) return null
      const globalRank = qualificationStageSeedRows.find((row) => row.rider_id === riderId)?.position ?? rank
      const matchedRule = qualificationRules.find(
        (rule) => globalRank !== null && globalRank !== undefined && globalRank >= rule.rank_from && globalRank <= rule.rank_to
      )
      return matchedRule
        ? formatQualificationTargetLabel(matchedRule.target_stage, matchedRule.target_final_class, matchedRule.target_outcome)
        : null
    }
    const matchingRules =
      qualificationSplitBasis === 'CUSTOM_PER_BATCH'
        ? qualificationRules.filter((rule) => (rule.batch_no ?? 1) === batchIndex)
        : qualificationRules
    const matchedRule = matchingRules.find((rule) => rankForRules >= rule.rank_from && rankForRules <= rule.rank_to)
    if (!matchedRule) return null
    return formatQualificationTargetLabel(matchedRule.target_stage, matchedRule.target_final_class, matchedRule.target_outcome)
  }

  const combinedQualificationCandidates: Array<{
    riderId: string
    points: number
    batchRank: number
    batchIndex: number
    batchId: string
    tieBreak: ReturnType<typeof createQualificationTieBreakData>
  }> = []

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
      const assignedMoto1Ids = new Set(motoRiderRows.filter((row) => row.moto_id === moto1.id).map((row) => row.rider_id))
      const assignedMoto2Ids = new Set(moto2 ? motoRiderRows.filter((row) => row.moto_id === moto2.id).map((row) => row.rider_id) : [])
      const assignedMoto3Ids = new Set(moto3 ? motoRiderRows.filter((row) => row.moto_id === moto3.id).map((row) => row.rider_id) : [])
      const riderIdsInBatch = Array.from(new Set([
        ...assignedMoto1Ids,
        ...assignedMoto2Ids,
        ...assignedMoto3Ids,
        ...gate1Map.keys(),
        ...gate2Map.keys(),
        ...gate3Map.keys(),
      ]))
      const qualificationTieBreakByRider = new Map<string, ReturnType<typeof createQualificationTieBreakData>>()
      const qualificationRankingTotalByRider = new Map<string, number | null>()

      const rows = riderIdsInBatch.map((riderId) => {
        const rider = riderMap.get(riderId)
        const moto1Result = resultRows.find((r) => r.moto_id === moto1.id && r.rider_id === riderId)
        const moto2Result = moto2
          ? resultRows.find((r) => r.moto_id === moto2.id && r.rider_id === riderId)
          : null
        const moto3Result = moto3
          ? resultRows.find((r) => r.moto_id === moto3.id && r.rider_id === riderId)
          : null
        const qualificationRiderCount1 = scoringRiderCountByMoto.get(moto1.id) || null
        const qualificationRiderCount2 = moto2 ? scoringRiderCountByMoto.get(moto2.id) || null : null
        const qualificationRiderCount3 = moto3 ? scoringRiderCountByMoto.get(moto3.id) || null : null
        const riderStatus = statusMap.get(`${moto1.id}:${riderId}`) ?? 'ACTIVE'
        const dnsCount1 = moto1 ? resultRows.filter((r) => r.moto_id === moto1.id && r.result_status === 'DNS').length : 0
        const dnsCount2 = moto2 ? resultRows.filter((r) => r.moto_id === moto2.id && r.result_status === 'DNS').length : 0
        const dnsCount3 = moto3 ? resultRows.filter((r) => r.moto_id === moto3.id && r.result_status === 'DNS').length : 0
        
        const point1 = pointForMotoResult(moto1Result ?? null, qualificationRiderCount1, dnsCount1)
        const point2 = pointForMotoResult(moto2Result ?? null, qualificationRiderCount2, dnsCount2)
        const point3 = pointForMotoResult(moto3Result ?? null, qualificationRiderCount3, dnsCount3)
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
        const manualQualificationPenalty = motoSpecificPenaltyTotal > 0 ? motoSpecificPenaltyTotal : stageWideQualificationPenalty
        const manualQualificationPenalty1 = qualificationTieBreakRepechage
          ? motoSpecificPenaltyTotal > 0
            ? moto1?.id ? motoPenaltyMap.get(`${moto1.id}:${riderId}`) ?? 0 : 0
            : stageWideQualificationPenalty
          : manualQualificationPenalty
        const manualQualificationPenalty2 = qualificationTieBreakRepechage && motoSpecificPenaltyTotal > 0 && moto2?.id
          ? motoPenaltyMap.get(`${moto2.id}:${riderId}`) ?? 0
          : 0
        const manualQualificationPenalty3 = qualificationTieBreakRepechage && motoSpecificPenaltyTotal > 0 && moto3?.id
          ? motoPenaltyMap.get(`${moto3.id}:${riderId}`) ?? 0
          : 0
        const qualificationPoint1 = moto1Result
          ? (point1 ?? 9999) + resolveNonFinishAutoPenalty(moto1Result.result_status, pointOverrideConfig ?? undefined) + manualQualificationPenalty1
          : null
        const qualificationPoint2 = moto2Result
          ? (point2 ?? 9999) + resolveNonFinishAutoPenalty(moto2Result.result_status, pointOverrideConfig ?? undefined) + manualQualificationPenalty2
          : null
        const qualificationPoint3 = moto3Result
          ? (point3 ?? 9999) + resolveNonFinishAutoPenalty(moto3Result.result_status, pointOverrideConfig ?? undefined) + manualQualificationPenalty3
          : null
        const qualificationTotalPoint = [qualificationPoint1, qualificationPoint2, qualificationPoint3]
          .filter((point): point is number => point !== null)
          .reduce((sum, point) => sum + point, 0)
        qualificationTieBreakByRider.set(
          riderId,
          createQualificationTieBreakData([
            {
              motoIndex: 1,
              points: qualificationPoint1,
              resultStatus: moto1Result?.result_status,
              dnfProgressPercent: moto1Result?.dnf_progress_percent,
            },
            {
              motoIndex: 2,
              points: qualificationPoint2,
              resultStatus: moto2Result?.result_status,
              dnfProgressPercent: moto2Result?.dnf_progress_percent,
            },
            {
              motoIndex: 3,
              points: qualificationPoint3,
              resultStatus: moto3Result?.result_status,
              dnfProgressPercent: moto3Result?.dnf_progress_percent,
            },
          ])
        )
        qualificationRankingTotalByRider.set(riderId, hasRecordedResult ? qualificationTotalPoint : null)

        const status: QualificationRowStatus =
          moto1Result?.result_status === 'DQ' ||
          (moto2 ? moto2Result?.result_status === 'DQ' : false) ||
          (moto3 ? moto3Result?.result_status === 'DQ' : false)
            ? 'DQ'
            // ABSENT is a Checker preparation state. Public results intentionally
            // show its recorded scoring outcome, DNS, rather than the internal cue.
            : riderStatus === 'ABSENT' && hasRecordedResult
              ? 'DNS'
              : moto1Result && (!moto2 || moto2Result) && (!moto3 || moto3Result)
                ? 'FINISHED'
                : 'PENDING'
        return {
          rider_id: riderId,
          assigned_moto1: assignedMoto1Ids.has(riderId),
          assigned_moto2: assignedMoto2Ids.has(riderId),
          assigned_moto3: assignedMoto3Ids.has(riderId),
          gate_moto1: gate1Map.get(riderId) ?? null,
          gate_moto2: gate2Map.get(riderId) ?? null,
          gate_moto3: gate3Map.get(riderId) ?? null,
          name: rider?.name ?? '-',
          rider_nickname: rider?.rider_nickname ?? null,
          no_plate: rider?.no_plate_display ?? '-',
          club: rider?.club ?? '-',
          ...(includePhotos ? { photo_thumbnail_url: rider?.photo_thumbnail_url ?? null } : {}),
          point_moto1: point1,
          point_moto2: point2,
          point_moto3: point3,
          penalty_moto1: moto1Result
            ? resolveNonFinishAutoPenalty(moto1Result.result_status, pointOverrideConfig ?? undefined) +
              (moto1?.id ? motoPenaltyMap.get(`${moto1.id}:${riderId}`) ?? 0 : 0)
            : null,
          penalty_moto2: moto2Result
            ? resolveNonFinishAutoPenalty(moto2Result.result_status, pointOverrideConfig ?? undefined) +
              (moto2?.id ? motoPenaltyMap.get(`${moto2.id}:${riderId}`) ?? 0 : 0)
            : null,
          penalty_moto3: moto3Result
            ? resolveNonFinishAutoPenalty(moto3Result.result_status, pointOverrideConfig ?? undefined) +
              (moto3?.id ? motoPenaltyMap.get(`${moto3.id}:${riderId}`) ?? 0 : 0)
            : null,
          total_point_moto1: point1 !== null
            ? point1 +
              (resolveNonFinishAutoPenalty(moto1Result?.result_status, pointOverrideConfig ?? undefined) +
                (moto1?.id ? motoPenaltyMap.get(`${moto1.id}:${riderId}`) ?? 0 : 0))
            : null,
          total_point_moto2: point2 !== null
            ? point2 +
              (resolveNonFinishAutoPenalty(moto2Result?.result_status, pointOverrideConfig ?? undefined) +
                (moto2?.id ? motoPenaltyMap.get(`${moto2.id}:${riderId}`) ?? 0 : 0))
            : null,
          total_point_moto3: point3 !== null
            ? point3 +
              (resolveNonFinishAutoPenalty(moto3Result?.result_status, pointOverrideConfig ?? undefined) +
                (moto3?.id ? motoPenaltyMap.get(`${moto3.id}:${riderId}`) ?? 0 : 0))
            : null,
          moto1_status: (moto1Result?.result_status ?? 'PENDING') as QualificationMotoStatus,
          moto2_status: (moto2Result?.result_status ?? 'PENDING') as QualificationMotoStatus,
          moto3_status: (moto3Result?.result_status ?? 'PENDING') as QualificationMotoStatus,
          penalty_total: penaltyTotalDisplay,
          total_point: totalPoint,
          qualification_ranking_total: hasRecordedResult ? qualificationTotalPoint : null,
          status,
        }
      })

      const rankedRows = rows
        .filter((row) => row.total_point !== null || row.status === 'DQ')
        .sort((a, b) => {
          const aPoint = qualificationRankingTotalByRider.get(a.rider_id) ?? Number.MAX_SAFE_INTEGER
          const bPoint = qualificationRankingTotalByRider.get(b.rider_id) ?? Number.MAX_SAFE_INTEGER
          if (aPoint !== bPoint) return aPoint - bPoint
          const tieDiff = compareQualificationTieBreakData(
            qualificationTieBreakByRider.get(a.rider_id),
            qualificationTieBreakByRider.get(b.rider_id),
            qualificationTieBreakOptions
          )
          return tieDiff || a.rider_id.localeCompare(b.rider_id)
        })
      const rankMap = new Map<string, number>()
      let currentRank = 0
      let previousPoints: number | null = null
      let previousTieBreak: ReturnType<typeof createQualificationTieBreakData> | undefined
      rankedRows.forEach((row, index) => {
        const points = qualificationRankingTotalByRider.get(row.rider_id) ?? Number.MAX_SAFE_INTEGER
        const tieBreak = qualificationTieBreakByRider.get(row.rider_id)
        if (
          index === 0 ||
          points !== previousPoints ||
          compareQualificationTieBreakData(tieBreak, previousTieBreak, {
            ...qualificationTieBreakOptions,
          }) !== 0
        ) {
          currentRank = index + 1
          previousPoints = points
          previousTieBreak = tieBreak
        }
        rankMap.set(row.rider_id, currentRank)
      })
      if (qualificationTieBreakRepechage) {
        rankedRows.forEach((row) => {
          if (!completedQualificationTieBreakRiderIds.has(row.rider_id)) return
          const officialRank = qualificationStageSeedRows.find((seed) => seed.rider_id === row.rider_id)?.position
          if (officialRank !== null && officialRank !== undefined) rankMap.set(row.rider_id, officialRank)
        })
      }
      rankedRows.forEach((row) => {
        const tieBreak = qualificationTieBreakByRider.get(row.rider_id)
        const rank = rankMap.get(row.rider_id)
        const points = qualificationRankingTotalByRider.get(row.rider_id)
        if (tieBreak && rank && points !== null && points !== undefined) {
          combinedQualificationCandidates.push({
            riderId: row.rider_id,
            points,
            batchRank: rank,
            batchIndex,
            batchId: moto1.id,
            tieBreak,
          })
        }
      })

      const ordered = rows
        .map((r) => {
          const rank = rankMap.get(r.rider_id) ?? null
          return {
            ...r,
            batch_rank: rank,
            overall_rank: rank,
            rank_point: rank,
            class_label: nextQualificationLabelForRank(rank, r.rider_id, batchIndex),
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
        moto1_status: moto1.status ?? null,
        moto2_status: moto2?.status ?? null,
        moto3_status: moto3?.status ?? null,
        moto_status: resolvedMotoStatus || null,
        isProvisional: resolvedMotoStatus === 'PROVISIONAL',
        isUnderReview: resolvedMotoStatus === 'PROTEST_REVIEW',
        isOfficial: resolvedMotoStatus === 'LOCKED',
        rows: ordered,
      }
    })
    .sort((a, b) => {
      if (a.batch_index !== b.batch_index) return a.batch_index - b.batch_index
      return a.sequence_order - b.sequence_order
    })

  if (qualificationSplitBasis === 'COMBINED' && combinedQualificationCandidates.length > 0) {
    const rankedCombined = [...combinedQualificationCandidates].sort((a, b) => {
      if (a.points !== b.points) return a.points - b.points
      const tieDiff = compareQualificationTieBreakData(a.tieBreak, b.tieBreak, {
        ...qualificationTieBreakOptions,
      })
      if (tieDiff !== 0) return tieDiff
      if (a.batchRank !== b.batchRank) return a.batchRank - b.batchRank
      const batchDiff = a.batchId.localeCompare(b.batchId)
      if (batchDiff !== 0) return batchDiff
      if (a.batchIndex !== b.batchIndex) return a.batchIndex - b.batchIndex
      return a.riderId.localeCompare(b.riderId)
    })
    const combinedRankByRider = new Map<string, number>()
    let currentRank = 0
    let previousPoints: number | null = null
    let previousBatchRank: number | null = null
    let previousTieBreak: ReturnType<typeof createQualificationTieBreakData> | undefined
    rankedCombined.forEach((row, index) => {
      if (
        index === 0 ||
        row.points !== previousPoints ||
        row.batchRank !== previousBatchRank ||
        compareQualificationTieBreakData(row.tieBreak, previousTieBreak, {
          ...qualificationTieBreakOptions,
        }) !== 0
      ) {
        currentRank = index + 1
        previousPoints = row.points
        previousBatchRank = row.batchRank
        previousTieBreak = row.tieBreak
      }
      combinedRankByRider.set(row.riderId, currentRank)
    })

    batches.forEach((batch) => {
      batch.rows.forEach((row) => {
        const rank = combinedRankByRider.get(row.rider_id) ?? null
        row.overall_rank = rank
        row.rank_point = row.batch_rank ?? row.rank_point ?? rank
        row.class_label = nextQualificationLabelForRank(rank, row.rider_id, batch.batch_index)
      })
    })
  }

  const stageMotos = motoRows
    .filter((m) => !parseBatchKey(m.moto_name))
    .sort(compareMotoDisplayOrder)
  const stageGroups: StageGroup[] = stageMotos.flatMap((moto) => {
    const isFinalMoto = /^final\b/i.test(moto.moto_name)
    const finalClass = isFinalMoto
      ? normalizeFinalClassValue(moto.moto_name.replace(/^final\s+/i, '').trim())
      : null
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
    // A tied advanced-stage result is resolved from the rider's entry seed,
    // not from the lane used in the current moto.
    const directSeedRows =
      stageSource === 'QUARTER_FINAL'
        ? repechageStageResultRows
        : stageSource === 'SEMI_FINAL'
          ? [...repechageStageResultRows, ...quarterStageResultRows]
          : []
    const qualificationSeedByRider = new Map(qualificationStageSeedRows.map((row) => [row.rider_id, row]))
    const directSeedByRider = new Map(directSeedRows.map((row) => [row.rider_id, row]))
    const validAssignedRiderIds = assignedRiderIds.filter((id) => riderMap.has(id))
    const validRiderIdsInMoto = riderIdsInMoto.filter((id) => riderMap.has(id))

    if (gateMap.size === 0 && /^final /i.test(moto.moto_name)) {
      const qualificationDirect = validRiderIdsInMoto.filter(
        (riderId) =>
          !repechageStageRiderIds.has(riderId) &&
          !quarterStageRiderIds.has(riderId) &&
          !semiStageRiderIds.has(riderId)
      )
      const repechageDerived = validRiderIdsInMoto.filter(
        (riderId) =>
          repechageStageRiderIds.has(riderId) &&
          !quarterStageRiderIds.has(riderId) &&
          !semiStageRiderIds.has(riderId)
      )
      const quarterDerived = validRiderIdsInMoto.filter(
        (riderId) => quarterStageRiderIds.has(riderId) && !semiStageRiderIds.has(riderId)
      )
      const semiDerived = validRiderIdsInMoto.filter((riderId) => semiStageRiderIds.has(riderId))

      const ordered = [
        ...orderRidersByStageSeeds(qualificationDirect, qualificationStageSeedRows, stageBatchOrderById),
        ...orderRidersByStageSeeds(repechageDerived, repechageStageResultRows, stageBatchOrderById),
        ...orderRidersByStageSeeds(quarterDerived, quarterStageResultRows, stageBatchOrderById),
        ...orderRidersByStageSeeds(semiDerived, semiStageResultRows, stageBatchOrderById),
      ]
      ordered.forEach((riderId, index) => gateMap.set(riderId, index + 1))
    } else if (gateMap.size === 0 && stageSource && validRiderIdsInMoto.length > 0) {
      const seedRows =
        stageSource === 'QUARTER_FINAL'
          ? qualificationStageSeedRows
          : stageSource === 'REPECHAGE'
            ? [...qualificationStageSeedRows, ...quarterStageResultRows, ...semiStageResultRows]
            : [...quarterStageResultRows, ...repechageStageResultRows, ...qualificationStageSeedRows]
      const ordered = orderRidersByStageSeeds(validAssignedRiderIds.length > 0 ? validAssignedRiderIds : validRiderIdsInMoto, seedRows, stageBatchOrderById)
      ordered.forEach((riderId, index) => gateMap.set(riderId, index + 1))
    } else if (gateMap.size === 0 && validRiderIdsInMoto.length > 0) {
      const ordered = validAssignedRiderIds.length > 0 ? [...validAssignedRiderIds] : [...validRiderIdsInMoto].sort((a, b) => a.localeCompare(b))
      ordered.forEach((riderId, index) => gateMap.set(riderId, index + 1))
    }
    
    const validRiderIdsWithGates = validRiderIdsInMoto.map((id) => ({ id, gate: gateMap.get(id) ?? 9999 }))
    validRiderIdsWithGates.sort((a, b) => a.gate - b.gate)
    const collapsedGateMap = new Map<string, number>()
    validRiderIdsWithGates.forEach((r, idx) => collapsedGateMap.set(r.id, idx + 1))
    
    const resultByRider = new Map(
      resultRows.filter((row) => row.moto_id === moto.id).map((row) => [row.rider_id, row])
    )
    const riderCount = validRiderIdsInMoto.filter((riderId) => resultByRider.get(riderId)?.result_status !== 'DQ').length || null

    const stagePenaltyStages = resolvePenaltyStagesForMoto(moto.moto_name)
    const rows: StageRow[] = validRiderIdsInMoto.map((riderId) => {
      const rider = riderMap.get(riderId)
      const res = resultByRider.get(riderId) ?? null
      const status = (res?.result_status ?? 'PENDING') as StageRow['status']
      const manualPenaltyTotal = stagePenaltyStages.reduce((sum, stageKey) => {
        return sum + (stagePenaltyMap.get(`${riderId}:${stageKey}`) ?? 0)
      }, 0) + (motoPenaltyMap.get(`${moto.id}:${riderId}`) ?? 0)
      const autoPenaltyTotal = resolveNonFinishAutoPenalty(status, pointOverrideConfig ?? undefined)
      const dnsCount = resultRows.filter((r) => r.moto_id === moto.id && r.result_status === 'DNS').length
      const point = pointForMotoResult(res, riderCount, dnsCount)

      return {
        rider_id: riderId,
        gate: status === 'DQ' ? null : collapsedGateMap.get(riderId) ?? null,
        name: rider?.name ?? '-',
        rider_nickname: rider?.rider_nickname ?? null,
        no_plate: rider?.no_plate_display ?? '-',
        club: rider?.club ?? '-',
        ...(includePhotos ? { photo_thumbnail_url: rider?.photo_thumbnail_url ?? null } : {}),
        point,
        penalty_total: manualPenaltyTotal + autoPenaltyTotal || null,
        total_point: point === null ? null : point + manualPenaltyTotal + autoPenaltyTotal,
        rank: null,
        status,
      }
    })

    const hasScoredStageResult = rows.some((row) => row.point !== null)
    const pendingStarterCount = rows.filter((row) => row.status !== 'DQ').length
    const hasOfficialFinalRanks = Boolean(
      finalClass &&
        moto.status?.toUpperCase() === 'LOCKED' &&
        rows.length > 0 &&
        rows.every((row) => finalRankByClassAndRider.has(`${finalClass}:${row.rider_id}`))
    )
    const rankMap = hasOfficialFinalRanks
      ? new Map(rows.map((row) => [row.rider_id, finalRankByClassAndRider.get(`${finalClass}:${row.rider_id}`) as number]))
      : new Map(
      [...rows]
        // Keep DQ unscored while assigning it the final display rank after DNS.
        .filter((row) => row.point !== null || row.status === 'DQ')
        .sort((a, b) => {
          const aPoint = (a.point ?? Number.MAX_SAFE_INTEGER) + (a.penalty_total ?? 0)
          const bPoint = (b.point ?? Number.MAX_SAFE_INTEGER) + (b.penalty_total ?? 0)
          if (aPoint !== bPoint) return aPoint - bPoint

          if (isFinalMoto) {
            const toTieBreakEntry = (row: StageRow) => {
              const qualificationSeed = finalQualificationSeedByRider.get(row.rider_id)
              const source = finalSourceSeedByRider.get(row.rider_id) ?? {
                priority: 0,
                position: Number.MAX_SAFE_INTEGER,
                points: Number.MAX_SAFE_INTEGER,
              }
              return {
                riderId: row.rider_id,
                totalPoints: (row.point ?? Number.MAX_SAFE_INTEGER) + (row.penalty_total ?? 0),
                finishOrder: resultByRider.get(row.rider_id)?.finish_order,
                resultStatus: row.status,
                dnfProgressPercent: resultByRider.get(row.rider_id)?.dnf_progress_percent,
                history: participationHistoryByRider.get(row.rider_id) ?? {
                  dnsCount: 0,
                  dnfCount: 0,
                  dqCount: 0,
                  finishCount: 0,
                },
                source,
                qualificationRank: qualificationSeed?.position,
                qualificationPoints: qualificationSeed?.points,
                qualificationBatchOrder: qualificationSeed?.batch_id
                  ? stageBatchOrderById.get(qualificationSeed.batch_id)
                  : null,
                qualificationGate: qualificationGateByRider.get(row.rider_id),
              }
            }
            return compareFinalRankingEntries(toTieBreakEntry(a), toTieBreakEntry(b), dnfProgressEnabled)
          }

          const aStatusOrder = getStageStatusSortOrder(a.status)
          const bStatusOrder = getStageStatusSortOrder(b.status)
          if (aStatusOrder !== bStatusOrder) return aStatusOrder - bStatusOrder
          if (dnfProgressEnabled && a.status === 'DNF' && b.status === 'DNF') {
            const progressDiff =
              Number(resultByRider.get(b.rider_id)?.dnf_progress_percent ?? -1) -
              Number(resultByRider.get(a.rider_id)?.dnf_progress_percent ?? -1)
            if (progressDiff !== 0) return progressDiff
          }

          const aDirectSeed = directSeedByRider.get(a.rider_id)
          const bDirectSeed = directSeedByRider.get(b.rider_id)
          const directRankDiff = compareNullableNumber(aDirectSeed?.position, bDirectSeed?.position)
          if (directRankDiff !== 0) return directRankDiff
          const directPointDiff = compareNullableNumber(aDirectSeed?.points, bDirectSeed?.points)
          if (directPointDiff !== 0) return directPointDiff

          const aQualificationSeed = qualificationSeedByRider.get(a.rider_id)
          const bQualificationSeed = qualificationSeedByRider.get(b.rider_id)
          const qualificationRankDiff = compareNullableNumber(aQualificationSeed?.position, bQualificationSeed?.position)
          if (qualificationRankDiff !== 0) return qualificationRankDiff
          const qualificationPointDiff = compareNullableNumber(aQualificationSeed?.points, bQualificationSeed?.points)
          if (qualificationPointDiff !== 0) return qualificationPointDiff
          const qualificationBatchDiff = compareNullableNumber(
            aQualificationSeed?.batch_id ? stageBatchOrderById.get(aQualificationSeed.batch_id) : null,
            bQualificationSeed?.batch_id ? stageBatchOrderById.get(bQualificationSeed.batch_id) : null
          )
          if (qualificationBatchDiff !== 0) return qualificationBatchDiff
          const qualificationGateDiff = compareNullableNumber(
            qualificationGateByRider.get(a.rider_id),
            qualificationGateByRider.get(b.rider_id)
          )
          if (qualificationGateDiff !== 0) return qualificationGateDiff

          const aGate = a.gate ?? Number.MAX_SAFE_INTEGER
          const bGate = b.gate ?? Number.MAX_SAFE_INTEGER
          if (aGate !== bGate) return aGate - bGate
          return a.rider_id.localeCompare(b.rider_id)
        })
        // Before a final starts, DQ may be the only persisted result. It must
        // remain an administrative last-place entry, not temporarily rank #1.
        .map((row, index) => [row.rider_id, hasScoredStageResult ? index + 1 : pendingStarterCount + index + 1] as const)
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
      if (matchedRule) {
        return formatQualificationTargetLabel(
          matchedRule.target_stage,
          matchedRule.target_final_class,
          matchedRule.target_outcome
        )
      }
      const maxAdvanceRank = Math.max(
        ...matchingRules
          .filter((rule) => rule.target_stage && rule.target_outcome !== 'FINISHER')
          .map((rule) => rule.rank_to),
        0
      )
      if (maxAdvanceRank > 0 && rank > maxAdvanceRank) {
        return 'FINISHER'
      }
      return null
    }

    rows.forEach((row) => {
      row.next_class_label = nextLabelForRank(row.rank)
    })

    return [{
      title: formatMotoDisplayName(moto.moto_name),
      moto_id: moto.id,
      status: moto.status ?? null,
      rows: rows.sort((a, b) => {
        // Sort by gate position first so display is 1,2,3,4,5,6,7,8
        const aGate = a.gate ?? Number.MAX_SAFE_INTEGER
        const bGate = b.gate ?? Number.MAX_SAFE_INTEGER
        if (aGate !== bGate) return aGate - bGate
        const aRank = a.rank ?? Number.MAX_SAFE_INTEGER
        const bRank = b.rank ?? Number.MAX_SAFE_INTEGER
        if (aRank !== bRank) return aRank - bRank
        return a.name.localeCompare(b.name)
      }),
    }]
  })

  const qualificationMotoTotalsByRider = new Map<string, { moto1: number | null; moto2: number | null; moto3: number | null }>()
  batches.forEach((batch) => {
    batch.rows.forEach((row) => {
      const current = qualificationMotoTotalsByRider.get(row.rider_id) ?? {
        moto1: null,
        moto2: null,
        moto3: null,
      }
      if (row.total_point_moto1 !== null && row.total_point_moto1 !== undefined) current.moto1 = row.total_point_moto1
      if (row.total_point_moto2 !== null && row.total_point_moto2 !== undefined) current.moto2 = row.total_point_moto2
      if (row.total_point_moto3 !== null && row.total_point_moto3 !== undefined) current.moto3 = row.total_point_moto3
      qualificationMotoTotalsByRider.set(row.rider_id, current)
    })
  })

  const liveScoreData = {
    category: category.label,
    qualification_batch_mode: qualificationBatchMode,
    qualification_split_basis: qualificationSplitBasis,
    qualification_has_finisher_outcome: qualificationRules.some((rule) => rule.target_outcome === 'FINISHER'),
    qualification_advancements_calculated: qualificationStageSeedRows.length > 0,
    qualification_results_official: qualificationResultsOfficial,
    qualification_h2h_pending_count: qualificationH2HPendingCount,
    qualification_h2h_applied_count: qualificationH2HAppliedCount,
    qualification_overall_rows: (qualificationStageSeedRows as StageSeedRow[])
      .filter((row) => row.stage === 'QUALIFICATION' && row.position !== null)
      .map((row): QualificationOverallRow | null => {
        const rider = riderMap.get(row.rider_id)
        if (!rider) return null
        const batchIndex = row.batch_id ? stageBatchOrderById.get(row.batch_id) ?? 1 : 1
        return {
          rider_id: row.rider_id,
          name: rider.name,
          no_plate: rider.no_plate_display,
          rank: Number(row.position),
          total_point: row.points,
          next_class_label: nextQualificationLabelForRank(Number(row.position), row.rider_id, batchIndex),
          total_point_moto1: qualificationMotoTotalsByRider.get(row.rider_id)?.moto1 ?? null,
          total_point_moto2: qualificationMotoTotalsByRider.get(row.rider_id)?.moto2 ?? null,
          total_point_moto3: qualificationMotoTotalsByRider.get(row.rider_id)?.moto3 ?? null,
        }
      })
      .filter((row): row is QualificationOverallRow => row !== null)
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)),
    batches,
    stages: stageGroups,
  }

  // Historical archives created before live_scores existed are warmed once on
  // first access. New snapshots are already complete when the event finishes.
  if (isFinishedEvent && snapshotPayload) {
    const updatedPayload = {
      ...snapshotPayload,
      live_scores: {
        ...(snapshotPayload.live_scores ?? {}),
        [categoryId]: liveScoreData,
      },
    }
    const { error: archiveError } = await adminClient
      .from('event_public_snapshots')
      .update({ payload: updatedPayload })
      .eq('event_id', eventId)
    if (archiveError) console.error('Failed to warm finished live score archive:', archiveError.message)
  }

  return NextResponse.json(
    { data: liveScoreData },
    { headers: isFinishedEvent ? FINISHED_ARCHIVE_CACHE_HEADERS : cacheHeaders }
  )
}
