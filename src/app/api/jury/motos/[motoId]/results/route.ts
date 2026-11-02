import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { assertMotoEditable, assertMotoNotUnderProtest } from '../../../../../../lib/motoLock'
import { reseedSingleBatchMoto3FromMoto } from '../../../../../../services/moto3Reseed'
import { createSingleBatchMoto2FromMoto1Results } from '../../../../../../services/singleBatchFinalProgress'
import { promoteNextMotoToLive } from '../../../../../../services/motoProgression'
import { upsertRiderParticipationStatuses } from '../../../../../../services/riderParticipationStatus'
import { syncAdvancedRaceProgressAfterLockedStage } from '../../../../../../services/advancedRaceAuto'
import { requireJury } from '../../../../../../services/juryAuth'
import { broadcastRaceState } from '../../../../../../lib/broadcastRaceState'

const isLockedMoto = async (motoId: string) => {
  const { data } = await adminClient
    .from('moto_locks')
    .select('moto_id, is_locked')
    .eq('moto_id', motoId)
    .eq('is_locked', true)
    .maybeSingle()
  return !!data
}

const needsMoto3Reseed = (motoName?: string | null) => /^moto\s*2\s*-\s*batch\s*1$/i.test(motoName ?? '')
const isMoto2Batch1 = (motoName?: string | null) => /^moto\s*2\s*-\s*batch\s*1$/i.test(String(motoName ?? '').trim())

const hasPendingApprovals = async (eventId: string, riderIds: string[]) => {
  if (!riderIds.length) return false

  const { data: pendingStatuses, error: statusError } = await adminClient
    .from('rider_status_updates')
    .select('id')
    .eq('event_id', eventId)
    .eq('approval_status', 'PENDING')
    .in('rider_id', riderIds)
  if (statusError) throw new Error(statusError.message)
  if (pendingStatuses?.length) return true

  const { data: penalties, error: penaltyError } = await adminClient
    .from('rider_penalties')
    .select('id')
    .eq('event_id', eventId)
    .in('rider_id', riderIds)
  if (penaltyError) throw new Error(penaltyError.message)
  const penaltyIds = (penalties ?? []).map((row) => row.id)
  if (!penaltyIds.length) return false

  const { data: pendingPenalties, error: approvalError } = await adminClient
    .from('rider_penalty_approvals')
    .select('id')
    .eq('approval_status', 'PENDING')
    .in('penalty_id', penaltyIds)
  if (approvalError) throw new Error(approvalError.message)
  return Boolean(pendingPenalties?.length)
}

type ExistingResult = {
  rider_id: string
  finish_order: number | null
  result_status: string | null
  dnf_progress_percent: number | null
}

