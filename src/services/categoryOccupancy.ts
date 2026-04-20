import { adminClient } from '../lib/auth'

type CategoryGender = 'BOY' | 'GIRL' | 'MIX'

export type OccupancyCategory = {
  id: string
  year: number
  year_min?: number | null
  year_max?: number | null
  gender: CategoryGender
}

type RiderRow = {
  birth_year?: number | null
  date_of_birth?: string | null
  gender: 'BOY' | 'GIRL'
}

const normalizeCategory = (category: OccupancyCategory) => ({
  ...category,
  year_min: category.year_min ?? category.year,
  year_max: category.year_max ?? category.year,
})

const getBirthYear = (rider: RiderRow) => {
  if (typeof rider.birth_year === 'number' && Number.isFinite(rider.birth_year)) {
    return rider.birth_year
  }
  const raw = String(rider.date_of_birth ?? '').slice(0, 4)
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

export const resolvePrimaryCategoryForOccupancy = (
  categories: OccupancyCategory[],
  birthYear: number,
  gender: 'BOY' | 'GIRL'
) => {
  const normalized = categories.map(normalizeCategory)
  const candidates = normalized.filter((category) => birthYear >= category.year_min && birthYear <= category.year_max)
  const genderMatch = candidates.filter((category) => category.gender === gender)
  if (genderMatch.length > 0) {
    return genderMatch.sort((a, b) => a.year_max - b.year_max)[0] ?? null
  }
  return candidates.filter((category) => category.gender === 'MIX').sort((a, b) => a.year_max - b.year_max)[0] ?? null
}

export const buildCategoryOccupancyMap = async (
  eventId: string,
  categories: OccupancyCategory[],
  options?: { excludePendingRegistrationId?: string | null }
) => {
  const counts = new Map<string, number>()

  const { data: riders, error: ridersError } = await adminClient
    .from('riders')
    .select('birth_year, date_of_birth, gender')
    .eq('event_id', eventId)

  if (ridersError) throw new Error(ridersError.message)

  for (const rider of (riders ?? []) as RiderRow[]) {
    const birthYear = getBirthYear(rider)
    if (!birthYear) continue
    const category = resolvePrimaryCategoryForOccupancy(categories, birthYear, rider.gender)
    if (!category?.id) continue
    counts.set(category.id, (counts.get(category.id) ?? 0) + 1)
  }

  const { data: extraRows, error: extraError } = await adminClient
    .from('rider_extra_categories')
    .select('category_id')
    .eq('event_id', eventId)

  if (extraError) throw new Error(extraError.message)

  for (const row of extraRows ?? []) {
    const categoryId = typeof row.category_id === 'string' ? row.category_id : null
    if (!categoryId) continue
    counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1)
  }

  let pendingQuery = adminClient
    .from('registration_items')
    .select('primary_category_id, extra_category_id, registration_id, registrations!inner(event_id)')
    .eq('registrations.event_id', eventId)
    .eq('status', 'PENDING')

  if (options?.excludePendingRegistrationId) {
    pendingQuery = pendingQuery.neq('registration_id', options.excludePendingRegistrationId)
  }

  const { data: pendingItems, error: pendingError } = await pendingQuery
  if (pendingError) throw new Error(pendingError.message)

  for (const row of pendingItems ?? []) {
    const primaryId = typeof row.primary_category_id === 'string' ? row.primary_category_id : null
    const extraId = typeof row.extra_category_id === 'string' ? row.extra_category_id : null
    if (primaryId) counts.set(primaryId, (counts.get(primaryId) ?? 0) + 1)
    if (extraId) counts.set(extraId, (counts.get(extraId) ?? 0) + 1)
  }

  return counts
}
