'use server'

import { adminClient } from '../lib/auth'

type MotoQueueRow = {
  id: string
  category_id: string
  moto_order: number
  status: string | null
}

const normalizeStatus = (status?: string | null) => (status ?? '').toUpperCase()

export async function promoteNextMotoToLive(eventId: string, currentMotoId: string) {
  const { data: currentMoto, error: currentError } = await adminClient
    .from('motos')
    .select('id, category_id, moto_order, status')
    .eq('id', currentMotoId)
    .maybeSingle()

  if (currentError || !currentMoto) {
    return { ok: false as const, warning: currentError?.message ?? 'Current moto not found.' }
  }

  const { data: eventMotos, error: eventError } = await adminClient
    .from('motos')
    .select('id, category_id, moto_order, status')
    .eq('event_id', eventId)
    .order('moto_order', { ascending: true })

  if (eventError) {
    return { ok: false as const, warning: eventError.message }
  }

  const rows = (eventMotos ?? []) as MotoQueueRow[]
  const hasOtherLiveMoto = rows.some(
    (row) => row.id !== currentMotoId && normalizeStatus(row.status) === 'LIVE'
  )

  if (hasOtherLiveMoto) {
    return { ok: true as const, skipped: true as const }
  }

  const nextMoto = rows.find(
    (row) =>
      row.category_id === currentMoto.category_id &&
      row.moto_order > (currentMoto.moto_order ?? 0) &&
      normalizeStatus(row.status) === 'UPCOMING'
  )

  if (!nextMoto) {
    return { ok: true as const, skipped: true as const }
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
