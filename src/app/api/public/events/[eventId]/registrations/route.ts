import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { adminClient } from '../../../../../../lib/auth'
import {
  getExactPrimaryCategoryCandidates,
  getFallbackPrimaryCategoryCandidates,
  getCategoryMaxYear,
} from '../../../../../../lib/categoryAssignment'
import { buildCategoryOccupancyMap } from '../../../../../../services/categoryOccupancy'
import { isPdfFile, prepareImageUpload, preparePassthroughUpload, type PreparedUpload } from '../../../../../../lib/imageUpload'

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

type EventCategory = {
  id: string
  event_id: string
  year: number
  year_min?: number | null
  year_max?: number | null
  capacity?: number | null
  gender: 'BOY' | 'GIRL' | 'MIX'
  label: string
}

const BASE_PRICE = 250000
const EXTRA_PRICE = 150000
const BUCKET = process.env.NEXT_PUBLIC_REGISTRATION_BUCKET || 'registration-docs'
const DEFAULT_JERSEY_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']
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

const isCategoryFull = (
  categoryId: string,
  capacityMap: Map<string, { capacity: number | null; label: string }>,
  counts: Map<string, number>
) => {
  const capacity = capacityMap.get(categoryId)?.capacity
  return capacity != null && (counts.get(categoryId) ?? 0) >= capacity
}

const toStringOrNull = (value: FormDataEntryValue | null) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())

const getJerseySizeOptions = (businessSettings: unknown) => {
  if (!businessSettings || typeof businessSettings !== 'object' || Array.isArray(businessSettings)) {
    return DEFAULT_JERSEY_SIZES
  }
  const raw = (businessSettings as { jersey_size_options?: unknown }).jersey_size_options
  if (!Array.isArray(raw)) return DEFAULT_JERSEY_SIZES
  const options = raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
  return options.length > 0 ? options : DEFAULT_JERSEY_SIZES
}

