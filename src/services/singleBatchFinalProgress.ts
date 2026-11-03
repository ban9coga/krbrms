import { adminClient } from '../lib/auth'
import { resolveTotalPointForRaceResult, type NonFinishPenaltyConfig } from '../lib/nonFinishScoring'
import { compareQualificationMotoTieBreak } from '../lib/qualificationRanking'

type MotoAssignment = { moto_id: string; rider_id: string }
type MotoResult = {
  moto_id: string
  rider_id: string
  finish_order: number | null
  result_status?: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | null
  dnf_progress_percent?: number | null
}

/** Legacy fallback: create Moto 2 for older draws that saved only Moto 1. */
export async function createSingleBatchMoto2FromMoto1Results(motoId: string) {
  const { data: moto, error: motoError } = await adminClient
    .from('motos')
    .select('id, event_id, category_id, moto_name')
    .eq('id', motoId)
    .maybeSingle()
  if (motoError || !moto) return { ok: false as const, warning: motoError?.message ?? 'Moto 1 tidak ditemukan.' }
  if (!/^moto\s*1\s*-\s*batch\s*1$/i.test(String(moto.moto_name ?? '').trim())) {
    return { ok: true as const, skipped: true as const }
  }

  const { data: config, error: configError } = await adminClient
    .from('race_stage_config')
    .select('single_batch_two_moto_final_enabled, dnf_point_override, dns_point_override')
    .eq('event_id', moto.event_id)
    .eq('category_id', moto.category_id)
    .maybeSingle()
  if (configError) return { ok: false as const, warning: configError.message }
  if (config?.single_batch_two_moto_final_enabled !== true) return { ok: true as const, skipped: true as const }

  const { data: existingMoto2, error: existingMoto2Error } = await adminClient
    .from('motos')
    .select('id')
    .eq('event_id', moto.event_id)
    .eq('category_id', moto.category_id)
    .ilike('moto_name', 'Moto 2 - Batch 1')
    .limit(1)
  if (existingMoto2Error) return { ok: false as const, warning: existingMoto2Error.message }
  if (existingMoto2?.length) return { ok: true as const, skipped: true as const }

  const [{ data: assignments, error: assignmentError }, { data: results, error: resultError }, { data: flags, error: flagsError }] = await Promise.all([
    adminClient.from('moto_riders').select('moto_id, rider_id').eq('moto_id', motoId),
    adminClient.from('results').select('moto_id, rider_id, finish_order, result_status, dnf_progress_percent').eq('moto_id', motoId),
    adminClient.from('event_feature_flags').select('dnf_progress_enabled').eq('event_id', moto.event_id).maybeSingle(),
  ])
  if (assignmentError || resultError || flagsError) {
    return { ok: false as const, warning: assignmentError?.message ?? resultError?.message ?? flagsError?.message }
  }

  const assignedRows = (assignments ?? []) as MotoAssignment[]
  const riderIds = assignedRows.map((row) => row.rider_id)
  if (riderIds.length === 0) return { ok: false as const, warning: 'Moto 1 belum memiliki rider.' }
  const resultRows = (results ?? []) as MotoResult[]
  const resultByRider = new Map(resultRows.map((row) => [row.rider_id, row]))
  if (!riderIds.every((riderId) => resultByRider.has(riderId))) {
    return { ok: true as const, skipped: true as const, warning: 'Menunggu hasil semua rider Moto 1.' }
  }

  const { data: penaltyRows, error: penaltyError } = await adminClient
    .from('rider_penalties')
    .select('rider_id, moto_id, penalty_point, stage, rider_penalty_approvals!inner(approval_status)')
    .eq('event_id', moto.event_id)
    .eq('rider_penalty_approvals.approval_status', 'APPROVED')
    .in('rider_id', riderIds)
  if (penaltyError) return { ok: false as const, warning: penaltyError.message }

  const motoPenaltyByRider = new Map<string, number>()
  const generalPenaltyByRider = new Map<string, number>()
  for (const row of penaltyRows ?? []) {
    const amount = Number(row.penalty_point ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) continue
    const target = row.moto_id === motoId
      ? motoPenaltyByRider
      : !row.moto_id && row.stage === 'MOTO'
        ? generalPenaltyByRider
        : null
    if (target) target.set(row.rider_id, (target.get(row.rider_id) ?? 0) + amount)
  }

  const dnsCount = resultRows.filter((row) => row.result_status === 'DNS').length
  const scoringConfig = config as NonFinishPenaltyConfig
  const orderedRiderIds = riderIds
    .map((riderId) => {
      const result = resultByRider.get(riderId) as MotoResult
      const rawPoints = resolveTotalPointForRaceResult(
        result.result_status ?? 'FINISH',
        result.finish_order,
        riderIds.length,
        scoringConfig,
        dnsCount
      )
      const penalty = motoPenaltyByRider.get(riderId) ?? generalPenaltyByRider.get(riderId) ?? 0
      const tiebreakPoints = rawPoints === null ? Number.MAX_SAFE_INTEGER : rawPoints + penalty
      return {
        riderId,
        points: tiebreakPoints,
        tiebreakPoints,
        finishOrder: result.finish_order ?? Number.MAX_SAFE_INTEGER,
        status: result.result_status,
        dnfProgressPercent: result.dnf_progress_percent,
      }
    })
    .sort((a, b) => {
      if (a.points !== b.points) return a.points - b.points
      const tieBreak = compareQualificationMotoTieBreak(
        { motoIndex: 1, points: a.tiebreakPoints, resultStatus: a.status, dnfProgressPercent: a.dnfProgressPercent },
        { motoIndex: 1, points: b.tiebreakPoints, resultStatus: b.status, dnfProgressPercent: b.dnfProgressPercent },
        flags?.dnf_progress_enabled === true
      )
      if (tieBreak !== 0) return tieBreak
      if (a.finishOrder !== b.finishOrder) return a.finishOrder - b.finishOrder
      return a.riderId.localeCompare(b.riderId)
    })
    .map((row) => row.riderId)

  const { data: created, error: createError } = await adminClient.rpc('create_single_batch_moto2_from_results', {
    p_event_id: moto.event_id,
    p_category_id: moto.category_id,
    p_ordered_rider_ids: orderedRiderIds,
  })
  if (createError) return { ok: false as const, warning: createError.message }
  const createdRow = Array.isArray(created) ? created[0] : created
  return { ok: true as const, motoId: createdRow?.moto_id ?? null, created: createdRow?.created === true }
}
