import { NextResponse } from 'next/server'
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
  requested_plate_number?: number | null
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
      requested_plate_number: number | null
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
    return { error: 'Missing required fields' as const }
  }

  const { data: settingsRow, error: settingsError } = await adminClient
    .from('event_settings')
    .select('require_jersey_size')
    .eq('event_id', eventId)
    .maybeSingle()

  if (settingsError) return { error: settingsError.message as const }
  const requireJerseySize = Boolean(settingsRow?.require_jersey_size)

  const categoryIds = new Set<string>()
  for (const item of items) {
    if (item.primary_category_id) categoryIds.add(item.primary_category_id)
    if (item.extra_category_id) categoryIds.add(item.extra_category_id)
  }

  const { data: categories, error: catError } = await adminClient
    .from('categories')
    .select('id, event_id, year, year_min, year_max, capacity, gender, label')
    .in('id', Array.from(categoryIds))

  if (catError) return { error: catError.message as const }
  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]))

  const preparedItems: PreparedItem[] = items.map((item) => {
    const birthYear = toYear(item.date_of_birth ?? '')
    const primary = item.primary_category_id ? categoryMap.get(item.primary_category_id) : null
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
    if (!birthYear) return { error: 'Invalid date_of_birth' }
    if (primary && primary.event_id !== eventId) return { error: 'Invalid primary category' }
    if (extra && extra.event_id !== eventId) return { error: 'Invalid extra category' }

    const primaryMin = primary ? (primary.year_min ?? primary.year) : null
    const primaryMax = primary ? (primary.year_max ?? primary.year) : null
    if (primary && (birthYear < primaryMin || birthYear > primaryMax)) {
      return { error: 'Birth year not eligible for selected category' }
    }
    if (primary && primary.gender !== 'MIX' && primary.gender !== item.gender) {
      return { error: 'Gender not eligible for selected category' }
    }

    const extraMin = extra ? (extra.year_min ?? extra.year) : null
    const extraMax = extra ? (extra.year_max ?? extra.year) : null
    if (extra && (birthYear < extraMin || birthYear > extraMax)) {
      return { error: 'Birth year not eligible for extra category' }
    }
    if (extra && extra.gender !== 'MIX' && extra.gender !== item.gender) {
      return { error: 'Gender not eligible for extra category' }
    }

    const price = BASE_PRICE + (extra ? EXTRA_PRICE : 0)
    return {
      rider_name: item.rider_name,
      rider_nickname: item.rider_nickname ?? null,
      jersey_size: item.jersey_size ?? null,
      date_of_birth: item.date_of_birth,
      gender: item.gender,
      club: item.club ?? null,
      primary_category_id: item.primary_category_id ?? null,
      extra_category_id: item.extra_category_id ?? null,
      requested_plate_number: item.requested_plate_number ?? null,
      requested_plate_suffix: item.requested_plate_suffix ?? null,
      price,
    }
  })

  const invalid = preparedItems.find((item) => 'error' in item)
  if (invalid && 'error' in invalid) {
    return { error: invalid.error as const }
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
    if (existingError) return { error: existingError.message as const }

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
        return { error: `Kuota kategori "${capInfo.label}" penuh.` as const }
      }
    }
  }

  const totalAmount = validItems.reduce((sum, item) => sum + item.price, 0)

  const { data: registration, error: regError } = await adminClient
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
  if (regError || !registration) return { error: regError?.message || 'Failed creating registration' as const }

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

  if (itemError || !itemRows) return { error: itemError?.message || 'Failed creating registration items' as const }
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
    return NextResponse.json({ data: { registration, items: itemRows } })
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
        payment,
      },
    })
  } catch (error) {
    await rollbackRegistration(registration.id, uploadedPaths)
    const message = error instanceof Error ? error.message : 'Failed submitting registration'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
