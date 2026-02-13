import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../lib/auth'

const MIN_BIRTH_YEAR = 2017
const MAX_BIRTH_YEAR = 2023

const suggestSuffix = (used: (string | null)[]) => {
  const existing = new Set((used.filter(Boolean) as string[]).map((s) => s.toUpperCase()))
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  for (const letter of alphabet) {
    if (!existing.has(letter)) return letter
  }
  return null
}

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

export async function PATCH(req: Request, { params }: { params: Promise<{ riderId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { riderId } = await params
  const body = await req.json()

  const {
    name,
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
  const nextPlateNumber = hasPlateNumber ? Number(plate_number) : rider.plate_number

  const hasPlateSuffix = Object.prototype.hasOwnProperty.call(body ?? {}, 'plate_suffix')
  const nextPlateSuffix = hasPlateSuffix
    ? typeof plate_suffix === 'string' && plate_suffix.trim()
      ? plate_suffix.trim().toUpperCase()
      : null
    : rider.plate_suffix

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

  const { data, error } = await adminClient
    .from('riders')
    .update({
      name,
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
