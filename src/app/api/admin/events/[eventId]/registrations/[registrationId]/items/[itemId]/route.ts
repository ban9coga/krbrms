import { NextResponse } from 'next/server'
import { adminClient, requireBackoffice } from '../../../../../../../../../lib/auth'
import { isCategoryGenderCompatible, isCategoryInRange } from '../../../../../../../../../lib/categoryAssignment'
import { normalizePlateNumber, normalizePlateSuffix } from '../../../../../../../../../lib/plate'

type RiderGender = 'BOY' | 'GIRL'

const requiredText = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const optionalText = (value: unknown) => requiredText(value) || null
const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime())
const normalizeJerseySize = (value: unknown) => {
  const normalized = optionalText(value)?.toUpperCase() ?? null
  if (!normalized) return null
  const canonical = normalized === 'XXL' ? '2XL' : normalized
  return ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'].includes(canonical) ? canonical : null
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string; registrationId: string; itemId: string }> }
) {
  const { eventId, registrationId, itemId } = await params
  const auth = await requireBackoffice(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Payload edit rider tidak valid.' }, { status: 400 })
  }

  const riderName = requiredText(body.rider_name)
  const riderNickname = optionalText(body.rider_nickname)
  const dateOfBirth = requiredText(body.date_of_birth)
  const gender = body.gender === 'BOY' || body.gender === 'GIRL' ? (body.gender as RiderGender) : null
  const club = requiredText(body.club)
  const rawJerseySize = optionalText(body.jersey_size)
  const jerseySize = normalizeJerseySize(body.jersey_size)
  const primaryCategoryId = requiredText(body.primary_category_id)
  const plateNumber = normalizePlateNumber(body.plate_number, { maxDigits: 3 })
  const plateSuffix = normalizePlateSuffix(body.plate_suffix)

  if (!riderName || !dateOfBirth || !gender || !club || !primaryCategoryId || !plateNumber) {
    return NextResponse.json({ error: 'Nama, tanggal lahir, gender, club, kategori utama, dan nomor plate wajib diisi.' }, { status: 400 })
  }
  if (!isDate(dateOfBirth)) return NextResponse.json({ error: 'Tanggal lahir tidak valid.' }, { status: 400 })
  if (rawJerseySize && !jerseySize) {
    return NextResponse.json({ error: 'Ukuran jersey harus XS, S, M, L, XL, 2XL, atau 3XL.' }, { status: 400 })
  }

  const [{ data: registration, error: registrationError }, { data: item, error: itemError }, { data: category, error: categoryError }] =
    await Promise.all([
      adminClient.from('registrations').select('id, status').eq('id', registrationId).eq('event_id', eventId).maybeSingle(),
      adminClient
        .from('registration_items')
        .select('id, rider_name, rider_nickname, date_of_birth, gender, club, jersey_size, primary_category_id, requested_plate_number, requested_plate_suffix')
        .eq('id', itemId)
        .eq('registration_id', registrationId)
        .maybeSingle(),
      adminClient
        .from('categories')
        .select('id, event_id, year, year_min, year_max, gender, enabled, label')
        .eq('id', primaryCategoryId)
        .maybeSingle(),
    ])
  if (registrationError || itemError || categoryError) {
    return NextResponse.json({ error: registrationError?.message ?? itemError?.message ?? categoryError?.message }, { status: 400 })
  }
  if (!registration || !item) return NextResponse.json({ error: 'Pendaftaran atau rider tidak ditemukan.' }, { status: 404 })
  if (!category || category.event_id !== eventId || category.enabled === false) {
    return NextResponse.json({ error: 'Kategori utama tidak valid atau sedang nonaktif.' }, { status: 400 })
  }

  const birthYear = Number(dateOfBirth.slice(0, 4))
  if (!isCategoryInRange(category, birthYear) || !isCategoryGenderCompatible(category.gender, gender)) {
    return NextResponse.json({ error: `Kategori ${category.label} tidak sesuai dengan tahun lahir atau gender rider.` }, { status: 400 })
  }

  const itemUpdate = {
    rider_name: riderName,
    rider_nickname: riderNickname,
    date_of_birth: dateOfBirth,
    gender,
    club,
    jersey_size: jerseySize,
    primary_category_id: primaryCategoryId,
    requested_plate_number: plateNumber,
    requested_plate_suffix: plateSuffix,
  }

  if (registration.status !== 'APPROVED') {
    const { data, error } = await adminClient
      .from('registration_items')
      .update(itemUpdate)
      .eq('id', itemId)
      .select('id, rider_name, rider_nickname, date_of_birth, gender, club, jersey_size, primary_category_id, requested_plate_number, requested_plate_suffix')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, changed: true, data, synced_to_rider: false, structural_locked: false })
  }

  let riderQuery = adminClient
    .from('riders')
    .select('id, plate_number, plate_suffix, primary_category_id')
    .eq('event_id', eventId)
    .eq('plate_number', item.requested_plate_number)
  riderQuery = item.requested_plate_suffix ? riderQuery.eq('plate_suffix', item.requested_plate_suffix) : riderQuery.is('plate_suffix', null)
  const { data: rider, error: riderError } = await riderQuery.maybeSingle()
  if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })
  if (!rider) return NextResponse.json({ error: 'Rider resmi tidak ditemukan untuk pendaftaran approved ini.' }, { status: 404 })

  const { data: motoAssignment, error: assignmentError } = await adminClient
    .from('moto_riders')
    .select('moto_id')
    .eq('rider_id', rider.id)
    .limit(1)
  if (assignmentError) return NextResponse.json({ error: assignmentError.message }, { status: 400 })
  const structuralLocked = (motoAssignment ?? []).length > 0
  const structuralChanged =
    rider.primary_category_id !== primaryCategoryId ||
    String(rider.plate_number ?? '') !== plateNumber ||
    String(rider.plate_suffix ?? '') !== String(plateSuffix ?? '')
  if (structuralLocked && structuralChanged) {
    return NextResponse.json(
      { error: 'Kategori dan plate dikunci karena rider sudah masuk ke moto. Data identitas ringan masih dapat diperbarui.' },
      { status: 400 }
    )
  }

  let plateOwnerQuery = adminClient
    .from('riders')
    .select('id')
    .eq('event_id', eventId)
    .eq('plate_number', plateNumber)
  plateOwnerQuery = plateSuffix ? plateOwnerQuery.eq('plate_suffix', plateSuffix) : plateOwnerQuery.is('plate_suffix', null)
  const { data: plateOwner, error: plateError } = await plateOwnerQuery.maybeSingle()
  if (plateError) return NextResponse.json({ error: plateError.message }, { status: 400 })
  if (plateOwner && plateOwner.id !== rider.id) {
    return NextResponse.json({ error: `Nomor plate ${plateNumber}${plateSuffix ?? ''} sudah digunakan rider lain.` }, { status: 400 })
  }

  const riderUpdate = {
    name: riderName,
    rider_nickname: riderNickname,
    date_of_birth: dateOfBirth,
    gender,
    club,
    jersey_size: jerseySize,
    primary_category_id: primaryCategoryId,
    plate_number: plateNumber,
    plate_suffix: plateSuffix,
  }
  const { error: officialUpdateError } = await adminClient.from('riders').update(riderUpdate).eq('id', rider.id)
  if (officialUpdateError) return NextResponse.json({ error: officialUpdateError.message }, { status: 400 })

  const { data, error: itemUpdateError } = await adminClient
    .from('registration_items')
    .update(itemUpdate)
    .eq('id', itemId)
    .select('id, rider_name, rider_nickname, date_of_birth, gender, club, jersey_size, primary_category_id, requested_plate_number, requested_plate_suffix')
    .single()
  if (itemUpdateError) return NextResponse.json({ error: itemUpdateError.message }, { status: 400 })

  return NextResponse.json({ ok: true, changed: true, data, rider_id: rider.id, synced_to_rider: true, structural_locked: structuralLocked })
}
