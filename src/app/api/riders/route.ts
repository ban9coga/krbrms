import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../lib/auth'

const MIN_BIRTH_YEAR = 2016
const MAX_BIRTH_YEAR = 2025

const suggestSuffix = (used: (string | null)[]) => {
  const existing = new Set(used.filter(Boolean) as string[])
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
    // Fallback: create single-year category if none exist.
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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('event_id')
  const categoryId = searchParams.get('category_id')
  if (!eventId) {
    return NextResponse.json({ error: 'event_id required' }, { status: 400 })
  }
  const page = Number(searchParams.get('page') ?? '1')
  const pageSize = Number(searchParams.get('page_size') ?? '20')
  const q = searchParams.get('q')
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  let query = adminClient
    .from('riders')
    .select(
      'id, event_id, name, rider_nickname, date_of_birth, birth_year, gender, plate_number, plate_suffix, no_plate_display, club, photo_url, photo_thumbnail_url',
      { count: 'exact' }
    )
    .order('plate_number', { ascending: true })
    .order('plate_suffix', { ascending: true, nullsFirst: true })
  if (eventId) query = query.eq('event_id', eventId)
  if (categoryId) {
    const { data: category, error: categoryError } = await adminClient
      .from('categories')
      .select('id, event_id, year, year_min, year_max, gender')
      .eq('id', categoryId)
      .maybeSingle()
    if (categoryError || !category) {
      return NextResponse.json({ error: 'Invalid category_id' }, { status: 400 })
    }
    if (category.event_id !== eventId) {
      return NextResponse.json({ error: 'category_id does not belong to event' }, { status: 400 })
    }
    const { data: extraRows } = await adminClient
      .from('rider_extra_categories')
      .select('rider_id')
      .eq('event_id', eventId)
      .eq('category_id', categoryId)
    const extraIds = (extraRows ?? []).map((row) => row.rider_id)

    const minYear = (category.year_min ?? category.year) as number
    const maxYear = (category.year_max ?? category.year) as number
    if (extraIds.length > 0) {
      const baseFilter =
        category.gender === 'MIX'
          ? `and(birth_year.gte.${minYear},birth_year.lte.${maxYear})`
          : `and(birth_year.gte.${minYear},birth_year.lte.${maxYear},gender.eq.${category.gender})`
      const orFilter = `${baseFilter},id.in.(${extraIds.join(',')})`
      query = query.or(orFilter)
    } else {
      query = query.gte('birth_year', minYear).lte('birth_year', maxYear)
      if (category.gender !== 'MIX') {
        query = query.eq('gender', category.gender)
      }
    }
  }
  if (q) query = query.or(`name.ilike.%${q}%,rider_nickname.ilike.%${q}%,no_plate_display.ilike.%${q}%`)
  query = query.range(from, to)
  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data, page, page_size: pageSize, total: count ?? 0 })
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    event_id,
    name,
    rider_nickname,
    date_of_birth,
    gender,
    plate_number,
    plate_suffix = null,
    club,
  } = body ?? {}

  const missing: string[] = []
  if (!event_id) missing.push('event_id')
  if (!name) missing.push('name')
  if (!date_of_birth) missing.push('date_of_birth')
  if (!gender) missing.push('gender')
  const hasPlateNumber =
    plate_number !== undefined &&
    plate_number !== null &&
    String(plate_number).trim() !== ''
  if (!hasPlateNumber) missing.push('plate_number')

  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(', ')}` },
      { status: 400 }
    )
  }

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (typeof event_id !== 'string' || !uuidRegex.test(event_id)) {
    return NextResponse.json({ error: 'event_id must be a UUID' }, { status: 400 })
  }

  if (typeof date_of_birth !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date_of_birth)) {
    return NextResponse.json({ error: 'date_of_birth must be YYYY-MM-DD' }, { status: 400 })
  }

  const plateNumber = typeof plate_number === 'number' ? plate_number : Number(plate_number)
  if (!Number.isFinite(plateNumber)) {
    return NextResponse.json({ error: 'plate_number must be a number' }, { status: 400 })
  }

  if (gender !== 'BOY' && gender !== 'GIRL') {
    return NextResponse.json({ error: 'gender must be BOY or GIRL' }, { status: 400 })
  }

  const birthYear = Number(String(date_of_birth).slice(0, 4))
  if (Number.isNaN(birthYear) || birthYear < MIN_BIRTH_YEAR || birthYear > MAX_BIRTH_YEAR) {
    return NextResponse.json(
      { error: `Birth year must be between ${MIN_BIRTH_YEAR} and ${MAX_BIRTH_YEAR}` },
      { status: 400 }
    )
  }

  const normalizedSuffix =
    typeof plate_suffix === 'string' && plate_suffix.trim()
      ? plate_suffix.trim().toUpperCase()
      : null

  const { data: existingPlates } = await adminClient
    .from('riders')
    .select('plate_suffix')
    .eq('event_id', event_id)
    .eq('plate_number', plateNumber)

  if ((existingPlates ?? []).length > 0) {
    const used = existingPlates?.map((row) => row.plate_suffix) ?? []
    if (!normalizedSuffix) {
      const suggestion = suggestSuffix(used)
      return NextResponse.json(
        { error: 'plate_number already exists', suggested_suffix: suggestion },
        { status: 409 }
      )
    }
    if (used.includes(normalizedSuffix)) {
      const suggestion = suggestSuffix(used)
      return NextResponse.json(
        { error: 'plate_suffix already exists', suggested_suffix: suggestion },
        { status: 409 }
      )
    }
  }

  const categoryId = await resolveCategory(event_id, birthYear, gender)

  const { data, error } = await adminClient
    .from('riders')
    .insert([
      {
        event_id,
        name,
        rider_nickname: typeof rider_nickname === 'string' ? rider_nickname.trim() || null : null,
        date_of_birth,
        gender,
        plate_number: plateNumber,
        plate_suffix: normalizedSuffix,
        club,
      },
    ])
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data, category_id: categoryId })
}
