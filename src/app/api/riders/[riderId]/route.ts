import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../lib/auth'

const MIN_BIRTH_YEAR = 2016
const MAX_BIRTH_YEAR = 2025

const suggestSuffix = (used: (string | null)[]) => {
  const existing = new Set((used.filter(Boolean) as string[]).map((s) => s.toUpperCase()))
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  for (const letter of alphabet) {
    if (!existing.has(letter)) return letter
  }
  return null
}

const normalizePlateNumber = (value: unknown) => {
  if (value === undefined || value === null) return null
  const raw = String(value).trim()
  if (!raw) return null
  if (!/^\d+$/.test(raw)) return null
  return raw
}

const normalizePlateSuffix = (value: unknown) => {
  if (typeof value !== 'string') return null
  const raw = value.trim().toUpperCase()
  if (!raw) return null
  const suffix = raw[0]
  if (!/^[A-Z]$/.test(suffix)) return null
  return suffix
}

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

export async function PATCH(req: Request, { params }: { params: Promise<{ riderId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { riderId } = await params
  const body = await req.json()

  const {
    name,
    rider_nickname,
    jersey_size,
    date_of_birth,
    gender,
    plate_number,
    plate_suffix,
    club,
    photo_url,
    photo_thumbnail_url,
  } = body ?? {}

  const { data: rider, error: riderError } = await adminClient
    .from('riders')
    .select('id, event_id, date_of_birth, gender, plate_number, plate_suffix')
    .eq('id', riderId)
    .single()

  if (riderError || !rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 })

  const nextGender = gender ?? rider.gender
  if (nextGender !== 'BOY' && nextGender !== 'GIRL') {
    return NextResponse.json({ error: 'gender must be BOY or GIRL' }, { status: 400 })
  }

  if (jersey_size && !['XS', 'S', 'M', 'L', 'XL'].includes(String(jersey_size))) {
    return NextResponse.json({ error: 'jersey_size invalid' }, { status: 400 })
  }

  const nextDob = date_of_birth ?? rider.date_of_birth
  const nextBirthYear = Number(String(nextDob).slice(0, 4))
  if (
    Number.isNaN(nextBirthYear) ||
    nextBirthYear < MIN_BIRTH_YEAR ||
    nextBirthYear > MAX_BIRTH_YEAR
  ) {
    return NextResponse.json(
      { error: `Birth year must be between ${MIN_BIRTH_YEAR} and ${MAX_BIRTH_YEAR}` },
      { status: 400 }
    )
  }

  const hasPlateNumber = Object.prototype.hasOwnProperty.call(body ?? {}, 'plate_number')
  const nextPlateNumber = hasPlateNumber
    ? normalizePlateNumber(plate_number)
    : normalizePlateNumber(rider.plate_number)
  if (!nextPlateNumber) {
    return NextResponse.json({ error: 'plate_number must contain digits only' }, { status: 400 })
  }

  const hasPlateSuffix = Object.prototype.hasOwnProperty.call(body ?? {}, 'plate_suffix')
  const nextPlateSuffix = hasPlateSuffix
    ? normalizePlateSuffix(plate_suffix)
    : normalizePlateSuffix(rider.plate_suffix)
  if (hasPlateSuffix && typeof plate_suffix === 'string' && plate_suffix.trim().length > 0 && !nextPlateSuffix) {
    return NextResponse.json({ error: 'plate_suffix must be A-Z' }, { status: 400 })
  }

  if (hasPlateNumber || hasPlateSuffix) {
    const { data: existingPlates } = await adminClient
      .from('riders')
      .select('id, plate_suffix')
      .eq('event_id', rider.event_id)
      .eq('plate_number', nextPlateNumber)
      .neq('id', riderId)

    if ((existingPlates ?? []).length > 0) {
      const used = existingPlates?.map((row) => row.plate_suffix) ?? []
      if (!nextPlateSuffix) {
        const suggestion = suggestSuffix(used)
        return NextResponse.json(
          { error: 'plate_number already exists', suggested_suffix: suggestion },
          { status: 409 }
        )
      }
      if ((used ?? []).map((s) => (s ?? '').toUpperCase()).includes(nextPlateSuffix.toUpperCase())) {
        const suggestion = suggestSuffix(used)
        return NextResponse.json(
          { error: 'plate_suffix already exists', suggested_suffix: suggestion },
          { status: 409 }
        )
      }
    }
  }

  // Ensure the category row exists for the (possibly updated) DOB/gender.
  await resolveCategory(rider.event_id, nextBirthYear, nextGender)

  const { data: existingExtraCategory } = await adminClient
    .from('rider_extra_categories')
    .select('id, category_id, categories(id, year, year_min, year_max, gender)')
    .eq('rider_id', riderId)
    .maybeSingle()

  const linkedCategoryRaw = existingExtraCategory?.categories
  const linkedExtraCategory = (
    Array.isArray(linkedCategoryRaw) ? linkedCategoryRaw[0] : linkedCategoryRaw
  ) as
    | { id: string; year: number; year_min?: number | null; year_max?: number | null; gender: 'BOY' | 'GIRL' | 'MIX' }
    | null

  if (linkedExtraCategory) {
    const maxYear = linkedExtraCategory.year_max ?? linkedExtraCategory.year
    const invalidGender = linkedExtraCategory.gender !== 'MIX' && linkedExtraCategory.gender !== nextGender
    const invalidBirthYear = maxYear >= nextBirthYear
    if (invalidGender || invalidBirthYear) {
      await adminClient.from('rider_extra_categories').delete().eq('rider_id', riderId)
    }
  }

  const { data, error } = await adminClient
    .from('riders')
    .update({
      name,
      rider_nickname: typeof rider_nickname === 'string' ? rider_nickname.trim() || null : undefined,
      jersey_size: typeof jersey_size === 'string' ? jersey_size : undefined,
      date_of_birth,
      gender,
      plate_number: hasPlateNumber ? nextPlateNumber : undefined,
      plate_suffix: hasPlateSuffix ? nextPlateSuffix : undefined,
      club,
      photo_url,
      photo_thumbnail_url,
    })
    .eq('id', riderId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ riderId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { riderId } = await params
  const { data: rider, error: riderError } = await adminClient
    .from('riders')
    .select('id, event_id')
    .eq('id', riderId)
    .single()

  if (riderError || !rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 })

  const { data: event } = await adminClient
    .from('events')
    .select('status')
    .eq('id', rider.event_id)
    .maybeSingle()

  if (event?.status === 'LIVE') {
    return NextResponse.json({ error: 'Cannot delete rider when event is LIVE' }, { status: 400 })
  }

  const { error } = await adminClient
    .from('riders')
    .delete()
    .eq('id', riderId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
