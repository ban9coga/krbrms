import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'

type RegistrationItemInput = {
  rider_name: string
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
const DEFAULT_FFA_MIN_YEAR = 2017
const DEFAULT_FFA_MAX_YEAR = 2017

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

  const categoryIds = new Set<string>()
  for (const item of items) {
    if (item.primary_category_id) categoryIds.add(item.primary_category_id)
    if (item.extra_category_id) categoryIds.add(item.extra_category_id)
  }

  const { data: categories, error: catError } = await adminClient
    .from('categories')
    .select('id, event_id, year, gender')
    .in('id', Array.from(categoryIds))

  if (catError) return NextResponse.json({ error: catError.message }, { status: 400 })
  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]))

  const { data: settings, error: settingsError } = await adminClient
    .from('event_settings')
    .select('ffa_mix_min_year, ffa_mix_max_year')
    .eq('event_id', eventId)
    .maybeSingle()

  if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 400 })
  const ffaMin = Number(settings?.ffa_mix_min_year)
  const ffaMax = Number(settings?.ffa_mix_max_year)
  const ffaMinYear = Number.isFinite(ffaMin) ? ffaMin : DEFAULT_FFA_MIN_YEAR
  const ffaMaxYear = Number.isFinite(ffaMax) ? ffaMax : DEFAULT_FFA_MAX_YEAR

  const preparedItems: PreparedItem[] = items.map((item) => {
    const birthYear = toYear(item.date_of_birth ?? '')
    const primary = item.primary_category_id ? categoryMap.get(item.primary_category_id) : null
    const extra = item.extra_category_id ? categoryMap.get(item.extra_category_id) : null

    if (!item.rider_name || !item.date_of_birth || !item.gender) {
      return { error: 'Missing rider fields' }
    }
    if (!birthYear) return { error: 'Invalid date_of_birth' }
    if (primary && primary.event_id !== eventId) return { error: 'Invalid primary category' }
    if (extra && extra.event_id !== eventId) return { error: 'Invalid extra category' }
    if (primary?.gender === 'MIX' && (birthYear < ffaMinYear || birthYear > ffaMaxYear)) {
      return { error: 'Birth year not eligible for FFA-MIX' }
    }
    if (extra?.gender === 'MIX' && (birthYear < ffaMinYear || birthYear > ffaMaxYear)) {
      return { error: 'Birth year not eligible for FFA-MIX' }
    }

    const price = BASE_PRICE + (extra ? EXTRA_PRICE : 0)
    return {
      rider_name: item.rider_name,
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
