'use server'

import { adminClient } from '../lib/auth'
import { compareMotoSequence } from '../lib/motoSequence'

type MotoQueueRow = {
  id: string
  category_id: string
  moto_name?: string | null
  moto_order: number
  status: string | null
}

type CategoryOrderRow = {
  id: string
  sequence_order?: number | null
  year_min?: number | null
  year_max?: number | null
  gender?: 'BOY' | 'GIRL' | 'MIX' | null
}

const normalizeStatus = (status?: string | null) => (status ?? '').toUpperCase()

const compareCategoryOrder = (a: CategoryOrderRow, b: CategoryOrderRow) => {
  const aSequence = typeof a.sequence_order === 'number' ? a.sequence_order : null
  const bSequence = typeof b.sequence_order === 'number' ? b.sequence_order : null
  if (aSequence !== null || bSequence !== null) {
    return (aSequence ?? Number.MAX_SAFE_INTEGER) - (bSequence ?? Number.MAX_SAFE_INTEGER)
  }

  const ayMax = typeof a.year_max === 'number' ? a.year_max : typeof a.year_min === 'number' ? a.year_min : 0
  const byMax = typeof b.year_max === 'number' ? b.year_max : typeof b.year_min === 'number' ? b.year_min : 0
  if (byMax !== ayMax) return byMax - ayMax

  const ayMin = typeof a.year_min === 'number' ? a.year_min : ayMax
  const byMin = typeof b.year_min === 'number' ? b.year_min : byMax
  if (byMin !== ayMin) return byMin - ayMin

  const genderOrder = { BOY: 0, GIRL: 1, MIX: 2 } as const
  const ag = genderOrder[a.gender ?? 'MIX'] ?? 9
  const bg = genderOrder[b.gender ?? 'MIX'] ?? 9
  return ag - bg
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
    .select('id, category_id, moto_name, moto_order, status')
    .eq('event_id', eventId)
    .order('moto_order', { ascending: true })

  if (eventError) {
    return { ok: false as const, warning: eventError.message }
  }

  const { data: categoryRows, error: categoryError } = await adminClient
    .from('categories')
    .select('id, sequence_order, year_min, year_max, gender')
    .eq('event_id', eventId)

  if (categoryError) {
    return { ok: false as const, warning: categoryError.message }
  }

  const rows = (eventMotos ?? []) as MotoQueueRow[]
  const categories = ((categoryRows ?? []) as CategoryOrderRow[]).sort(compareCategoryOrder)
  const categoryOrderMap = new Map(categories.map((category, index) => [category.id, index]))

  const sortedEventMotos = [...rows].sort((a, b) => {
    const categoryOrderA = categoryOrderMap.get(a.category_id) ?? Number.MAX_SAFE_INTEGER
    const categoryOrderB = categoryOrderMap.get(b.category_id) ?? Number.MAX_SAFE_INTEGER
    if (categoryOrderA !== categoryOrderB) return categoryOrderA - categoryOrderB
    return compareMotoSequence(a, b)
  })

  const currentIndex = sortedEventMotos.findIndex((row) => row.id === currentMoto.id)
  if (currentIndex < 0) {
    return { ok: false as const, warning: 'Current moto not found in event sequence.' }
  }

  const nextMoto = sortedEventMotos
    .slice(currentIndex + 1)
    .find((row) => normalizeStatus(row.status) === 'UPCOMING')

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
