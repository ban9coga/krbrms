import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'

type RegistrationItemInput = {
  rider_name: string
  rider_nickname?: string | null
  jersey_size?: string | null
  date_of_birth: string
  gender: 'BOY' | 'GIRL'
  club?: string | null
  primary_category_id?: string | null
  extra_category_id?: string | null
  requested_plate_number?: number | null
  requested_plate_suffix?: string | null
}

type PreparedItem =
  | { error: string }
  | {
      rider_name: string
      rider_nickname: string | null
      jersey_size: string | null
      date_of_birth: string
      gender: 'BOY' | 'GIRL'
      club: string | null
      primary_category_id: string | null
      extra_category_id: string | null
      requested_plate_number: number | null
      requested_plate_suffix: string | null
      price: number
    }

const BASE_PRICE = 250000
const EXTRA_PRICE = 150000
const JERSEY_SIZES = new Set(['XS', 'S', 'M', 'L', 'XL'])

const toYear = (dateString: string) => {
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return null
  return d.getUTCFullYear()
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const {
    community_name,
    contact_name,
    contact_phone,
    contact_email,
    items,
  }: {
    community_name?: string
    contact_name?: string
    contact_phone?: string
    contact_email?: string
    items?: RegistrationItemInput[]
  } = body

  if (!contact_name || !contact_phone || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data: settingsRow, error: settingsError } = await adminClient
    .from('event_settings')
    .select('require_jersey_size')
    .eq('event_id', eventId)
    .maybeSingle()

  if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 400 })
  const requireJerseySize = Boolean(settingsRow?.require_jersey_size)

  const categoryIds = new Set<string>()
  for (const item of items) {
    if (item.primary_category_id) categoryIds.add(item.primary_category_id)
    if (item.extra_category_id) categoryIds.add(item.extra_category_id)
  }

  const { data: categories, error: catError } = await adminClient
    .from('categories')
    .select('id, event_id, year, year_min, year_max, capacity, gender, label')
    .in('id', Array.from(categoryIds))

  if (catError) return NextResponse.json({ error: catError.message }, { status: 400 })
  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]))

  // range validation handled per category

  const preparedItems: PreparedItem[] = items.map((item) => {
    const birthYear = toYear(item.date_of_birth ?? '')
    const primary = item.primary_category_id ? categoryMap.get(item.primary_category_id) : null
    const extra = item.extra_category_id ? categoryMap.get(item.extra_category_id) : null

    if (!item.rider_name || !item.rider_nickname || !item.date_of_birth || !item.gender) {
      return { error: 'Missing rider fields' }
    }
    if (requireJerseySize && !item.jersey_size) {
      return { error: 'Jersey size required' }
    }
    if (item.jersey_size && !JERSEY_SIZES.has(item.jersey_size)) {
      return { error: 'Invalid jersey size' }
    }
    if (!birthYear) return { error: 'Invalid date_of_birth' }
    if (primary && primary.event_id !== eventId) return { error: 'Invalid primary category' }
    if (extra && extra.event_id !== eventId) return { error: 'Invalid extra category' }
    const primaryMin = primary ? (primary.year_min ?? primary.year) : null
    const primaryMax = primary ? (primary.year_max ?? primary.year) : null
    if (primary && (birthYear < primaryMin || birthYear > primaryMax)) {
      return { error: 'Birth year not eligible for selected category' }
    }
    if (primary && primary.gender !== 'MIX' && primary.gender !== item.gender) {
      return { error: 'Gender not eligible for selected category' }
    }

    const extraMin = extra ? (extra.year_min ?? extra.year) : null
    const extraMax = extra ? (extra.year_max ?? extra.year) : null
    if (extra && (birthYear < extraMin || birthYear > extraMax)) {
      return { error: 'Birth year not eligible for extra category' }
    }
    if (extra && extra.gender !== 'MIX' && extra.gender !== item.gender) {
      return { error: 'Gender not eligible for extra category' }
    }

    const price = BASE_PRICE + (extra ? EXTRA_PRICE : 0)
    return {
      rider_name: item.rider_name,
      rider_nickname: item.rider_nickname ?? null,
      jersey_size: item.jersey_size ?? null,
      date_of_birth: item.date_of_birth,
      gender: item.gender,
      club: item.club ?? null,
      primary_category_id: item.primary_category_id ?? null,
      extra_category_id: item.extra_category_id ?? null,
      requested_plate_number: item.requested_plate_number ?? null,
      requested_plate_suffix: item.requested_plate_suffix ?? null,
      price,
    }
  })

  const invalid = preparedItems.find((item) => 'error' in item)
  if (invalid && 'error' in invalid) {
    return NextResponse.json({ error: invalid.error }, { status: 400 })
  }

  const capacityMap = new Map(
    (categories ?? []).map((c) => [c.id, { capacity: c.capacity as number | null, label: c.label as string }])
  )
  const hasCapacity = Array.from(capacityMap.values()).some((c) => typeof c.capacity === 'number')
  if (hasCapacity) {
    const { data: existingItems, error: existingError } = await adminClient
      .from('registration_items')
      .select('primary_category_id, extra_category_id, status, registrations!inner(event_id)')
      .eq('registrations.event_id', eventId)
      .in('status', ['PENDING', 'APPROVED'])
    if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 })

    const currentCounts = new Map<string, number>()
    for (const row of existingItems ?? []) {
      const primaryId = row.primary_category_id as string | null
      const extraId = row.extra_category_id as string | null
      if (primaryId) currentCounts.set(primaryId, (currentCounts.get(primaryId) ?? 0) + 1)
      if (extraId) currentCounts.set(extraId, (currentCounts.get(extraId) ?? 0) + 1)
    }

    const addCounts = new Map<string, number>()
    for (const item of preparedItems) {
      if ('error' in item) continue
      if (item.primary_category_id) {
        addCounts.set(item.primary_category_id, (addCounts.get(item.primary_category_id) ?? 0) + 1)
      }
      if (item.extra_category_id) {
        addCounts.set(item.extra_category_id, (addCounts.get(item.extra_category_id) ?? 0) + 1)
      }
    }

    for (const [catId, addCount] of addCounts) {
      const capInfo = capacityMap.get(catId)
      if (!capInfo || capInfo.capacity == null) continue
      const current = currentCounts.get(catId) ?? 0
      if (current + addCount > capInfo.capacity) {
        return NextResponse.json({ error: `Kuota kategori "${capInfo.label}" penuh.` }, { status: 400 })
      }
    }
  }

  const pricedItems = preparedItems.filter(
    (item): item is Extract<PreparedItem, { price: number }> => 'price' in item
  )
  const totalAmount = pricedItems.reduce((sum, item) => sum + item.price, 0)

  const { data: registration, error: regError } = await adminClient
    .from('registrations')
    .insert({
      event_id: eventId,
      community_name: community_name ?? null,
      contact_name,
      contact_phone,
      contact_email: contact_email ?? null,
      total_amount: totalAmount,
      status: 'PENDING',
    })
    .select('*')
    .single()

  if (regError) return NextResponse.json({ error: regError.message }, { status: 400 })

  const { data: itemRows, error: itemError } = await adminClient
    .from('registration_items')
    .insert(
      preparedItems.map((item) => ({
        ...item,
        registration_id: registration.id,
        status: 'PENDING',
      }))
    )
    .select('*')

  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 400 })

  return NextResponse.json({ data: { registration, items: itemRows } })
}
