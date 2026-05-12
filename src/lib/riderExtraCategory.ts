import { adminClient } from './auth'

type RiderExtraCategoryRow = {
  id: string
  category_id: string
}

export async function getLatestRiderExtraCategory(riderId: string) {
  const { data, error } = await adminClient
    .from('rider_extra_categories')
    .select('id, category_id')
    .eq('rider_id', riderId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)

  return {
    data: ((data ?? [])[0] ?? null) as RiderExtraCategoryRow | null,
    error,
  }
}

export async function saveRiderExtraCategory(input: { riderId: string; eventId: string; categoryId: string }) {
  const { riderId, eventId, categoryId } = input

  const { data: existingRows, error: existingError } = await adminClient
    .from('rider_extra_categories')
    .select('id')
    .eq('rider_id', riderId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  if (existingError) {
    return { data: null, error: existingError }
  }

  const latestExistingId =
    existingRows && existingRows.length > 0 && typeof existingRows[0]?.id === 'string' ? existingRows[0].id : null

  let savedRow: RiderExtraCategoryRow | null = null

  if (latestExistingId) {
    const { data, error } = await adminClient
      .from('rider_extra_categories')
      .update({
        event_id: eventId,
        category_id: categoryId,
      })
      .eq('id', latestExistingId)
      .select('id, category_id')
      .single()

    if (error) {
      return { data: null, error }
    }

    savedRow = data as RiderExtraCategoryRow
  } else {
    const { data, error } = await adminClient
      .from('rider_extra_categories')
      .insert([
        {
          rider_id: riderId,
          event_id: eventId,
          category_id: categoryId,
        },
      ])
      .select('id, category_id')
      .single()

    if (error) {
      return { data: null, error }
    }

    savedRow = data as RiderExtraCategoryRow
  }

  if ((existingRows?.length ?? 0) > 1 && savedRow?.id) {
    await adminClient.from('rider_extra_categories').delete().eq('rider_id', riderId).neq('id', savedRow.id)
  }

  return {
    data: savedRow,
    error: null,
  }
}
