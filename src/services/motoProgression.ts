'use server'

import { adminClient } from '../lib/auth'
import { compareMotoSequence } from '../lib/motoSequence'
import { syncAdvancedRaceProgressAfterLockedStage } from './advancedRaceAuto'

type MotoQueueRow = {
  id: string
  category_id: string
  moto_name?: string | null
  moto_order: number
  status: string | null
  checker_prep_ready_at?: string | null
}

const normalizeStatus = (status?: string | null) => (status ?? '').toUpperCase()
const isUpcomingMoto = (row: MotoQueueRow) => normalizeStatus(row.status) === 'UPCOMING'
const isReadyMoto = (row: MotoQueueRow) => normalizeStatus(row.status) === 'READY'
const isLiveMoto = (row: MotoQueueRow) => normalizeStatus(row.status) === 'LIVE'
const isProvisionalMoto = (row: MotoQueueRow) => normalizeStatus(row.status) === 'PROVISIONAL'
const isLegacyPreparedMoto = (row: MotoQueueRow) =>
  normalizeStatus(row.status) === 'UPCOMING' && Boolean(row.checker_prep_ready_at)
const isPromotableMoto = (row: MotoQueueRow) => isReadyMoto(row) || isLegacyPreparedMoto(row)
const isNextCandidateMoto = (row: MotoQueueRow) => isReadyMoto(row) || isUpcomingMoto(row)
const pickNextMotoToPromote = (rows: MotoQueueRow[], currentMoto: MotoQueueRow) => {
  const currentIndex = rows.findIndex((row) => row.id === currentMoto.id)
  if (currentIndex < 0) return { nextMoto: null, warning: 'Current moto not found in event sequence.' }

  const afterCurrent = rows.slice(currentIndex + 1)
  const nextMoto =
    afterCurrent.find(isNextCandidateMoto) ??
    rows.find(isNextCandidateMoto) ??
    null

  return { nextMoto, warning: null }
}

const loadWorkflowMotos = async (eventId: string) => {
  const { data: eventMotos, error } = await adminClient
    .from('motos')
    .select('id, category_id, moto_name, moto_order, status, checker_prep_ready_at')
    .eq('event_id', eventId)
    .order('moto_order', { ascending: true })

  if (error) return { rows: null, warning: error.message }

  const rows = (eventMotos ?? []) as MotoQueueRow[]
  return {
    rows: [...rows].sort(compareMotoSequence),
    warning: null,
  }
}

const promoteReadyMoto = async (eventId: string, rows: MotoQueueRow[], moto: MotoQueueRow) => {
  if (!isPromotableMoto(moto)) {
    return { ok: true as const, skipped: true as const, nextMotoId: moto.id, warning: 'Next moto belum Prep Selesai dari checker.' }
  }

  const existingLive = rows.find((row) => row.id !== moto.id && isLiveMoto(row))
  if (existingLive) {
    return {
      ok: true as const,
      skipped: true as const,
      nextMotoId: moto.id,
      warning: `Auto-live menunggu karena ${existingLive.moto_name ?? 'moto lain'} masih LIVE.`,
    }
  }

  const { data: promotedMoto, error: updateError } = await adminClient
    .from('motos')
    .update({ status: 'LIVE', provisional_at: null })
    .eq('id', moto.id)
    .eq('event_id', eventId)
    .in('status', ['READY', 'UPCOMING'])
    .select('id')
    .maybeSingle()

  if (updateError) return { ok: false as const, warning: updateError.message }
  if (!promotedMoto) {
    return { ok: true as const, skipped: true as const, nextMotoId: moto.id, warning: 'Status moto berubah sebelum auto-live.' }
  }

  return { ok: true as const, nextMotoId: moto.id }
}

const autoLockProvisionalMoto = async (eventId: string, motoId: string) => {
  const lockedAt = new Date().toISOString()
  const { data: lockedMoto, error: updateError } = await adminClient
    .from('motos')
    .update({ status: 'LOCKED' })
    .eq('id', motoId)
    .eq('event_id', eventId)
    .eq('status', 'PROVISIONAL')
    .select('id, category_id, moto_name')
    .maybeSingle()

  if (updateError) return { ok: false as const, warning: updateError.message }
  if (!lockedMoto) return { ok: true as const, skipped: true as const, warning: 'Moto is not PROVISIONAL anymore.' }

  const { error: lockError } = await adminClient.from('moto_locks').upsert(
    [
      {
        moto_id: motoId,
        event_id: eventId,
        is_locked: true,
        locked_by: 'SYSTEM',
        locked_at: lockedAt,
        reason: 'AUTO_LOCK_AFTER_NEXT_LIVE',
      },
    ],
    { onConflict: 'moto_id' }
  )
  if (lockError) return { ok: false as const, warning: lockError.message }

  const stageProgress = lockedMoto.category_id
    ? await syncAdvancedRaceProgressAfterLockedStage(eventId, lockedMoto.category_id, lockedMoto.moto_name)
    : { ok: true, skipped: true }
  return { ok: true as const, motoId, stage_progress: stageProgress }
}

