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
const isLegacyPreparedMoto = (row: MotoQueueRow) =>
  normalizeStatus(row.status) === 'UPCOMING' && Boolean(row.checker_prep_ready_at)
const isPromotableMoto = (row: MotoQueueRow) => isReadyMoto(row) || isLegacyPreparedMoto(row)
const isNextCandidateMoto = (row: MotoQueueRow) => isReadyMoto(row) || isUpcomingMoto(row)

const pickNextMotoToPromote = (rows: MotoQueueRow[], currentMoto: MotoQueueRow) => {
  const currentIndex = rows.findIndex((row) => row.id === currentMoto.id)
  if (currentIndex < 0) return { nextMoto: null, warning: 'Current moto not found in event sequence.' }

  const afterCurrent = rows.slice(currentIndex + 1)
  const sameCategory = (row: MotoQueueRow) => row.category_id === currentMoto.category_id
  const nextMoto =
    afterCurrent.find((row) => sameCategory(row) && isNextCandidateMoto(row)) ??
    rows.find((row) => sameCategory(row) && isNextCandidateMoto(row)) ??
    null

  return { nextMoto, warning: null }
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

  const { error: updateError } = await adminClient
    .from('motos')
    .update({ status: 'LIVE' })
    .eq('id', nextMoto.id)

  if (updateError) {
    return { ok: false as const, warning: updateError.message }
  }

  return { ok: true as const, nextMotoId: nextMoto.id }
}
