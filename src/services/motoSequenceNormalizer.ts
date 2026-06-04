'use server'

import { adminClient } from '../lib/auth'
type MotoSequenceRow = {
  id: string
  moto_order: number | null
}

export const normalizeEventMotoSequence = async (eventId: string) => {
  const { data, error } = await adminClient
    .from('motos')
    .select('id, category_id, moto_name, moto_order')
    .eq('event_id', eventId)
    .order('moto_order', { ascending: true })

  if (error || !data || data.length === 0) return

  const rows = data as MotoSequenceRow[]
  const reordered = [...rows].sort((a, b) => (a.moto_order ?? Number.MAX_SAFE_INTEGER) - (b.moto_order ?? Number.MAX_SAFE_INTEGER))

  await Promise.all(
    reordered.map((row, index) => {
      const nextOrder = index + 1
      if (row.moto_order === nextOrder) return Promise.resolve()
      return adminClient.from('motos').update({ moto_order: nextOrder }).eq('id', row.id)
    })
  )
}
