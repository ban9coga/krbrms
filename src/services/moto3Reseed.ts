import { adminClient } from '../lib/auth'
import { resolveTotalPointForRaceResult, type NonFinishPenaltyConfig } from '../lib/nonFinishScoring'
import { compareQualificationMotoTieBreak } from '../lib/qualificationRanking'

type MotoLookupRow = {
  id: string
  event_id: string
  category_id: string
  moto_name: string
  status?: string | null
  moto_order?: number | null
}

type MotoAssignmentRow = {
  moto_id: string
  rider_id: string
}

type MotoResultRow = {
  moto_id: string
  rider_id: string
  finish_order: number | null
  result_status?: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | null
  dnf_progress_percent?: number | null
}

export const parseMotoBatchKey = (name: string) => {
  const match = name.match(/moto\s*(\d+)\s*-\s*batch\s*(\d+)/i)
  if (!match) return null
  return { motoIndex: Number(match[1]), batchIndex: Number(match[2]) }
}

const pointForRaceResult = (
  row: MotoResultRow | null | undefined,
  riderCount: number,
  config?: NonFinishPenaltyConfig,
  dnsCount = 0
) => {
  if (!row) return null
  return resolveTotalPointForRaceResult(row.result_status ?? 'FINISH', row.finish_order, riderCount, config, dnsCount)
}

