import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../../lib/auth'

const resolveCategory = async (
  eventId: string,
  birthYear: number,
  gender: 'BOY' | 'GIRL'
) => {
  const { data: categories } = await adminClient
    .from('categories')
    .select('id, year, year_min, year_max, gender')
    .eq('event_id', eventId)
    .eq('enabled', true)

  const list = (categories ?? []).map((c) => ({
    ...c,
    year_min: c.year_min ?? c.year,
    year_max: c.year_max ?? c.year,
  }))

  if (list.length === 0) {
    const label = `${birthYear} ${gender === 'BOY' ? 'Boys' : 'Girls'}`
    const { data: created, error } = await adminClient
      .from('categories')
      .insert([
        {
          event_id: eventId,
          year: birthYear,
          year_min: birthYear,
          year_max: birthYear,
          gender,
          label,
          enabled: true,
        },
      ])
      .select('id')
      .single()
    if (error || !created?.id) throw new Error('Failed to create category')
    return created.id
  }

  const candidates = list.filter((c) => birthYear >= c.year_min && birthYear <= c.year_max)
  const genderMatch = candidates.filter((c) => c.gender === gender)
  const chosen =
    genderMatch.sort((a, b) => a.year_max - b.year_max)[0] ??
    candidates.filter((c) => c.gender === 'MIX').sort((a, b) => a.year_max - b.year_max)[0]

  if (!chosen?.id) throw new Error('No matching category for rider')
  return chosen.id as string
}

type ApprovalItem = {
  id: string
  plate_number?: number | null
  plate_suffix?: string | null
}

const normalizeSuffix = (value?: string | null) => {
  if (!value) return null
  const trimmed = value.trim().toUpperCase()
  return trimmed.length ? trimmed[0] : null
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string; registrationId: string }> }
) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId, registrationId } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const { status, notes, items }: { status?: string; notes?: string; items?: ApprovalItem[] } = body
  if (status !== 'APPROVED' && status !== 'REJECTED') {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { data: reg, error: regError } = await adminClient
    .from('registrations')
    .select('*')
    .eq('id', registrationId)
    .eq('event_id', eventId)
    .single()
  if (regError) return NextResponse.json({ error: regError.message }, { status: 400 })

  const { data: itemRows, error: itemError } = await adminClient
    .from('registration_items')
    .select('*')
    .eq('registration_id', registrationId)
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 400 })

  if (status === 'REJECTED') {
    await adminClient.from('registrations').update({ status, notes: notes ?? null }).eq('id', registrationId)
    await adminClient.from('registration_items').update({ status }).eq('registration_id', registrationId)
    return NextResponse.json({ ok: true })
  }

  const categoryIds = new Set<string>()
  for (const item of itemRows ?? []) {
    if (item.primary_category_id) categoryIds.add(item.primary_category_id as string)
    if (item.extra_category_id) categoryIds.add(item.extra_category_id as string)
  }

  if (categoryIds.size > 0) {
    const { data: categories, error: catError } = await adminClient
      .from('categories')
      .select('id, capacity, label')
      .in('id', Array.from(categoryIds))
    if (catError) return NextResponse.json({ error: catError.message }, { status: 400 })

    const capacityMap = new Map(
      (categories ?? []).map((c) => [c.id, { capacity: c.capacity as number | null, label: c.label as string }])
    )
    const hasCapacity = Array.from(capacityMap.values()).some((c) => typeof c.capacity === 'number')

    if (hasCapacity) {
      const { data: existingItems, error: existingError } = await adminClient
        .from('registration_items')
        .select('primary_category_id, extra_category_id, status, registration_id, registrations!inner(event_id)')
        .eq('registrations.event_id', eventId)
        .in('status', ['PENDING', 'APPROVED'])
        .neq('registration_id', registrationId)
      if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 })

      const currentCounts = new Map<string, number>()
      for (const row of existingItems ?? []) {
        const primaryId = row.primary_category_id as string | null
        const extraId = row.extra_category_id as string | null
        if (primaryId) currentCounts.set(primaryId, (currentCounts.get(primaryId) ?? 0) + 1)
        if (extraId) currentCounts.set(extraId, (currentCounts.get(extraId) ?? 0) + 1)
      }

      const addCounts = new Map<string, number>()
      for (const item of itemRows ?? []) {
        if (item.primary_category_id) {
          const id = item.primary_category_id as string
          addCounts.set(id, (addCounts.get(id) ?? 0) + 1)
        }
        if (item.extra_category_id) {
          const id = item.extra_category_id as string
          addCounts.set(id, (addCounts.get(id) ?? 0) + 1)
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
  }

  const itemMap = new Map((items ?? []).map((i) => [i.id, i]))

  for (const item of itemRows ?? []) {
    const input = itemMap.get(item.id)
    const plateNumber = input?.plate_number ?? item.requested_plate_number
    const plateSuffix = normalizeSuffix(input?.plate_suffix ?? item.requested_plate_suffix)
    if (!plateNumber) {
      return NextResponse.json({ error: `Missing plate number for ${item.rider_name}` }, { status: 400 })
    }

    let query = adminClient
      .from('riders')
      .select('id')
      .eq('event_id', eventId)
      .eq('plate_number', plateNumber)
    if (plateSuffix) {
      query = query.eq('plate_suffix', plateSuffix)
    } else {
      query = query.is('plate_suffix', null)
    }
    const { data: existing, error: existsError } = await query
    if (existsError) return NextResponse.json({ error: existsError.message }, { status: 400 })
    if ((existing ?? []).length > 0) {
      return NextResponse.json(
        { error: `Plate already used: ${plateNumber}${plateSuffix ?? ''}` },
        { status: 400 }
      )
    }
  }

  const createdRiders: Array<{ rider_id: string; extra_category_id?: string | null }> = []
  for (const item of itemRows ?? []) {
    const input = itemMap.get(item.id)
    const plateNumber = input?.plate_number ?? item.requested_plate_number
    const plateSuffix = normalizeSuffix(input?.plate_suffix ?? item.requested_plate_suffix)
    const birthYear = Number(String(item.date_of_birth).slice(0, 4))
    if (Number.isNaN(birthYear)) {
      return NextResponse.json({ error: `Invalid date_of_birth for ${item.rider_name}` }, { status: 400 })
    }
    await resolveCategory(eventId, birthYear, item.gender)

    const { data: riderRow, error: riderError } = await adminClient
      .from('riders')
      .insert({
        event_id: eventId,
        name: item.rider_name,
        rider_nickname: item.rider_nickname ?? null,
        date_of_birth: item.date_of_birth,
        gender: item.gender,
        plate_number: plateNumber,
        plate_suffix: plateSuffix,
        club: item.club ?? null,
      })
      .select('id')
      .single()
    if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })
    createdRiders.push({ rider_id: riderRow.id, extra_category_id: item.extra_category_id })
  }

  for (const row of createdRiders) {
    if (!row.extra_category_id) continue
    const { error: extraError } = await adminClient
      .from('rider_extra_categories')
      .insert({
        event_id: eventId,
        rider_id: row.rider_id,
        category_id: row.extra_category_id,
      })
    if (extraError) return NextResponse.json({ error: extraError.message }, { status: 400 })
  }

  await adminClient.from('registrations').update({ status, notes: notes ?? null }).eq('id', registrationId)
  await adminClient.from('registration_items').update({ status }).eq('registration_id', registrationId)

  return NextResponse.json({ ok: true })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ eventId: string; registrationId: string }> }
) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId, registrationId } = await params
  const { error } = await adminClient
    .from('registrations')
    .delete()
    .eq('id', registrationId)
    .eq('event_id', eventId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
