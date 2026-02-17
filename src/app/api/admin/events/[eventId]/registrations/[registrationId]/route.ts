import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../../lib/auth'

const resolveCategory = async (
  eventId: string,
  birthYear: number,
  gender: 'BOY' | 'GIRL'
) => {
  const isU2017 = birthYear === 2017
  const yearKey = isU2017 ? 2017 : birthYear
  const categoryGender = isU2017 ? 'MIX' : gender
  const label = isU2017 ? 'FFA-MIX' : `${birthYear} ${gender === 'BOY' ? 'Boys' : 'Girls'}`

  const { data: existing } = await adminClient
    .from('categories')
    .select('id')
    .eq('event_id', eventId)
    .eq('year', yearKey)
    .eq('gender', categoryGender)
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data: created, error } = await adminClient
    .from('categories')
    .insert([
      {
        event_id: eventId,
        year: yearKey,
        gender: categoryGender,
        label,
        enabled: true,
      },
    ])
    .select('id')
    .single()

  if (error || !created?.id) throw new Error('Failed to create category')
  return created.id
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
