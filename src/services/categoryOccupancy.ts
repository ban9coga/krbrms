import { adminClient } from '../lib/auth'
import { riderBelongsToPrimaryCategory } from '../lib/categoryAssignment'

type CategoryGender = 'BOY' | 'GIRL' | 'MIX'

export type OccupancyCategory = {
  id: string
  year: number
  year_min?: number | null
  year_max?: number | null
  gender: CategoryGender
}

export type CategoryOccupancyBreakdown = {
  approved: Map<string, number>
  pending: Map<string, number>
  total: Map<string, number>
}

type RiderRow = {
  primary_category_id?: string | null
  birth_year?: number | null
  date_of_birth?: string | null
  gender: 'BOY' | 'GIRL'
}

const increaseCount = (target: Map<string, number>, categoryId: string | null) => {
  if (!categoryId) return
  target.set(categoryId, (target.get(categoryId) ?? 0) + 1)
}

export const buildCategoryOccupancyBreakdown = async (
  eventId: string,
  categories: OccupancyCategory[],
  options?: { excludePendingRegistrationId?: string | null }
) => {
  const approvedCounts = new Map<string, number>()
  const pendingCounts = new Map<string, number>()

  const { data: riders, error: ridersError } = await adminClient
    .from('riders')
    .select('primary_category_id, birth_year, date_of_birth, gender')
    .eq('event_id', eventId)

  if (ridersError) throw new Error(ridersError.message)

  for (const rider of (riders ?? []) as RiderRow[]) {
    for (const category of categories) {
      if (!riderBelongsToPrimaryCategory(rider, category)) continue
      increaseCount(approvedCounts, category.id)
      break
    }
  }

  const { data: extraRows, error: extraError } = await adminClient
    .from('rider_extra_categories')
    .select('category_id')
    .eq('event_id', eventId)

  if (extraError) throw new Error(extraError.message)

  for (const row of extraRows ?? []) {
    const categoryId = typeof row.category_id === 'string' ? row.category_id : null
    increaseCount(approvedCounts, categoryId)
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
    increaseCount(pendingCounts, primaryId)
    increaseCount(pendingCounts, extraId)
  }

  const totalCounts = new Map<string, number>()
  for (const [categoryId, value] of approvedCounts) {
    totalCounts.set(categoryId, value)
  }
  for (const [categoryId, value] of pendingCounts) {
    totalCounts.set(categoryId, (totalCounts.get(categoryId) ?? 0) + value)
  }

  return {
    approved: approvedCounts,
    pending: pendingCounts,
    total: totalCounts,
  } satisfies CategoryOccupancyBreakdown
}

export const buildCategoryOccupancyMap = async (
  eventId: string,
  categories: OccupancyCategory[],
  options?: { excludePendingRegistrationId?: string | null }
) => {
  const breakdown = await buildCategoryOccupancyBreakdown(eventId, categories, options)
  return breakdown.total
}
