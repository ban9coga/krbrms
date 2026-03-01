import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { data: categories, error } = await adminClient
    .from('categories')
    .select('id, year, year_min, year_max, capacity, gender, label, enabled')
    .eq('event_id', eventId)
    .order('year_min', { ascending: true })
    .order('gender', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (!categories || categories.length === 0) {
    return NextResponse.json({ data: [] })
  }

  const { data: existingItems, error: existingError } = await adminClient
    .from('registration_items')
    .select('primary_category_id, extra_category_id, status, registrations!inner(event_id)')
    .eq('registrations.event_id', eventId)
    .in('status', ['PENDING', 'APPROVED'])
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 })

  const filledCounts = new Map<string, number>()
  for (const row of existingItems ?? []) {
    const primaryId = row.primary_category_id as string | null
    const extraId = row.extra_category_id as string | null
    if (primaryId) filledCounts.set(primaryId, (filledCounts.get(primaryId) ?? 0) + 1)
    if (extraId) filledCounts.set(extraId, (filledCounts.get(extraId) ?? 0) + 1)
  }

  const data = categories.map((category) => {
    const rawCapacity = category.capacity
    const capacity = typeof rawCapacity === 'number' && Number.isFinite(rawCapacity) ? rawCapacity : null
    const filled = filledCounts.get(category.id) ?? 0
    const remaining = capacity == null ? null : Math.max(0, capacity - filled)
    const is_full = capacity == null ? false : filled >= capacity
    return {
      ...category,
      filled,
      remaining,
      is_full,
    }
  })

  return NextResponse.json({ data })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const { label, year_min, year_max, gender, capacity, enabled }: Record<string, unknown> = body
  const yearMin = Number(year_min)
  const yearMax = Number(year_max)
  if (!Number.isFinite(yearMin) || !Number.isFinite(yearMax)) {
    return NextResponse.json({ error: 'year_min and year_max are required numbers' }, { status: 400 })
  }
  if (yearMin > yearMax) {
    return NextResponse.json({ error: 'year_min must be <= year_max' }, { status: 400 })
  }
  const normalizedGender = String(gender || '').toUpperCase()
  if (!['BOY', 'GIRL', 'MIX'].includes(normalizedGender)) {
    return NextResponse.json({ error: 'gender must be BOY, GIRL, or MIX' }, { status: 400 })
  }
  const normalizedLabel = typeof label === 'string' ? label.trim() : ''
  if (!normalizedLabel) {
    return NextResponse.json({ error: 'label is required' }, { status: 400 })
  }
  const normalizedCapacity =
    capacity == null || capacity === ''
      ? null
      : Number.isFinite(Number(capacity)) && Number(capacity) >= 0
      ? Number(capacity)
      : NaN
  if (Number.isNaN(normalizedCapacity)) {
    return NextResponse.json({ error: 'capacity must be >= 0' }, { status: 400 })
  }

  const year = yearMax
  const { data, error } = await adminClient
    .from('categories')
    .insert({
      event_id: eventId,
      year,
      year_min: yearMin,
      year_max: yearMax,
      gender: normalizedGender,
      label: normalizedLabel,
      capacity: normalizedCapacity,
      enabled: enabled !== false,
    })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