// Finisher submission makes the current moto PROVISIONAL. When its next moto is
// READY, promote it to LIVE immediately and lock the submitted moto as one atomic flow.
export async function promoteNextMotoToLive(eventId: string, currentMotoId: string) {
  const loaded = await loadWorkflowMotos(eventId)
  if (!loaded.rows) return { ok: false as const, warning: loaded.warning ?? 'Gagal memuat urutan moto.' }

  const currentMoto = loaded.rows.find((row) => row.id === currentMotoId)
  if (!currentMoto) return { ok: false as const, warning: 'Moto saat ini tidak ditemukan.' }

  const currentIndex = loaded.rows.findIndex((row) => row.id === currentMotoId)
  const hasNextMotoInCategory = loaded.rows
    .slice(currentIndex + 1)
    .some((row) => row.category_id === currentMoto.category_id && isNextCandidateMoto(row))

  // Another category must not keep the last moto in this category provisional.
  if (isProvisionalMoto(currentMoto) && !hasNextMotoInCategory) {
    const autoLock = await autoLockProvisionalMoto(eventId, currentMotoId)
    if (!autoLock.ok) {
      return { ok: false as const, skipped: true as const, warning: autoLock.warning, auto_lock: autoLock }
    }

    const refreshed = await loadWorkflowMotos(eventId)
    if (!refreshed.rows) {
      return { ok: false as const, skipped: true as const, warning: refreshed.warning ?? 'Gagal memuat urutan moto.', auto_lock: autoLock }
    }
    const refreshedCurrent = refreshed.rows.find((row) => row.id === currentMotoId)
    if (!refreshedCurrent) {
      return { ok: false as const, skipped: true as const, warning: 'Moto saat ini tidak ditemukan setelah auto-lock.', auto_lock: autoLock }
    }
    const { nextMoto, warning } = pickNextMotoToPromote(refreshed.rows, refreshedCurrent)
    if (warning) return { ok: false as const, skipped: true as const, warning, auto_lock: autoLock }
    if (!nextMoto) {
      return {
        ok: true as const,
        skipped: true as const,
        warning: autoLock.warning ?? 'Moto terakhir kategori dikunci.',
        auto_lock: autoLock,
      }
    }

    const promotion = await promoteReadyMoto(eventId, refreshed.rows, nextMoto)
    return {
      ...promotion,
      auto_lock: autoLock,
    }
  }

  const { nextMoto, warning } = pickNextMotoToPromote(loaded.rows, currentMoto)
  if (warning) return { ok: false as const, warning }
  if (!nextMoto) return { ok: true as const, skipped: true as const, warning: 'Tidak ada moto berikutnya.' }

  const promotion = await promoteReadyMoto(eventId, loaded.rows, nextMoto)
  if (!promotion.ok || promotion.skipped || !isProvisionalMoto(currentMoto)) return promotion

  const autoLock = await autoLockProvisionalMoto(eventId, currentMotoId)
  return { ...promotion, auto_lock: autoLock }
}

// If Checker finishes preparation after the previous moto has become PROVISIONAL,
// this completes the same auto-live then auto-lock transition.
export async function promoteReadyMotoAfterPreviousProvisional(eventId: string, readyMotoId: string) {
  const loaded = await loadWorkflowMotos(eventId)
  if (!loaded.rows) return { ok: false as const, warning: loaded.warning ?? 'Gagal memuat urutan moto.' }

  const readyIndex = loaded.rows.findIndex((row) => row.id === readyMotoId)
  if (readyIndex < 0) return { ok: false as const, warning: 'Moto READY tidak ditemukan.' }
  const readyMoto = loaded.rows[readyIndex]
  if (!isPromotableMoto(readyMoto)) {
    return { ok: true as const, skipped: true as const, warning: 'Moto belum READY.' }
  }

  const beforeReady = loaded.rows.slice(0, readyIndex).reverse()
  const sameCategory = (row: MotoQueueRow) => row.category_id === readyMoto.category_id
  const previousProvisional =
    beforeReady.find((row) => sameCategory(row) && isProvisionalMoto(row)) ??
    beforeReady.find(isProvisionalMoto) ??
    null

  if (previousProvisional) {
    const { nextMoto } = pickNextMotoToPromote(loaded.rows, previousProvisional)
    if (nextMoto?.id === readyMotoId) return promoteNextMotoToLive(eventId, previousProvisional.id)
  }

  // The first prepared moto can still be opened by Checker. For subsequent motos,
  // a LIVE moto elsewhere remains the guard against two motos running together.
  return promoteReadyMoto(eventId, loaded.rows, readyMoto)
}
