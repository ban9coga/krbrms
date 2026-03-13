import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { adminClient } from '../../../../../../lib/auth'

type RegistrationItemInput = {
  rider_name: string
  rider_nickname?: string | null
  jersey_size?: string | null
  date_of_birth: string
  gender: 'BOY' | 'GIRL'
  club?: string | null
  primary_category_id?: string | null
  extra_category_id?: string | null
  requested_plate_number?: string | null
  requested_plate_suffix?: string | null
}

type PreparedItem =
  | { error: string }
  | {
      rider_name: string
      rider_nickname: string | null
      jersey_size: string | null
      date_of_birth: string
      gender: 'BOY' | 'GIRL'
      club: string | null
      primary_category_id: string | null
      extra_category_id: string | null
      requested_plate_number: string | null
      requested_plate_suffix: string | null
      price: number
    }

type RegistrationPayload = {
  community_name?: string | null
  contact_name?: string
  contact_phone?: string
  contact_email?: string | null
  items?: RegistrationItemInput[]
}

type RegistrationRow = {
  id: string
  total_amount: number
  upload_token?: string | null
}

type RegistrationItemRow = {
  id: string
}

const BASE_PRICE = 250000
const EXTRA_PRICE = 150000
const BUCKET = process.env.NEXT_PUBLIC_REGISTRATION_BUCKET || 'registration-docs'
const JERSEY_SIZES = new Set(['XS', 'S', 'M', 'L', 'XL'])
const DOCUMENT_TYPE = 'KK'

const toYear = (dateString: string) => {
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return null
  return d.getUTCFullYear()
}

const normalizePlateNumber = (value: unknown) => {
  if (value === undefined || value === null) return null
  const raw = String(value).trim()
  if (!raw) return null
  if (!/^\d+$/.test(raw)) return null
  return raw
}

const inRange = (category: { year: number; year_min?: number | null; year_max?: number | null }, birthYear: number) => {
  const min = category.year_min ?? category.year
  const max = category.year_max ?? category.year
  return birthYear >= min && birthYear <= max
}

const resolvePrimaryCategory = (
  categories: Array<{
    id: string
    year: number
    year_min?: number | null
    year_max?: number | null
    gender: 'BOY' | 'GIRL' | 'MIX'
  }>,
  birthYear: number,
  gender: 'BOY' | 'GIRL'
) => {
  const candidates = categories.filter((category) => inRange(category, birthYear))
  const genderMatch = candidates.filter((category) => category.gender === gender)
  if (genderMatch.length > 0) {
    return (
      genderMatch.sort(
        (a, b) => (a.year_max ?? a.year) - (b.year_max ?? b.year)
      )[0] ?? null
    )
  }
  const mix = candidates.filter((category) => category.gender === 'MIX')
  return mix.sort((a, b) => (a.year_max ?? a.year) - (b.year_max ?? b.year))[0] ?? null
}

const toStringOrNull = (value: FormDataEntryValue | null) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const parseRequest = async (req: Request) => {
  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.toLowerCase().includes('multipart/form-data')) {
    const formData = await req.formData()
    const rawPayload = formData.get('payload')
    if (typeof rawPayload !== 'string') {
      return { payload: null, formData, isMultipart: true as const }
    }
    try {
      const payload = JSON.parse(rawPayload) as RegistrationPayload
      return { payload, formData, isMultipart: true as const }
    } catch {
      return { payload: null, formData, isMultipart: true as const }
    }
  }

  const payload = (await req.json().catch(() => null)) as RegistrationPayload | null
  return { payload, formData: null, isMultipart: false as const }
}

const getExt = (fileName: string, fallback: string) => {
  const fromName = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() : null
  const safe = fromName?.replace(/[^a-z0-9]/g, '')
  return safe && safe.length > 0 ? safe : fallback
}

const uploadFile = async (path: string, file: File, fallbackType: string) => {
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error } = await adminClient.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || fallbackType,
    upsert: true,
  })
  if (error) throw new Error(error.message)
}

