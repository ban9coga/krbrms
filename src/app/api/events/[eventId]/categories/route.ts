import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'
import { buildCategoryOccupancyBreakdown, type CategoryOccupancyBreakdown } from '../../../../../services/categoryOccupancy'

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

  let occupancyBreakdown: CategoryOccupancyBreakdown
  try {
    occupancyBreakdown = await buildCategoryOccupancyBreakdown(eventId, categories as Array<{
      id: string
      year: number
      year_min?: number | null
      year_max?: number | null
      gender: 'BOY' | 'GIRL' | 'MIX'
    }>)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to count category occupancy' }, { status: 400 })
  }

  const data = categories.map((category) => {
    const rawCapacity = category.capacity
    const capacity = typeof rawCapacity === 'number' && Number.isFinite(rawCapacity) ? rawCapacity : null
    const approved_filled = occupancyBreakdown.approved.get(category.id) ?? 0
    const pending_filled = occupancyBreakdown.pending.get(category.id) ?? 0
    const filled = occupancyBreakdown.total.get(category.id) ?? 0
    const remaining = capacity == null ? null : Math.max(0, capacity - filled)
    const is_full = capacity == null ? false : filled >= capacity
    return {
      ...category,
      approved_filled,
      pending_filled,
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
