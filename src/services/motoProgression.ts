'use server'

import { adminClient } from '../lib/auth'
import { buildCategoryBaseOrder, compareMotoWorkflowSequence } from '../lib/motoSequence'

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
const isLegacyPreparedMoto = (row: MotoQueueRow) =>
  normalizeStatus(row.status) === 'UPCOMING' && Boolean(row.checker_prep_ready_at)
const isPromotableMoto = (row: MotoQueueRow) => isReadyMoto(row) || isLegacyPreparedMoto(row)
const isNextCandidateMoto = (row: MotoQueueRow) => isReadyMoto(row) || isUpcomingMoto(row)
const isLockedMoto = (row: MotoQueueRow) => {
  const status = normalizeStatus(row.status)
  return status === 'LOCKED' || status === 'FINISHED'
}

const pickNextMotoToPromote = (rows: MotoQueueRow[], currentMoto: MotoQueueRow) => {
  const currentIndex = rows.findIndex((row) => row.id === currentMoto.id)
  if (currentIndex < 0) return { nextMoto: null, warning: 'Current moto not found in event sequence.' }

  const afterCurrent = rows.slice(currentIndex + 1)
  // Progression must follow the global Moto Sequence. Category-first fallback here
  // previously allowed a later moto in the same category to jump ahead of the queue.
  const nextMoto = afterCurrent.find(isNextCandidateMoto) ?? null

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
  const categoryBaseOrder = buildCategoryBaseOrder(rows)
  return {
    rows: [...rows].sort((a, b) => compareMotoWorkflowSequence(a, b, categoryBaseOrder)),
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

// Used only after a moto is officially locked. A submitted result remains PROVISIONAL
// until this transition is performed by the director/admin workflow.
export async function promoteNextMotoToLive(eventId: string, lockedMotoId: string) {
  const loaded = await loadWorkflowMotos(eventId)
  if (!loaded.rows) return { ok: false as const, warning: loaded.warning ?? 'Gagal memuat urutan moto.' }

  const lockedMoto = loaded.rows.find((row) => row.id === lockedMotoId)
  if (!lockedMoto) return { ok: false as const, warning: 'Moto yang dikunci tidak ditemukan.' }
  if (!isLockedMoto(lockedMoto)) {
    return { ok: true as const, skipped: true as const, warning: 'Moto berikutnya menunggu moto sebelumnya LOCKED.' }
  }

  const { nextMoto, warning } = pickNextMotoToPromote(loaded.rows, lockedMoto)
  if (warning) return { ok: false as const, warning }
  if (!nextMoto) return { ok: true as const, skipped: true as const, warning: 'Tidak ada moto berikutnya.' }

  return promoteReadyMoto(eventId, loaded.rows, nextMoto)
}

// A checker can start the opening moto, or a moto whose direct predecessor has
// already been locked. Every other prepared moto stays READY until its predecessor locks.
export async function promoteReadyMotoAfterPreviousLocked(eventId: string, readyMotoId: string) {
  const loaded = await loadWorkflowMotos(eventId)
  if (!loaded.rows) return { ok: false as const, warning: loaded.warning ?? 'Gagal memuat urutan moto.' }

  const readyIndex = loaded.rows.findIndex((row) => row.id === readyMotoId)
  if (readyIndex < 0) return { ok: false as const, warning: 'Moto READY tidak ditemukan.' }

  const readyMoto = loaded.rows[readyIndex]
  if (!isPromotableMoto(readyMoto)) {
    return { ok: true as const, skipped: true as const, warning: 'Moto belum READY.' }
  }

  if (readyIndex === 0) {
    return promoteReadyMoto(eventId, loaded.rows, readyMoto)
  }

  const previousMoto = loaded.rows[readyIndex - 1]
  if (!isLockedMoto(previousMoto)) {
    return { ok: true as const, skipped: true as const, warning: 'Moto ini menunggu moto sebelumnya LOCKED.' }
  }

  const { nextMoto, warning } = pickNextMotoToPromote(loaded.rows, previousMoto)
  if (warning) return { ok: false as const, warning }
  if (nextMoto?.id !== readyMotoId) {
    return { ok: true as const, skipped: true as const, warning: 'Moto ini bukan urutan start berikutnya.' }
  }

  return promoteReadyMoto(eventId, loaded.rows, readyMoto)
}