const getRiderPhotoUploadEnabled = (businessSettings: unknown) => {
  if (!businessSettings || typeof businessSettings !== 'object' || Array.isArray(businessSettings)) {
    return true
  }
  const raw = (businessSettings as { registration_rider_photo_enabled?: unknown }).registration_rider_photo_enabled
  return typeof raw === 'boolean' ? raw : true
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

const uploadPreparedFile = async (path: string, upload: PreparedUpload) => {
  const { error } = await adminClient.storage.from(BUCKET).upload(path, upload.buffer, {
    contentType: upload.contentType,
    cacheControl: '31536000',
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
  if (contact_email && !isValidEmail(contact_email)) {
    return { error: 'Format email tidak valid.' }
  }

  const { data: settingsRow, error: settingsError } = await adminClient
    .from('event_settings')
    .select('require_jersey_size, base_price, extra_price, registration_open, business_settings')
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (settingsError) return { error: settingsError.message }
  const latestSettingsRow = (settingsRow ?? [])[0]
  if (latestSettingsRow?.registration_open === false) {
    return { error: 'Pendaftaran untuk event ini sedang ditutup.' }
  }
  const requireJerseySize = Boolean(latestSettingsRow?.require_jersey_size)
  const jerseySizes = new Set(getJerseySizeOptions(latestSettingsRow?.business_settings))
  const riderPhotoUploadEnabled = getRiderPhotoUploadEnabled(latestSettingsRow?.business_settings)
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
  const eventCategories = (categories ?? []) as EventCategory[]
  if (eventCategories.length === 0) {
    return { error: 'Kategori event belum tersedia.' }
  }

  const capacityMap = new Map(
    (categories ?? []).map((c) => [c.id, { capacity: c.capacity as number | null, label: c.label as string }])
  )
  let currentCounts = new Map<string, number>()
  const hasCapacity = Array.from(capacityMap.values()).some((c) => typeof c.capacity === 'number')
  if (hasCapacity) {
    try {
      currentCounts = await buildCategoryOccupancyMap(
        eventId,
        (categories ?? []) as Array<{
          id: string
          year: number
          year_min?: number | null
          year_max?: number | null
          gender: 'BOY' | 'GIRL' | 'MIX'
        }>
      )
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to count category occupancy' }
    }
  }

  const categoryMap = new Map(eventCategories.map((category) => [category.id, category]))
  const workingCounts = new Map(currentCounts)
  const preparedItems: PreparedItem[] = []

  for (const item of items) {
    const birthYear = toYear(item.date_of_birth ?? '')
    if (!birthYear) {
      preparedItems.push({ error: 'Invalid date_of_birth' })
      continue
    }

    if (!item.rider_name || !item.rider_nickname || !item.date_of_birth || !item.gender) {
      preparedItems.push({ error: 'Missing rider fields' })
      continue
    }
    if (requireJerseySize && !item.jersey_size) {
      preparedItems.push({ error: 'Jersey size required' })
      continue
    }
    if (item.jersey_size && !jerseySizes.has(item.jersey_size)) {
      preparedItems.push({ error: 'Invalid jersey size' })
      continue
    }

    const exactCandidates = getExactPrimaryCategoryCandidates(eventCategories, birthYear, item.gender)
    if (exactCandidates.length === 0) {
      preparedItems.push({ error: 'Tahun lahir/gender rider tidak masuk kategori aktif event ini.' })
      continue
    }

    const availableExact = exactCandidates.find((category) => !isCategoryFull(category.id, capacityMap, workingCounts)) ?? null
    const fallbackCandidates = getFallbackPrimaryCategoryCandidates(eventCategories, birthYear, item.gender)
      .filter((category) => !isCategoryFull(category.id, capacityMap, workingCounts))

    let primary = availableExact
    if (!primary) {
      if (!item.primary_category_id) {
        preparedItems.push({ error: 'Kategori utama sesuai umur penuh. Pilih kategori pengganti yang tersedia.' })
        continue
      }
      primary = fallbackCandidates.find((category) => category.id === item.primary_category_id) ?? null
      if (!primary) {
        preparedItems.push({ error: 'Kategori pengganti tidak valid untuk rider ini.' })
        continue
      }
    } else if (item.primary_category_id && item.primary_category_id !== primary.id) {
      preparedItems.push({ error: 'Kategori utama sesuai umur masih tersedia.' })
      continue
    }

    const extra = item.extra_category_id ? categoryMap.get(item.extra_category_id) : null
    if (item.extra_category_id && !extra) {
      preparedItems.push({ error: 'Invalid extra category' })
      continue
    }
    if (extra && extra.event_id !== eventId) {
      preparedItems.push({ error: 'Invalid extra category' })
      continue
    }
    if (extra && extra.id === primary.id) {
      preparedItems.push({ error: 'Extra category must differ from primary category' })
      continue
    }

    const extraMax = extra ? getCategoryMaxYear(extra) : null
    if (extra && extraMax !== null && extraMax >= birthYear) {
      preparedItems.push({ error: 'Extra category must be above rider birth year' })
      continue
    }
    if (extra && extra.gender !== 'MIX' && extra.gender !== item.gender) {
      preparedItems.push({ error: 'Gender must match for extra category' })
      continue
    }
    if (extra && isCategoryFull(extra.id, capacityMap, workingCounts)) {
      preparedItems.push({ error: `Kuota kategori "${extra.label}" penuh.` })
      continue
    }

    const requestedPlateNumber = normalizePlateNumber(item.requested_plate_number)
    if (item.requested_plate_number != null && !requestedPlateNumber) {
      preparedItems.push({ error: 'Invalid requested plate number' })
      continue
    }

    const suffixRaw = item.requested_plate_suffix?.trim().toUpperCase() ?? null
    const requestedPlateSuffix = suffixRaw && suffixRaw.length > 0 ? suffixRaw[0] : null
    if (requestedPlateSuffix && !/^[A-Z]$/.test(requestedPlateSuffix)) {
      preparedItems.push({ error: 'Invalid requested plate suffix' })
      continue
    }

    workingCounts.set(primary.id, (workingCounts.get(primary.id) ?? 0) + 1)
    if (extra?.id) {
      workingCounts.set(extra.id, (workingCounts.get(extra.id) ?? 0) + 1)
    }

    preparedItems.push({
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
      price: basePrice + (extra ? extraPrice : 0),
    })
  }

  const invalid = preparedItems.find((item) => 'error' in item)
  if (invalid && 'error' in invalid) {
    return { error: invalid.error }
  }

  const validItems = preparedItems.filter(
    (item): item is Exclude<PreparedItem, { error: string }> => !('error' in item)
  )

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
    return {
      data: data as RegistrationRow | null,
      error: error ? { message: String(error.message ?? 'Failed creating registration') } : null,
    }
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
    return {
      data: data as RegistrationRow | null,
      error: error ? { message: String(error.message ?? 'Failed creating registration') } : null,
    }
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
    riderPhotoUploadEnabled,
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

  const { registration, itemRows, riderPhotoUploadEnabled } = created

  if (!isMultipart || !formData) {
    return NextResponse.json({ data: { registration, items: itemRows, upload_token: registration.upload_token ?? null } })
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

    if (!bankName) {
      throw new Error('Bank pengirim wajib diisi.')
    }
    if (!accountName) {
      throw new Error('Nama pengirim wajib diisi.')
    }
    if (!accountNumber) {
      throw new Error('Nomor rekening pengirim wajib diisi.')
    }

    const docsToInsert = await Promise.all(
      itemRows.map(async (itemRow, idx) => {
        const photoFile = formData.get(`rider_photo_${idx}`)
        const docFile = formData.get(`rider_doc_${idx}`)
        if (riderPhotoUploadEnabled && !(photoFile instanceof File)) {
          throw new Error(`Photo wajib untuk rider #${idx + 1}`)
        }
        if (!(docFile instanceof File)) {
          throw new Error(`Dokumen KK/Akte wajib untuk rider #${idx + 1}`)
        }

        const docIsPdf = isPdfFile(docFile)
        if (!docFile.type.startsWith('image/') && !docIsPdf) {
          throw new Error(`Dokumen KK/Akte rider #${idx + 1} harus berupa gambar atau PDF.`)
        }
        const docUpload = docIsPdf
          ? await preparePassthroughUpload(docFile, {
              maxBytes: 3 * 1024 * 1024,
              contentType: 'application/pdf',
              extension: 'pdf',
              label: `Dokumen KK/Akte rider #${idx + 1}`,
            })
          : await prepareImageUpload(docFile, {
              maxBytes: 2 * 1024 * 1024,
              maxDimension: 1200,
              quality: 78,
              label: `Dokumen KK/Akte rider #${idx + 1}`,
            })
        const photoPath =
          riderPhotoUploadEnabled && photoFile instanceof File
            ? `${eventId}/${registration.id}/${itemRow.id}-photo-${Date.now()}-${idx}.webp`
            : null
        const docPath = `${eventId}/${registration.id}/${itemRow.id}-${DOCUMENT_TYPE}-${Date.now()}-${idx}.${docUpload.extension}`

        if (photoPath && photoFile instanceof File) {
          const photoUpload = await prepareImageUpload(photoFile, {
            maxBytes: 1.5 * 1024 * 1024,
            maxDimension: 500,
            quality: 78,
            label: `Foto rider #${idx + 1}`,
          })
          await uploadPreparedFile(photoPath, photoUpload)
          uploadedPaths.push(photoPath)

          const { error: updatePhotoError } = await adminClient
            .from('registration_items')
            .update({ photo_url: photoPath })
            .eq('id', itemRow.id)
            .eq('registration_id', registration.id)

          if (updatePhotoError) throw new Error(updatePhotoError.message)
        }

        await uploadPreparedFile(docPath, docUpload)
        uploadedPaths.push(docPath)

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

    const paymentIsPdf = isPdfFile(paymentProof)
    if (!paymentProof.type.startsWith('image/') && !paymentIsPdf) {
      throw new Error('Bukti pembayaran harus berupa gambar atau PDF.')
    }
    const paymentUpload = paymentIsPdf
      ? await preparePassthroughUpload(paymentProof, {
          maxBytes: 3 * 1024 * 1024,
          contentType: 'application/pdf',
          extension: 'pdf',
          label: 'Bukti pembayaran',
        })
      : await prepareImageUpload(paymentProof, {
          maxBytes: 2 * 1024 * 1024,
          maxDimension: 1200,
          quality: 78,
          label: 'Bukti pembayaran',
        })
    const paymentPath = `${eventId}/${registration.id}/payment-${Date.now()}.${paymentUpload.extension}`
    await uploadPreparedFile(paymentPath, paymentUpload)
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
        upload_token: registration.upload_token ?? null,
        payment,
      },
    })
  } catch (error) {
    await rollbackRegistration(registration.id, uploadedPaths)
    const message = error instanceof Error ? error.message : 'Failed submitting registration'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