export async function reseedSingleBatchMoto3FromMoto(motoId: string) {
  const { data: currentMoto, error: currentMotoError } = await adminClient
    .from('motos')
    .select('id, event_id, category_id, moto_name')
    .eq('id', motoId)
    .maybeSingle()

  if (currentMotoError || !currentMoto?.event_id || !currentMoto?.category_id || !currentMoto?.moto_name) {
    return { ok: false as const, warning: currentMotoError?.message ?? 'Moto not found for Moto 3 reseed.' }
  }

  const { data: stageConfig } = await adminClient
    .from('race_stage_config')
    .select('dnf_point_override, dns_point_override')
    .eq('event_id', currentMoto.event_id)
    .eq('category_id', currentMoto.category_id)
    .maybeSingle()

  const { data: featureFlags, error: featureFlagsError } = await adminClient
    .from('event_feature_flags')
    .select('dnf_progress_enabled')
    .eq('event_id', currentMoto.event_id)
    .maybeSingle()
  if (featureFlagsError) return { ok: false as const, warning: featureFlagsError.message }
  const dnfProgressEnabled = featureFlags?.dnf_progress_enabled === true

  const { data: categoryMotos, error: categoryMotoError } = await adminClient
    .from('motos')
    .select('id, event_id, category_id, moto_name, status, moto_order')
    .eq('event_id', currentMoto.event_id)
    .eq('category_id', currentMoto.category_id)
    .order('moto_order', { ascending: true })

  if (categoryMotoError) {
    return { ok: false as const, warning: categoryMotoError.message }
  }

  const qualificationMotos = ((categoryMotos ?? []) as MotoLookupRow[]).filter((moto) => parseMotoBatchKey(moto.moto_name))
  const parsedQualificationMotos = qualificationMotos
    .map((moto) => ({ moto, parsed: parseMotoBatchKey(moto.moto_name) }))
    .filter((row): row is { moto: MotoLookupRow; parsed: { motoIndex: number; batchIndex: number } } => Boolean(row.parsed))

  const batchIndices = new Set(parsedQualificationMotos.map((row) => row.parsed.batchIndex))
  if (batchIndices.size !== 1) return { ok: true as const }

  const moto1 = parsedQualificationMotos.find((row) => row.parsed.batchIndex === 1 && row.parsed.motoIndex === 1)?.moto
  const moto2 = parsedQualificationMotos.find((row) => row.parsed.batchIndex === 1 && row.parsed.motoIndex === 2)?.moto
  const moto3 = parsedQualificationMotos.find((row) => row.parsed.batchIndex === 1 && row.parsed.motoIndex === 3)?.moto

  if (!moto1 || !moto2) return { ok: true as const }

  const currentParsed = parseMotoBatchKey(currentMoto.moto_name)
  if (!currentParsed) return { ok: true as const }
  if (
    !(
      (currentParsed.batchIndex === 1 && currentParsed.motoIndex === 2) ||
      currentMoto.id === moto2.id ||
      (moto3 ? currentMoto.id === moto3.id : false)
    )
  ) {
    return { ok: true as const }
  }

  if (moto3) {
    const status = String(moto3.status ?? '').toUpperCase()
    if (status === 'READY' || status === 'LIVE') {
      return { ok: false as const, warning: `Moto 3 sudah ${status}. Kembalikan ke UPCOMING sebelum reseed gate.` }
    }
    if (status === 'LOCKED') {
      return { ok: false as const, warning: 'Moto 3 masih LOCKED. Unlock dulu sebelum reseed gate.' }
    }
    if (status === 'PROTEST_REVIEW') {
      return { ok: false as const, warning: 'Moto 3 sedang PROTEST_REVIEW. Selesaikan review dulu sebelum reseed gate.' }
    }
  }

  const { data: assignedRows, error: assignedError } = await adminClient
    .from('moto_riders')
    .select('moto_id, rider_id')
    .in('moto_id', moto3 ? [moto1.id, moto2.id, moto3.id] : [moto1.id, moto2.id])

  if (assignedError) {
    return { ok: false as const, warning: assignedError.message }
  }

  const moto1Riders = ((assignedRows ?? []) as MotoAssignmentRow[])
    .filter((row) => row.moto_id === moto1.id)
    .map((row) => row.rider_id)
  if (moto1Riders.length === 0) return { ok: true as const }

  const qualificationMotoIds = [moto1.id, moto2.id, ...(moto3 ? [moto3.id] : [])]
  const { data: penaltyRows, error: penaltyError } = await adminClient
    .from('rider_penalties')
    .select('rider_id, moto_id, penalty_point, stage, rider_penalty_approvals!inner(approval_status)')
    .eq('event_id', currentMoto.event_id)
    .eq('rider_penalty_approvals.approval_status', 'APPROVED')
    .in('rider_id', moto1Riders)
  if (penaltyError) return { ok: false as const, warning: penaltyError.message }

  const manualQualificationPenaltyByRider = new Map<string, number>()
  const motoSpecificPenaltyByRider = new Map<string, number>()
  for (const penalty of penaltyRows ?? []) {
    const amount = Number(penalty.penalty_point ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) continue
    if (penalty.moto_id) {
      if (!qualificationMotoIds.includes(penalty.moto_id)) continue
      motoSpecificPenaltyByRider.set(
        penalty.rider_id,
        (motoSpecificPenaltyByRider.get(penalty.rider_id) ?? 0) + amount
      )
    } else if (penalty.stage === 'MOTO') {
      manualQualificationPenaltyByRider.set(
        penalty.rider_id,
        (manualQualificationPenaltyByRider.get(penalty.rider_id) ?? 0) + amount
      )
    }
  }

  const { data: resultRows, error: resultError } = await adminClient
    .from('results')
    .select('moto_id, rider_id, finish_order, result_status, dnf_progress_percent')
    .in('moto_id', [moto1.id, moto2.id])

  if (resultError) {
    return { ok: false as const, warning: resultError.message }
  }

  const moto2RiderSet = new Set(
    ((assignedRows ?? []) as MotoAssignmentRow[]).filter((row) => row.moto_id === moto2.id).map((row) => row.rider_id)
  )
  const resultsByKey = new Map(
    ((resultRows ?? []) as MotoResultRow[]).map((row) => [`${row.moto_id}:${row.rider_id}`, row] as const)
  )

  const moto1DnsCount = ((resultRows ?? []) as MotoResultRow[]).filter(
    (row) => row.moto_id === moto1.id && row.result_status === 'DNS'
  ).length
  const moto2DnsCount = ((resultRows ?? []) as MotoResultRow[]).filter(
    (row) => row.moto_id === moto2.id && row.result_status === 'DNS'
  ).length

  const riderCount = moto1Riders.length
  const moto2Complete = moto1Riders.every(
    (riderId) => moto2RiderSet.has(riderId) && resultsByKey.has(`${moto2.id}:${riderId}`)
  )
  if (!moto2Complete) {
    return { ok: false as const, warning: 'Moto 2 belum lengkap. Submit semua hasil Moto 2 dulu sebelum reseed gate Moto 3.' }
  }

  const orderedRiders = [...moto1Riders]
    .map((riderId) => {
      const moto1Result = resultsByKey.get(`${moto1.id}:${riderId}`)
      const moto2Result = resultsByKey.get(`${moto2.id}:${riderId}`)
      const moto1BasePoints = pointForRaceResult(moto1Result, riderCount, stageConfig ?? undefined, moto1DnsCount) ?? 9999
      const moto2Points = pointForRaceResult(moto2Result, riderCount, stageConfig ?? undefined, moto2DnsCount) ?? 9999
      const motoSpecificPenalty = motoSpecificPenaltyByRider.get(riderId) ?? 0
      const manualQualificationPenalty = motoSpecificPenalty > 0
        ? motoSpecificPenalty
        : manualQualificationPenaltyByRider.get(riderId) ?? 0
      const moto1Points = moto1BasePoints + manualQualificationPenalty
      return {
        riderId,
        totalPoints: moto1Points + moto2Points,
        moto2Points,
        moto1Points,
        moto1Status: moto1Result?.result_status,
        moto1DnfProgressPercent: moto1Result?.dnf_progress_percent,
        moto2Status: moto2Result?.result_status,
        moto2DnfProgressPercent: moto2Result?.dnf_progress_percent,
      }
    })
    .sort((a, b) => {
      if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints
      const moto2TieDiff = compareQualificationMotoTieBreak(
        { motoIndex: 2, points: a.moto2Points, resultStatus: a.moto2Status, dnfProgressPercent: a.moto2DnfProgressPercent },
        { motoIndex: 2, points: b.moto2Points, resultStatus: b.moto2Status, dnfProgressPercent: b.moto2DnfProgressPercent },
        dnfProgressEnabled
      )
      if (moto2TieDiff !== 0) return moto2TieDiff
      const moto1TieDiff = compareQualificationMotoTieBreak(
        { motoIndex: 1, points: a.moto1Points, resultStatus: a.moto1Status, dnfProgressPercent: a.moto1DnfProgressPercent },
        { motoIndex: 1, points: b.moto1Points, resultStatus: b.moto1Status, dnfProgressPercent: b.moto1DnfProgressPercent },
        dnfProgressEnabled
      )
      if (moto1TieDiff !== 0) return moto1TieDiff
      return a.riderId.localeCompare(b.riderId)
    })

  let moto3Id = moto3?.id ?? null
  let moto3Name = moto3?.moto_name ?? 'Moto 3 - Batch 1'

  if (!moto3Id) {
    const { data: lastOrderRow } = await adminClient
      .from('motos')
      .select('moto_order')
      .eq('event_id', currentMoto.event_id)
      .eq('category_id', currentMoto.category_id)
      .order('moto_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    const baseOrder = Number(lastOrderRow?.moto_order ?? 0)
    const nextOrder = Math.max(baseOrder + 1, Number((moto2.moto_order ?? 0) + 1))

    const { data: createdMoto3, error: createMotoErr } = await adminClient
      .from('motos')
      .insert({
        event_id: currentMoto.event_id,
        category_id: currentMoto.category_id,
        moto_name: 'Moto 3 - Batch 1',
        moto_order: nextOrder,
        status: 'UPCOMING',
      })
      .select('id, moto_name')
      .maybeSingle()

    if (createMotoErr || !createdMoto3?.id) {
      return { ok: false as const, warning: createMotoErr?.message ?? 'Gagal membuat Moto 3.' }
    }

    moto3Id = createdMoto3.id
    moto3Name = createdMoto3.moto_name ?? moto3Name

    const { error: insertRidersErr } = await adminClient
      .from('moto_riders')
      .insert(moto1Riders.map((riderId) => ({ moto_id: moto3Id as string, rider_id: riderId })))

    if (insertRidersErr) {
      return { ok: false as const, warning: insertRidersErr.message }
    }
  }

  if (moto3Id) {
    const { error: deleteGateError } = await adminClient
      .from('moto_gate_positions')
      .delete()
      .eq('moto_id', moto3Id)

    if (deleteGateError) {
      return { ok: false as const, warning: deleteGateError.message }
    }
  }

  const { error: insertGateError } = await adminClient
    .from('moto_gate_positions')
    .insert(
      orderedRiders.map((row, index) => ({
        moto_id: moto3Id as string,
        rider_id: row.riderId,
        gate_position: index + 1,
      }))
    )

  if (insertGateError) {
    return { ok: false as const, warning: insertGateError.message }
  }

  return {
    ok: true as const,
    moto3Id: moto3Id as string,
    moto3Name,
    orderedRiderIds: orderedRiders.map((row) => row.riderId),
  }
}
