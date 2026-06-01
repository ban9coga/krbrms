'use server'

import { adminClient } from '../lib/auth'
import { compareMotoDisplayOrder } from '../lib/motoDisplayOrder'

type MotoSequenceRow = {
  id: string
  category_id: string
  moto_name: string
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
  const categoryOrder: string[] = []
  const seenCategories = new Set<string>()
  for (const row of rows) {
    if (seenCategories.has(row.category_id)) continue
    seenCategories.add(row.category_id)
    categoryOrder.push(row.category_id)
  }

  const reordered = categoryOrder.flatMap((categoryId) =>
    rows
      .filter((row) => row.category_id === categoryId)
      .sort((a, b) =>
        compareMotoDisplayOrder(
          { ...a, moto_name: a.moto_name ?? '', moto_order: a.moto_order ?? Number.MAX_SAFE_INTEGER },
          { ...b, moto_name: b.moto_name ?? '', moto_order: b.moto_order ?? Number.MAX_SAFE_INTEGER }
        )
      )
  )

  await Promise.all(
    reordered.map((row, index) => {
      const nextOrder = index + 1
      if (row.moto_order === nextOrder) return Promise.resolve()
      return adminClient.from('motos').update({ moto_order: nextOrder }).eq('id', row.id)
    })
  )
}
