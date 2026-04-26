import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../../lib/auth'
import { buildCategoryOccupancyMap } from '../../../../../../../services/categoryOccupancy'

const REGISTRATION_BUCKET = process.env.NEXT_PUBLIC_REGISTRATION_BUCKET || 'registration-docs'
const RIDER_PHOTO_BUCKET = 'rider-photos'

const ensureRiderPhotoBucket = async () => {
  const { data, error } = await adminClient.storage.getBucket(RIDER_PHOTO_BUCKET)
  if (data && !error) return

  const { error: createError } = await adminClient.storage.createBucket(RIDER_PHOTO_BUCKET, {
    public: true,
  })
  if (createError && !createError.message.toLowerCase().includes('already exists')) {
    throw createError
  }
}

const extractStoragePath = (value: string, bucket: string) => {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^https?:\/\//i.test(trimmed)) return trimmed.replace(/^\/+/, '')

  try {
    const url = new URL(trimmed)
    const prefixes = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
      `/storage/v1/object/authenticated/${bucket}/`,
    ]

    for (const prefix of prefixes) {
      const index = url.pathname.indexOf(prefix)
      if (index < 0) continue
      const relativePath = url.pathname.slice(index + prefix.length)
      return decodeURIComponent(relativePath)
    }
  } catch {
    return null
  }

  return null
}

const pickImageExt = (path: string) => {
  const withoutQuery = path.split('?')[0] ?? path
  const ext = withoutQuery.split('.').pop()?.toLowerCase()
  if (!ext) return 'jpg'
  if (ext === 'jpeg') return 'jpg'
  if (ext === 'png' || ext === 'webp' || ext === 'gif' || ext === 'bmp' || ext === 'avif') return ext
  return 'jpg'
}

const mimeTypeByExt: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
}