export async function GET(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const { data: moto } = await adminClient.from('motos').select('event_id').eq('id', motoId).maybeSingle()
  const auth = await requireJury(req, ['FINISHER', 'CHECKER', 'RACE_DIRECTOR', 'ADMIN', 'super_admin'], moto?.event_id ?? null)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { data, error } = await adminClient
    .from('results')
    .select('rider_id, finish_order, result_status, dnf_progress_percent')
    .eq('moto_id', motoId)
    .order('finish_order', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const { data: moto, error: motoError } = await adminClient
    .from('motos')
    .select('id, event_id, category_id, moto_name, status')
    .eq('id', motoId)
    .maybeSingle()
  const auth = await requireJury(req, ['FINISHER', 'CHECKER', 'RACE_DIRECTOR', 'ADMIN', 'super_admin'], moto?.event_id ?? null)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.role === 'RACE_DIRECTOR') {
    return NextResponse.json({ error: 'Read-only for RACE_DIRECTOR' }, { status: 403 })
  }
  if (motoError || !moto?.event_id) {
    return NextResponse.json({ error: 'Moto not found' }, { status: 404 })
  }

  const body = await req.json()
  const { results } = body ?? {}

  if (!Array.isArray(results) || results.length === 0) {
    return NextResponse.json({ error: 'results required' }, { status: 400 })
  }

  const [isLocked, flagsResult, assignedResult, existingResultsResult, activeStatusesResult] = await Promise.all([
    isLockedMoto(motoId),
    adminClient
      .from('event_feature_flags')
      .select('dnf_progress_enabled')
      .eq('event_id', moto.event_id)
      .maybeSingle(),
    adminClient
      .from('moto_riders')
      .select('rider_id')
      .eq('moto_id', motoId),
    adminClient
      .from('results')
      .select('rider_id, finish_order, result_status, dnf_progress_percent')
      .eq('moto_id', motoId),
    adminClient
      .from('rider_participation_status')
      .select('rider_id, participation_status')
      .eq('event_id', moto.event_id)
      .eq('moto_id', motoId),
  ])

  if (isLocked) {
    try {
      assertMotoEditable('locked')
    } catch (err: unknown) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Moto locked.' }, { status: 409 })
    }
  }
  try {
    assertMotoNotUnderProtest(moto.status)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Moto under protest review.' }, { status: 409 })
  }

  const payload = (results as Array<{ rider_id: string; finish_order?: number | null; result_status?: string; dnf_progress_percent?: number | null }>).map((row) => ({
    event_id: moto.event_id,
    moto_id: motoId,
    rider_id: row.rider_id,
    finish_order: row.finish_order ?? null,
    result_status: row.result_status ?? 'FINISH',
    dnf_progress_percent: row.result_status === 'DNF' && row.dnf_progress_percent != null ? Number(row.dnf_progress_percent) : null,
  }))

  if (flagsResult.error) return NextResponse.json({ error: flagsResult.error.message }, { status: 400 })
  const flags = flagsResult.data
  if (flags?.dnf_progress_enabled) {
    const invalidDnf = payload.find(
      (row) =>
        row.result_status === 'DNF' &&
        (!Number.isFinite(row.dnf_progress_percent) || Number(row.dnf_progress_percent) < 0 || Number(row.dnf_progress_percent) > 100)
    )
    if (invalidDnf) return NextResponse.json({ error: 'DNF progress wajib diisi antara 0-100%.' }, { status: 400 })
  }

  const { data: assigned, error: assignedError } = assignedResult

  if (assignedError) {
    return NextResponse.json({ error: assignedError.message }, { status: 400 })
  }

  if (!assigned || assigned.length === 0) {
    return NextResponse.json({ error: 'No riders assigned to moto' }, { status: 400 })
  }

  const assignedSet = new Set(assigned.map((r) => r.rider_id))
  if (payload.some((row) => !assignedSet.has(row.rider_id))) {
    return NextResponse.json({ error: 'Rider not assigned to moto' }, { status: 400 })
  }

  // A pre-race DQ is a Race Director decision. Reject stale or forged
  // Finisher submissions so they cannot replace the DQ result with FINISH/DNF.
  const { data: existingResults, error: existingResultsError } = existingResultsResult
  if (existingResultsError) return NextResponse.json({ error: existingResultsError.message }, { status: 400 })
  const existingResultRows = (existingResults ?? []) as ExistingResult[]
  const dqRiderIds = new Set(existingResultRows.filter((row) => row.result_status === 'DQ').map((row) => row.rider_id))
  if (payload.some((row) => dqRiderIds.has(row.rider_id))) {
    return NextResponse.json({ error: 'Rider DQ tidak dapat diinput hasil race. Batalkan DQ melalui Race Director bila diperlukan.' }, { status: 409 })
  }

  if (auth.role === 'CHECKER') {
    const invalid = payload.some(
      (row) => row.result_status !== 'DNS' || row.finish_order !== null
    )
    if (invalid) {
      return NextResponse.json({ error: 'CHECKER can only set DNS with no finish_order' }, { status: 403 })
    }
  }

  const finishRanks = payload
    .filter((row) => row.result_status === 'FINISH' && row.finish_order !== null && row.finish_order !== undefined)
    .map((row) => row.finish_order as number)

  const unique = new Set(finishRanks)
  if (unique.size !== finishRanks.length) {
    return NextResponse.json({ error: 'Duplicate finish_order in this moto' }, { status: 400 })
  }

  const existingResultsByRider = new Map(existingResultRows.map((row) => [row.rider_id, row]))
  const changedResults = payload.filter((row) => {
    const existing = existingResultsByRider.get(row.rider_id)
    return (
      !existing ||
      existing.finish_order !== row.finish_order ||
      existing.result_status !== row.result_status ||
      existing.dnf_progress_percent !== row.dnf_progress_percent
    )
  })
  if (changedResults.length > 0) {
    const { error } = await adminClient.from('results').upsert(changedResults, { onConflict: 'moto_id,rider_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const activeRows = payload
    .filter((row) => row.result_status === 'FINISH' || row.result_status === 'DNF')
    .map((row) => ({
      event_id: moto.event_id,
      moto_id: motoId,
      rider_id: row.rider_id,
      participation_status: 'ACTIVE',
      registration_order: row.finish_order ?? 0,
    }))
  if (activeStatusesResult.error) return NextResponse.json({ error: activeStatusesResult.error.message }, { status: 400 })
  const activeStatusByRider = new Map(
    (activeStatusesResult.data ?? []).map((row) => [row.rider_id, row.participation_status])
  )
  const changedActiveRows = activeRows.filter(
    (row) => activeStatusByRider.get(row.rider_id) !== 'ACTIVE'
  )
  const [activeStatusResult, motoUpdateResult] = await Promise.all([
    changedActiveRows.length > 0 ? upsertRiderParticipationStatuses(changedActiveRows) : Promise.resolve({ error: null }),
    adminClient
      .from('motos')
      .update({ status: 'PROVISIONAL', provisional_at: new Date().toISOString() })
      .eq('id', motoId),
  ])
  if (activeStatusResult.error) return NextResponse.json({ error: activeStatusResult.error.message }, { status: 400 })
  if (motoUpdateResult.error) return NextResponse.json({ error: motoUpdateResult.error.message }, { status: 400 })

  const deferredMoto2 = /^moto\s*1\s*-\s*batch\s*1$/i.test(String(moto.moto_name ?? '').trim())
    ? await createSingleBatchMoto2FromMoto1Results(motoId)
    : { ok: true as const, skipped: true as const }
  if (!deferredMoto2.ok) {
    return NextResponse.json(
      { error: deferredMoto2.warning ?? 'Gagal membuat Moto 2 otomatis. Moto tetap menunggu pemeriksaan.' },
      { status: 500 }
    )
  }
  if (deferredMoto2.skipped && deferredMoto2.warning) {
    return NextResponse.json({ error: deferredMoto2.warning }, { status: 409 })
  }

  const { data: stageConfig, error: stageConfigError } = isMoto2Batch1(moto.moto_name)
    ? await adminClient
        .from('race_stage_config')
        .select('single_batch_two_moto_final_enabled')
        .eq('event_id', moto.event_id)
        .eq('category_id', moto.category_id)
        .maybeSingle()
    : { data: null, error: null }
  if (stageConfigError) return NextResponse.json({ error: stageConfigError.message }, { status: 500 })

  let autoLockedForFinal = false
  let stageProgress: Awaited<ReturnType<typeof syncAdvancedRaceProgressAfterLockedStage>> | null = null
  if (stageConfig?.single_batch_two_moto_final_enabled === true && isMoto2Batch1(moto.moto_name)) {
    const { data: latestResults, error: latestResultsError } = await adminClient
      .from('results')
      .select('rider_id')
      .eq('moto_id', motoId)
    if (latestResultsError) return NextResponse.json({ error: latestResultsError.message }, { status: 500 })

    const completedRiders = new Set((latestResults ?? []).map((row) => row.rider_id))
    const allRidersHaveResults = assigned.every((row) => completedRiders.has(row.rider_id))
    if (allRidersHaveResults) {
      try {
        if (await hasPendingApprovals(moto.event_id, assigned.map((row) => row.rider_id))) {
          return NextResponse.json({
            ok: true,
            auto_locked: false,
            warning: 'Hasil tersimpan, tetapi Moto 2 tetap provisional karena masih ada approval yang menunggu.',
          })
        }
      } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : 'Gagal memeriksa approval.' }, { status: 500 })
      }

      // Remove only the incompatible, unraced Moto 3 that the old generator
      // may have left behind for this two-moto-final mode.
      const { data: staleMoto3, error: staleMotoError } = await adminClient
        .from('motos')
        .select('id, status')
        .eq('event_id', moto.event_id)
        .eq('category_id', moto.category_id)
        .ilike('moto_name', 'Moto 3 - Batch 1')
      if (staleMotoError) return NextResponse.json({ error: staleMotoError.message }, { status: 500 })
      for (const stale of staleMoto3 ?? []) {
        if (String(stale.status ?? '').toUpperCase() !== 'UPCOMING') {
          return NextResponse.json({
            ok: true,
            auto_locked: false,
            warning: 'Moto 2 selesai, tetapi ada Moto 3 yang sudah berjalan. Hapus atau selesaikan Moto 3 tersebut sebelum membuat Final.',
          })
        }
        const { data: staleResults, error: staleResultsError } = await adminClient
          .from('results')
          .select('id')
          .eq('moto_id', stale.id)
          .limit(1)
        if (staleResultsError) return NextResponse.json({ error: staleResultsError.message }, { status: 500 })
        if (staleResults?.length) {
          return NextResponse.json({
            ok: true,
            auto_locked: false,
            warning: 'Moto 2 selesai, tetapi Moto 3 sudah memiliki hasil. Periksa dan hapus Moto 3 sebelum membuat Final.',
          })
        }
        const { error: deleteStaleMotoError } = await adminClient.from('motos').delete().eq('id', stale.id)
        if (deleteStaleMotoError) return NextResponse.json({ error: deleteStaleMotoError.message }, { status: 500 })
      }

      const lockedAt = new Date().toISOString()
      const { error: autoLockError } = await adminClient
        .from('motos')
        .update({ status: 'LOCKED' })
        .eq('id', motoId)
      if (autoLockError) return NextResponse.json({ error: autoLockError.message }, { status: 500 })
      const { error: motoLockError } = await adminClient
        .from('moto_locks')
        .upsert({
          moto_id: motoId,
          event_id: moto.event_id,
          is_locked: true,
          locked_by: auth.user.id,
          locked_at: lockedAt,
        }, { onConflict: 'moto_id' })
      if (motoLockError) return NextResponse.json({ error: motoLockError.message }, { status: 500 })

      autoLockedForFinal = true
      stageProgress = await syncAdvancedRaceProgressAfterLockedStage(moto.event_id, moto.category_id, moto.moto_name)
    }
  }

  const moto3Reseed = needsMoto3Reseed(moto.moto_name)
    ? await reseedSingleBatchMoto3FromMoto(motoId)
    : { ok: true as const, warning: null }
  const nextMoto = await promoteNextMotoToLive(moto.event_id, motoId)
  void broadcastRaceState(moto.event_id, motoId, moto.category_id)

  return NextResponse.json({
    ok: true,
    next_moto: nextMoto,
    auto_locked: autoLockedForFinal,
    stage_progress: stageProgress,
    warning: moto3Reseed.ok ? null : moto3Reseed.warning ?? 'Moto 3 gate reseed skipped.',
  })
}