const rollbackRegistration = async (registrationId: string, uploadedPaths: string[]) => {
  if (uploadedPaths.length > 0) {
    const { error: removeError } = await adminClient.storage.from(BUCKET).remove(uploadedPaths)
    if (removeError) {
      console.error('[registration] failed removing uploaded files during rollback:', removeError.message)
    }
  }

  const { error: deleteError } = await adminClient.from('registrations').delete().eq('id', registrationId)
  if (deleteError) {
    console.error('[registration] failed deleting registration during rollback:', deleteError.message)
  }
}

const createBaseRegistration = async (eventId: string, payload: RegistrationPayload) => {
  const { community_name, contact_name, contact_phone, contact_email, items } = payload
  if (!contact_name || !contact_phone || !Array.isArray(items) || items.length === 0) {
    return { error: 'Missing required fields' }
  }

  const { data: settingsRow, error: settingsError } = await adminClient
    .from('event_settings')
    .select('require_jersey_size, base_price, extra_price')
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (settingsError) return { error: settingsError.message }
  const latestSettingsRow = (settingsRow ?? [])[0]
  const requireJerseySize = Boolean(latestSettingsRow?.require_jersey_size)
  const basePriceRaw = Number(latestSettingsRow?.base_price)
  const extraPriceRaw = Number(latestSettingsRow?.extra_price)
  const basePrice = Number.isFinite(basePriceRaw) && basePriceRaw > 0 ? basePriceRaw : BASE_PRICE
  const extraPrice = Number.isFinite(extraPriceRaw) && extraPriceRaw >= 0 ? extraPriceRaw : EXTRA_PRICE

  const { data: categories, error: catError } = await adminClient
    .from('categories')
    .select('id, event_id, year, year_min, year_max, capacity, gender, label, enabled')
    .eq('event_id', eventId)
    .eq('enabled', true)

  if (catError) return { error: catError.message }
  const eventCategories = (categories ?? []) as Array<{
    id: string
    event_id: string
    year: number
    year_min?: number | null
    year_max?: number | null
    capacity?: number | null
    gender: 'BOY' | 'GIRL' | 'MIX'
    label: string
  }>
  if (eventCategories.length === 0) {
    return { error: 'Kategori event belum tersedia.' }
  }

  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]))

  const preparedItems: PreparedItem[] = items.map((item) => {
    const birthYear = toYear(item.date_of_birth ?? '')
    if (!birthYear) return { error: 'Invalid date_of_birth' }

    const primary = resolvePrimaryCategory(eventCategories, birthYear, item.gender)
    if (!primary) return { error: 'No matching category for rider' }

    const extra = item.extra_category_id ? categoryMap.get(item.extra_category_id) : null

    if (!item.rider_name || !item.rider_nickname || !item.date_of_birth || !item.gender) {
      return { error: 'Missing rider fields' }
    }
    if (requireJerseySize && !item.jersey_size) {
      return { error: 'Jersey size required' }
    }
    if (item.jersey_size && !JERSEY_SIZES.has(item.jersey_size)) {
      return { error: 'Invalid jersey size' }
    }
    if (item.extra_category_id && !extra) return { error: 'Invalid extra category' }
    if (extra && extra.event_id !== eventId) return { error: 'Invalid extra category' }
    if (extra && extra.id === primary.id) return { error: 'Extra category must differ from primary category' }

    const extraMin = extra ? (extra.year_min ?? extra.year) : null
    const extraMax = extra ? (extra.year_max ?? extra.year) : null
    if (extra && (birthYear < extraMin || birthYear > extraMax)) {
      return { error: 'Birth year not eligible for extra category' }
    }
    if (extra && extra.gender !== 'MIX' && extra.gender !== item.gender) {
      return { error: 'Gender not eligible for extra category' }
    }

    const requestedPlateNumber = normalizePlateNumber(item.requested_plate_number)
    if (item.requested_plate_number != null && !requestedPlateNumber) {
      return { error: 'Invalid requested plate number' }
    }

    const suffixRaw = item.requested_plate_suffix?.trim().toUpperCase() ?? null
    const requestedPlateSuffix = suffixRaw && suffixRaw.length > 0 ? suffixRaw[0] : null
    if (requestedPlateSuffix && !/^[A-Z]$/.test(requestedPlateSuffix)) {
      return { error: 'Invalid requested plate suffix' }
    }

    const price = basePrice + (extra ? extraPrice : 0)
    return {
      rider_name: item.rider_name,
      rider_nickname: item.rider_nickname ?? null,
      jersey_size: item.jersey_size ?? null,
      date_of_birth: item.date_of_birth,
      gender: item.gender,
      club: item.club ?? null,
      primary_category_id: primary.id,
      extra_category_id: extra?.id ?? null,
      requested_plate_number: requestedPlateNumber,
      requested_plate_suffix: requestedPlateSuffix,
      price,
    }
  })

  const invalid = preparedItems.find((item) => 'error' in item)
  if (invalid && 'error' in invalid) {
    return { error: invalid.error }
  }

  const validItems = preparedItems.filter(
    (item): item is Exclude<PreparedItem, { error: string }> => !('error' in item)
  )

  const capacityMap = new Map(
    (categories ?? []).map((c) => [c.id, { capacity: c.capacity as number | null, label: c.label as string }])
  )
  const hasCapacity = Array.from(capacityMap.values()).some((c) => typeof c.capacity === 'number')
  if (hasCapacity) {
    const { data: existingItems, error: existingError } = await adminClient
      .from('registration_items')
      .select('primary_category_id, extra_category_id, status, registrations!inner(event_id)')
      .eq('registrations.event_id', eventId)
      .in('status', ['PENDING', 'APPROVED'])
    if (existingError) return { error: existingError.message }

    const currentCounts = new Map<string, number>()
    for (const row of existingItems ?? []) {
      const primaryId = row.primary_category_id as string | null
      const extraId = row.extra_category_id as string | null
      if (primaryId) currentCounts.set(primaryId, (currentCounts.get(primaryId) ?? 0) + 1)
      if (extraId) currentCounts.set(extraId, (currentCounts.get(extraId) ?? 0) + 1)
    }

    const addCounts = new Map<string, number>()
    for (const item of validItems) {
      if (item.primary_category_id) {
        addCounts.set(item.primary_category_id, (addCounts.get(item.primary_category_id) ?? 0) + 1)
      }
      if (item.extra_category_id) {
        addCounts.set(item.extra_category_id, (addCounts.get(item.extra_category_id) ?? 0) + 1)
      }
    }

    for (const [catId, addCount] of addCounts) {
      const capInfo = capacityMap.get(catId)
      if (!capInfo || capInfo.capacity == null) continue
      const current = currentCounts.get(catId) ?? 0
      if (current + addCount > capInfo.capacity) {
        return { error: `Kuota kategori "${capInfo.label}" penuh.` }
      }
    }
  }

  const totalAmount = validItems.reduce((sum, item) => sum + item.price, 0)

  // Secret token to authorize step-by-step uploads (photo/docs/payment) without login.
  const uploadToken = randomBytes(32).toString('hex')

  let registration: RegistrationRow | null = null
  let regError: { message: string } | null = null
  const insertWithToken = async () => {
    const { data, error } = await adminClient
      .from('registrations')
      .insert({
        event_id: eventId,
        community_name: community_name ?? null,
        contact_name,
        contact_phone,
        contact_email: contact_email ?? null,
        total_amount: totalAmount,
        status: 'PENDING',
        upload_token: uploadToken,
        upload_token_created_at: new Date().toISOString(),
      })
      .select('id, total_amount, upload_token')
      .single()
    return { data: data as unknown as RegistrationRow | null, error: error as any }
  }
  const insertWithoutToken = async () => {
    const { data, error } = await adminClient
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
      .select('id, total_amount')
      .single()
    return { data: data as unknown as RegistrationRow | null, error: error as any }
  }

  let regInsert = await insertWithToken()
  if (regInsert.error && String(regInsert.error.message ?? '').includes('upload_token')) {
    // DB migration not applied yet: fall back to insert without token.
    regInsert = await insertWithoutToken()
  }
  registration = regInsert.data
  regError = regInsert.error ? { message: String(regInsert.error.message ?? 'Failed creating registration') } : null

  if (regError || !registration) return { error: regError?.message || 'Failed creating registration' }

  const { data: itemRows, error: itemError } = await adminClient
    .from('registration_items')
    .insert(
      validItems.map((item) => ({
        ...item,
        registration_id: registration.id,
        status: 'PENDING',
      }))
    )
    .select('id')

  if (itemError || !itemRows) return { error: itemError?.message || 'Failed creating registration items' }
  return {
    registration: registration as RegistrationRow,
    itemRows: itemRows as RegistrationItemRow[],
  }
}

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { payload, formData, isMultipart } = await parseRequest(req)
  if (!payload) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const created = await createBaseRegistration(eventId, payload)
  if ('error' in created) {
    return NextResponse.json({ error: created.error }, { status: 400 })
  }

  const { registration, itemRows } = created

  if (!isMultipart || !formData) {
    return NextResponse.json({ data: { registration, items: itemRows, upload_token: (registration as any).upload_token ?? null } })
  }

  const uploadedPaths: string[] = []

  try {
    const paymentProof = formData.get('payment_proof')
    if (!(paymentProof instanceof File)) {
      throw new Error('Payment proof is required')
    }

    const bankName = toStringOrNull(formData.get('bank_name'))
    const accountName = toStringOrNull(formData.get('account_name'))
    const accountNumber = toStringOrNull(formData.get('account_number'))

    const docsToInsert = await Promise.all(
      itemRows.map(async (itemRow, idx) => {
        const photoFile = formData.get(`rider_photo_${idx}`)
        const docFile = formData.get(`rider_doc_${idx}`)
        if (!(photoFile instanceof File)) {
          throw new Error(`Photo wajib untuk rider #${idx + 1}`)
        }
        if (!(docFile instanceof File)) {
          throw new Error(`Dokumen KK/Akte wajib untuk rider #${idx + 1}`)
        }

        const photoExt = getExt(photoFile.name, 'jpg')
        const docExt = getExt(docFile.name, 'bin')
        const photoPath = `${eventId}/${registration.id}/${itemRow.id}-photo-${Date.now()}-${idx}.${photoExt}`
        const docPath = `${eventId}/${registration.id}/${itemRow.id}-${DOCUMENT_TYPE}-${Date.now()}-${idx}.${docExt}`

        await Promise.all([
          uploadFile(photoPath, photoFile, 'image/jpeg'),
          uploadFile(docPath, docFile, 'application/octet-stream'),
        ])
        uploadedPaths.push(photoPath, docPath)

        const { error: updatePhotoError } = await adminClient
          .from('registration_items')
          .update({ photo_url: photoPath })
          .eq('id', itemRow.id)
          .eq('registration_id', registration.id)

        if (updatePhotoError) throw new Error(updatePhotoError.message)

        return {
          registration_id: registration.id,
          registration_item_id: itemRow.id,
          document_type: DOCUMENT_TYPE,
          file_url: docPath,
        }
      })
    )

    const { error: docsError } = await adminClient.from('registration_documents').insert(docsToInsert)
    if (docsError) throw new Error(docsError.message)

    const paymentExt = getExt(paymentProof.name, 'bin')
    const paymentPath = `${eventId}/${registration.id}/payment-${Date.now()}.${paymentExt}`
    await uploadFile(paymentPath, paymentProof, 'application/octet-stream')
    uploadedPaths.push(paymentPath)

    const { data: payment, error: paymentError } = await adminClient
      .from('registration_payments')
      .insert({
        registration_id: registration.id,
        amount: registration.total_amount,
        bank_name: bankName,
        account_name: accountName,
        account_number: accountNumber,
        proof_url: paymentPath,
        status: 'PENDING',
        payment_method: 'MANUAL_TRANSFER',
      })
      .select('*')
      .single()
    if (paymentError) throw new Error(paymentError.message)

    return NextResponse.json({
      data: {
        registration,
        items: itemRows,
        upload_token: (registration as any).upload_token ?? null,
        payment,
      },
    })
  } catch (error) {
    await rollbackRegistration(registration.id, uploadedPaths)
    const message = error instanceof Error ? error.message : 'Failed submitting registration'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
