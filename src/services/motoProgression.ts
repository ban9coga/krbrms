'use server'

import { adminClient } from '../lib/auth'
import { compareMotoSequence } from '../lib/motoSequence'

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
const isProvisionalMoto = (row: MotoQueueRow) => normalizeStatus(row.status) === 'PROVISIONAL'

const pickNextMotoToPromote = (rows: MotoQueueRow[], currentMoto: MotoQueueRow) => {
  const currentIndex = rows.findIndex((row) => row.id === currentMoto.id)
  if (currentIndex < 0) return { nextMoto: null, warning: 'Current moto not found in event sequence.' }

  const afterCurrent = rows.slice(currentIndex + 1)
  const sameCategory = (row: MotoQueueRow) => row.category_id === currentMoto.category_id
  const nextMoto =
    afterCurrent.find((row) => sameCategory(row) && isNextCandidateMoto(row)) ??
    rows.find((row) => sameCategory(row) && isNextCandidateMoto(row)) ??
    afterCurrent.find((row) => isNextCandidateMoto(row)) ??
    null

  return { nextMoto, warning: null }
}

export async function autoLockProvisionalMoto(eventId: string, motoId: string, reason = 'AUTO_LOCK_AFTER_NEXT_LIVE') {
  const lockedAt = new Date().toISOString()
  const { data: lockedMoto, error: updateError } = await adminClient
    .from('motos')
    .update({ status: 'LOCKED' })
    .eq('id', motoId)
    .eq('event_id', eventId)
    .eq('status', 'PROVISIONAL')
    .select('id')
    .maybeSingle()

  if (updateError) {
    return { ok: false as const, warning: updateError.message }
  }

  if (!lockedMoto) {
    return { ok: true as const, skipped: true as const, warning: 'Moto is not PROVISIONAL anymore.' }
  }

  const { error: lockError } = await adminClient
    .from('moto_locks')
    .upsert(
      [
        {
          moto_id: motoId,
          event_id: eventId,
          is_locked: true,
          locked_by: 'SYSTEM',
          locked_at: lockedAt,
          reason,
        },
      ],
      { onConflict: 'moto_id' }
    )

  if (lockError) {
    return { ok: false as const, warning: lockError.message }
  }

  return { ok: true as const, motoId }
}

export async function promoteNextMotoToLive(eventId: string, currentMotoId: string) {
  const { data: currentMoto, error: currentError } = await adminClient
    .from('motos')
    .select('id, category_id, moto_name, moto_order, status')
    .eq('id', currentMotoId)
    .maybeSingle()

  if (currentError || !currentMoto) {
    return { ok: false as const, warning: currentError?.message ?? 'Current moto not found.' }
  }

  const { data: eventMotos, error: eventError } = await adminClient
    .from('motos')
    .select('id, category_id, moto_name, moto_order, status, checker_prep_ready_at')
    .eq('event_id', eventId)
    .order('moto_order', { ascending: true })

  if (eventError) {
    return { ok: false as const, warning: eventError.message }
  }

  const rows = (eventMotos ?? []) as MotoQueueRow[]
  const sortedEventMotos = [...rows].sort(compareMotoSequence)
  const { nextMoto, warning } = pickNextMotoToPromote(sortedEventMotos, currentMoto)

  if (warning) {
    return { ok: false as const, warning }
  }
  if (!nextMoto) {
    return { ok: true as const, skipped: true as const }
  }
  if (!isPromotableMoto(nextMoto)) {
    return {
      ok: true as const,
      skipped: true as const,
      nextMotoId: nextMoto.id,
      warning: 'Next moto belum Prep Selesai dari checker.',
    }
  }
  const existingLive = sortedEventMotos.find((row) => row.id !== nextMoto.id && isLiveMoto(row))
  if (existingLive) {
    return {
      ok: true as const,
      skipped: true as const,
      nextMotoId: nextMoto.id,
      warning: `Auto-live skipped because ${existingLive.moto_name ?? 'another moto'} is still LIVE.`,
    }
  }

  const { data: promotedMoto, error: updateError } = await adminClient
    .from('motos')
    .update({ status: 'LIVE', provisional_at: null })
    .eq('id', nextMoto.id)
    .in('status', ['READY', 'UPCOMING'])
    .select('id')
    .maybeSingle()

  if (updateError) {
    return { ok: false as const, warning: updateError.message }
  }
  if (!promotedMoto) {
    return {
      ok: true as const,
      skipped: true as const,
      nextMotoId: nextMoto.id,
      warning: 'Next moto status changed before auto-live.',
    }
  }

  const autoLockResult = await autoLockProvisionalMoto(eventId, currentMotoId)

  return { ok: true as const, nextMotoId: nextMoto.id, auto_lock: autoLockResult }
}