const syncRegistrationPhotoToRider = async (
  eventId: string,
  riderId: string,
  registrationPhoto: string | null | undefined
) => {
  if (!registrationPhoto) return

  const sourcePath = extractStoragePath(registrationPhoto, REGISTRATION_BUCKET)
  if (!sourcePath) return

  try {
    const sourceStorage = adminClient.storage.from(REGISTRATION_BUCKET)
    const { data: sourceFile, error: downloadError } = await sourceStorage.download(sourcePath)
    if (downloadError || !sourceFile) {
      console.error(`[registration-approval] failed download photo for rider ${riderId}`, downloadError?.message)
      return
    }

    await ensureRiderPhotoBucket()
    const riderStorage = adminClient.storage.from(RIDER_PHOTO_BUCKET)

    const ext = pickImageExt(sourcePath)
    const contentType = sourceFile.type || mimeTypeByExt[ext] || 'image/jpeg'
    const payload = Buffer.from(await sourceFile.arrayBuffer())
    const fullPath = `events/${eventId}/riders/${riderId}/full.${ext}`
    const thumbPath = `events/${eventId}/riders/${riderId}/thumb.${ext}`

    const { error: fullError } = await riderStorage.upload(fullPath, payload, {
      contentType,
      upsert: true,
    })
    if (fullError) {
      console.error(`[registration-approval] failed upload full photo for rider ${riderId}`, fullError.message)
      return
    }

    const { error: thumbError } = await riderStorage.upload(thumbPath, payload, {
      contentType,
      upsert: true,
    })
    if (thumbError) {
      console.error(`[registration-approval] failed upload thumb photo for rider ${riderId}`, thumbError.message)
      return
    }

    const version = Date.now()
    const photoUrl = `${riderStorage.getPublicUrl(fullPath).data.publicUrl}?v=${version}`
    const thumbUrl = `${riderStorage.getPublicUrl(thumbPath).data.publicUrl}?v=${version}`
    const { error: updateError } = await adminClient
      .from('riders')
      .update({ photo_url: photoUrl, photo_thumbnail_url: thumbUrl })
      .eq('id', riderId)
    if (updateError) {
      console.error(`[registration-approval] failed update photo url for rider ${riderId}`, updateError.message)
    }
  } catch (error) {
    console.error(`[registration-approval] failed syncing photo for rider ${riderId}`, error)
  }
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

type ApprovalItem = {
  id: string
  plate_number?: string | null
  plate_suffix?: string | null
}

const normalizePlateNumber = (value: unknown) => {
  if (value === undefined || value === null) return null
  const raw = String(value).trim()
  if (!raw) return null
  if (!/^\d+$/.test(raw)) return null
  return raw
}

const normalizeSuffix = (value?: string | null) => {
  if (!value) return null
  const trimmed = value.trim().toUpperCase()
  if (!trimmed.length) return null
  const suffix = trimmed[0]
  return /^[A-Z]$/.test(suffix) ? suffix : null
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string; registrationId: string }> }
) {
  const { eventId, registrationId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const { status, notes, items }: { status?: string; notes?: string; items?: ApprovalItem[] } = body
  if (status !== 'APPROVED' && status !== 'REJECTED') {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { error: regError } = await adminClient
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
      .select('id, year, year_min, year_max, gender, capacity, label')
      .in('id', Array.from(categoryIds))
    if (catError) return NextResponse.json({ error: catError.message }, { status: 400 })

    const capacityMap = new Map(
      (categories ?? []).map((c) => [c.id, { capacity: c.capacity as number | null, label: c.label as string }])
    )
    const hasCapacity = Array.from(capacityMap.values()).some((c) => typeof c.capacity === 'number')

    if (hasCapacity) {
      let currentCounts = new Map<string, number>()
      try {
        currentCounts = await buildCategoryOccupancyMap(
          eventId,
          (categories ?? []) as Array<{
            id: string
            year: number
            year_min?: number | null
            year_max?: number | null
            gender: 'BOY' | 'GIRL' | 'MIX'
          }>,
          { excludePendingRegistrationId: registrationId }
        )
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Failed to count category occupancy' },
          { status: 400 }
        )
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
    const plateNumber = normalizePlateNumber(input?.plate_number ?? item.requested_plate_number)
    const plateSuffix = normalizeSuffix(input?.plate_suffix ?? item.requested_plate_suffix)
    if (!plateNumber) {
      return NextResponse.json({ error: `Plate number invalid untuk ${item.rider_name}` }, { status: 400 })
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
    const plateNumber = normalizePlateNumber(input?.plate_number ?? item.requested_plate_number)
    const plateSuffix = normalizeSuffix(input?.plate_suffix ?? item.requested_plate_suffix)
    if (!plateNumber) {
      return NextResponse.json({ error: `Plate number invalid untuk ${item.rider_name}` }, { status: 400 })
    }
    const birthYear = Number(String(item.date_of_birth).slice(0, 4))
    if (Number.isNaN(birthYear)) {
      return NextResponse.json({ error: `Invalid date_of_birth for ${item.rider_name}` }, { status: 400 })
    }
    const primaryCategoryId =
      typeof item.primary_category_id === 'string' && item.primary_category_id
        ? item.primary_category_id
        : await resolveCategory(eventId, birthYear, item.gender)

    const { data: riderRow, error: riderError } = await adminClient
      .from('riders')
      .insert({
        event_id: eventId,
        name: item.rider_name,
        rider_nickname: item.rider_nickname ?? null,
        jersey_size: item.jersey_size ?? null,
        date_of_birth: item.date_of_birth,
        primary_category_id: primaryCategoryId,
        gender: item.gender,
        plate_number: plateNumber,
        plate_suffix: plateSuffix,
        club: item.club ?? null,
      })
      .select('id')
      .single()
    if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })

    await syncRegistrationPhotoToRider(eventId, riderRow.id, item.photo_url as string | null | undefined)
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
  const { eventId, registrationId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await adminClient
    .from('registrations')
    .delete()
    .eq('id', registrationId)
    .eq('event_id', eventId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