export async function DELETE(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const { data: scopedMoto } = await adminClient.from('motos').select('event_id, category_id').eq('id', motoId).maybeSingle()
  const auth = await requireJury(req, ['FINISHER', 'RACE_DIRECTOR', 'ADMIN', 'super_admin'], scopedMoto?.event_id ?? null)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (await isLockedMoto(motoId) && auth.role !== 'RACE_DIRECTOR' && auth.role !== 'SUPER_ADMIN') {
    try {
      assertMotoEditable('locked')
    } catch (err: unknown) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Moto locked.' }, { status: 409 })
    }
  }
  const { data: statusRow, error: statusErr } = await adminClient
    .from('motos')
    .select('status')
    .eq('id', motoId)
    .maybeSingle()
  if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 400 })
  try {
    assertMotoNotUnderProtest((statusRow as { status?: string | null })?.status ?? null)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Moto under protest review.' }, { status: 409 })
  }

  const { error } = await adminClient.from('results').delete().eq('moto_id', motoId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await adminClient
    .from('motos')
    .update({ status: 'LIVE', provisional_at: null })
    .eq('id', motoId)

  void broadcastRaceState(scopedMoto?.event_id ?? '', motoId, scopedMoto?.category_id)
  return NextResponse.json({ ok: true })
}