export async function autoLockPreviousProvisionalForLiveMoto(eventId: string, liveMotoId: string) {
  const { data: eventMotos, error: eventError } = await adminClient
    .from('motos')
    .select('id, category_id, moto_name, moto_order, status, checker_prep_ready_at')
    .eq('event_id', eventId)
    .order('moto_order', { ascending: true })

  if (eventError) {
    return { ok: false as const, warning: eventError.message }
  }

  const rows = ((eventMotos ?? []) as MotoQueueRow[]).sort(compareMotoSequence)
  const liveMoto = rows.find((row) => row.id === liveMotoId)
  if (!liveMoto || !isLiveMoto(liveMoto)) {
    return { ok: true as const, skipped: true as const, warning: 'Moto is not LIVE.' }
  }

  const liveIndex = rows.findIndex((row) => row.id === liveMotoId)
  const beforeLive = liveIndex >= 0 ? rows.slice(0, liveIndex).reverse() : []
  const previousProvisional =
    beforeLive.find((row) => row.category_id === liveMoto.category_id && isProvisionalMoto(row)) ?? null

  if (!previousProvisional) {
    return { ok: true as const, skipped: true as const, warning: 'No previous PROVISIONAL moto found.' }
  }

  return autoLockProvisionalMoto(eventId, previousProvisional.id)
}

export async function promoteReadyMotoAfterPreviousProvisional(eventId: string, readyMotoId: string) {
  const { data: eventMotos, error: eventError } = await adminClient
    .from('motos')
    .select('id, category_id, moto_name, moto_order, status, checker_prep_ready_at')
    .eq('event_id', eventId)
    .order('moto_order', { ascending: true })

  if (eventError) {
    return { ok: false as const, warning: eventError.message }
  }

  const rows = ((eventMotos ?? []) as MotoQueueRow[]).sort(compareMotoSequence)
  const readyMoto = rows.find((row) => row.id === readyMotoId)
  if (!readyMoto || !isPromotableMoto(readyMoto)) {
    return { ok: true as const, skipped: true as const, warning: 'Moto is not READY.' }
  }

  const readyIndex = rows.findIndex((row) => row.id === readyMotoId)
  const beforeReady = readyIndex >= 0 ? rows.slice(0, readyIndex).reverse() : []
  const sameCategory = (row: MotoQueueRow) => row.category_id === readyMoto.category_id
  const previousProvisional =
    beforeReady.find((row) => sameCategory(row) && isProvisionalMoto(row)) ??
    beforeReady.find((row) => isProvisionalMoto(row)) ??
    null

  if (!previousProvisional) {
    return { ok: true as const, skipped: true as const, warning: 'No previous PROVISIONAL moto waiting.' }
  }

  const { nextMoto } = pickNextMotoToPromote(rows, previousProvisional)
  if (nextMoto?.id !== readyMoto.id) {
    return { ok: true as const, skipped: true as const, warning: 'READY moto is not the next moto in sequence.' }
  }

  return promoteNextMotoToLive(eventId, previousProvisional.id)
}
