import { NextResponse } from 'next/server'
import { randomBytes, randomUUID } from 'crypto'
import { adminClient } from '../../../../../../lib/auth'
import {
  getExactPrimaryCategoryCandidates,
  getFallbackPrimaryCategoryCandidates,
  getCategoryMaxYear,
  calculateAgeOnDate,
} from '../../../../../../lib/categoryAssignment'
import { normalizePlateNumber, normalizePlateSuffix } from '../../../../../../lib/plate'
import { buildCategoryOccupancyMap } from '../../../../../../services/categoryOccupancy'
import { rateLimit } from '../../../../../../lib/rateLimit'
import {
  getPendingRegistrationUploadPrefix,
  getRegistrationFileKind,
  prepareRegistrationUploadFile,
  REGISTRATION_UPLOAD_BUCKET,
  REGISTRATION_UPLOAD_CACHE_CONTROL_SECONDS,
  removeRegistrationStorageObjects,
  uploadRegistrationStorageObject,
} from '../../../../../../lib/registrationUploads'

type RegistrationItemInput = {
  rider_name: string
  rider_nickname?: string | null
  jersey_size?: string | null
  date_of_birth: string
  gender: 'BOY' | 'GIRL'
  club?: string | null
  primary_category_id?: string | null
  extra_category_id?: string | null
  bundle_id?: string | null
  requested_plate_number?: string | null
  requested_plate_suffix?: string | null
  photo_url?: string | null
  document_url?: string | null
  source_item_index?: number
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
      bundle_id: string | null
      bundle_name: string | null
      bundle_price: number
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
  payment?: {
    bank_name?: string
    account_name?: string
    account_number?: string
    proof_url?: string
  }
  event_bundle?: {
    offer_id: string
    paired_event_id: string
    items: RegistrationItemInput[]
  }
}

type RegistrationRow = {
  id: string
  total_amount: number
  registration_code?: string | null
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
  category_basis?: 'BIRTH_YEAR' | 'AGE' | null
  age_min?: number | null
  age_max?: number | null
  capacity?: number | null
  gender: 'BOY' | 'GIRL' | 'MIX'
  label: string
}

const BASE_PRICE = 250000
const EXTRA_PRICE = 150000
const STANDARD_JERSEY_SIZES = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'] as const
const DEFAULT_JERSEY_SIZES = [...STANDARD_JERSEY_SIZES]
const DOCUMENT_TYPE = 'KK'
const REGISTRATION_PAYMENT_RETURN_SELECT =
  'id, registration_id, amount, bank_name, account_name, account_number, proof_url, status, payment_method, created_at'
const SUBMIT_REGISTRATION_LIMIT = {
  key: 'public-registration-submit',
  limit: 3,
  windowMs: 60 * 1000,
}

const normalizePendingUploadPath = (value: unknown, eventId: string, kind: 'rider-photo' | 'document' | 'payment') => {
  if (typeof value !== 'string') return null
  const path = value.trim()
  const prefix = `${getPendingRegistrationUploadPrefix(eventId)}${kind}-`
  return path.startsWith(prefix) ? path : null
}

const createRegistrationCode = () => {
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) => dateParts.find((item) => item.type === type)?.value ?? ''
  const dateCode = `${part('year')}${part('month')}${part('day')}`
  return `RPB-${dateCode}-${randomBytes(4).toString('hex').toUpperCase()}`
}

const JERSEY_SIZE_ALIAS_MAP: Record<string, string> = {
  XXL: '2XL',
}

const normalizeJerseySize = (value: unknown) => {
  if (value === undefined || value === null) return null
  const normalized = String(value).trim().toUpperCase()
  const canonical = JERSEY_SIZE_ALIAS_MAP[normalized] ?? normalized
  return canonical.length > 0 ? canonical : null
}

const toYear = (dateString: string) => {
  const d = new Date(dateString)
  if (Number.isNaN(d.getTime())) return null
  return d.getUTCFullYear()
}

const normalizePhoneDigits = (value: unknown) => {
  const raw = String(value ?? '').trim()
  const digits = raw.replace(/[^\d]/g, '').slice(0, 15)
  if (!digits) return ''
  if (raw.startsWith('+')) return digits
  if (digits.startsWith('00')) return digits.slice(2)
  return digits
}

const normalizeWhatsappDigits = (value: unknown) => {
  const digits = normalizePhoneDigits(value)
  if (!digits) return ''
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  return digits
}

const isValidWhatsappNumber = (value: unknown) => {
  const digits = normalizeWhatsappDigits(value)
  if (digits.length < 10 || digits.length > 15) return false
  return /^[1-9]\d{9,14}$/.test(digits)
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

const normalizeJerseySizeOption = (value: unknown) => {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  const canonical = JERSEY_SIZE_ALIAS_MAP[normalized] ?? normalized
  return canonical.length > 0 ? canonical : null
}

const parseJerseySizeOptions = (value: unknown) => {
  if (typeof value === 'string') {
    return value.split(',').map(normalizeJerseySizeOption).filter((item): item is string => item !== null)
  }
  if (Array.isArray(value)) {
    return value.map(normalizeJerseySizeOption).filter((item): item is string => item !== null)
  }
  return []
}

const getJerseySizeOptions = (businessSettings: unknown) => {
  if (!businessSettings || typeof businessSettings !== 'object' || Array.isArray(businessSettings)) {
    return DEFAULT_JERSEY_SIZES
  }
  const raw = (businessSettings as { jersey_size_options?: unknown }).jersey_size_options
  const parsed = parseJerseySizeOptions(raw)
  const options = parsed
    .filter((item, index, array) =>
      STANDARD_JERSEY_SIZES.includes(item as typeof STANDARD_JERSEY_SIZES[number]) && array.indexOf(item) === index
    )
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

const rollbackRegistration = async (registrationId: string, uploadedPaths: string[]) => {
  if (uploadedPaths.length > 0) {
    const { error: removeError } = (await removeRegistrationStorageObjects(uploadedPaths)) ?? {}
    if (removeError) {
      console.error('[registration] failed removing uploaded files during rollback:', removeError.message)
    }
  }

  const { error: deleteError } = await adminClient.from('registrations').delete().eq('id', registrationId)
  if (deleteError) {
    console.error('[registration] failed deleting registration during rollback:', deleteError.message)
  }
}

const createBaseRegistration = async (eventId: string, payload: RegistrationPayload, options?: { basePriceOverride?: number; basePriceOverrides?: number[] }) => {
  const { community_name, contact_name, contact_phone, contact_email, items } = payload
  if (!contact_name || !contact_phone || !Array.isArray(items) || items.length === 0) {
    return { error: 'Missing required fields' }
  }
  const normalizedContactPhone = normalizeWhatsappDigits(contact_phone)
  if (!isValidWhatsappNumber(normalizedContactPhone)) {
    return { error: 'Nomor WhatsApp belum valid. Gunakan format Indonesia 08.../62... atau internasional +60..., minimal 10 digit.' }
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
  const { data: eventRow, error: eventError } = await adminClient.from('events').select('event_date').eq('id', eventId).maybeSingle()
  if (eventError) return { error: eventError.message }
  const eventDate = typeof eventRow?.event_date === 'string' ? eventRow.event_date : null
  const latestSettingsRow = (settingsRow ?? [])[0]
  if (latestSettingsRow?.registration_open === false) {
    return { error: 'Pendaftaran untuk event ini sedang ditutup.' }
  }
  const requireJerseySize = Boolean(latestSettingsRow?.require_jersey_size)
  const jerseySizes = new Set(getJerseySizeOptions(latestSettingsRow?.business_settings))
  const riderPhotoUploadEnabled = getRiderPhotoUploadEnabled(latestSettingsRow?.business_settings)
  const basePriceRaw = Number(latestSettingsRow?.base_price)
  const extraPriceRaw = Number(latestSettingsRow?.extra_price)
  const configuredBasePrice = Number.isFinite(basePriceRaw) && basePriceRaw > 0 ? basePriceRaw : BASE_PRICE
  const basePrice = Number.isSafeInteger(options?.basePriceOverride) && Number(options?.basePriceOverride) >= 0
    ? Number(options?.basePriceOverride)
    : configuredBasePrice
  const extraPrice = Number.isFinite(extraPriceRaw) && extraPriceRaw >= 0 ? extraPriceRaw : EXTRA_PRICE
  const businessSettings = latestSettingsRow?.business_settings && typeof latestSettingsRow.business_settings === 'object'
    ? latestSettingsRow.business_settings as Record<string, unknown>
    : {}
  const bundleOptions = Array.isArray(businessSettings.registration_bundles)
    ? businessSettings.registration_bundles.filter((option): option is { id: string; name: string; price: number; enabled: boolean } =>
        Boolean(option) && typeof option === 'object' &&
        typeof (option as { id?: unknown }).id === 'string' &&
        typeof (option as { name?: unknown }).name === 'string' &&
        Number.isSafeInteger((option as { price?: unknown }).price) &&
        Number((option as { price?: unknown }).price) >= 0 &&
        Number((option as { price?: unknown }).price) <= 1_000_000_000 &&
        typeof (option as { enabled?: unknown }).enabled === 'boolean'
      )
    : []

  const { data: categories, error: catError } = await adminClient
    .from('categories')
    .select('id, event_id, year, year_min, year_max, category_basis, age_min, age_max, capacity, gender, label, enabled')
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
          category_basis?: 'BIRTH_YEAR' | 'AGE' | null
          age_min?: number | null
          age_max?: number | null
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

  for (const [itemIndex, item] of items.entries()) {
    const birthYear = toYear(item.date_of_birth ?? '')
    if (!birthYear) {
      preparedItems.push({ error: 'Invalid date_of_birth' })
      continue
    }

    if (!item.rider_name || !item.rider_nickname || !item.club?.trim() || !item.date_of_birth || !item.gender) {
      preparedItems.push({ error: 'Missing rider fields' })
      continue
    }
    const jerseySize = normalizeJerseySize(item.jersey_size)
    if (requireJerseySize && !jerseySize) {
      preparedItems.push({ error: 'Jersey size required' })
      continue
    }
    if (jerseySize && !jerseySizes.has(jerseySize)) {
      preparedItems.push({ error: 'Invalid jersey size' })
      continue
    }

    const exactCandidates = getExactPrimaryCategoryCandidates(eventCategories, birthYear, item.gender, item.date_of_birth, eventDate)
    if (exactCandidates.length === 0) {
      preparedItems.push({ error: 'Tahun lahir/gender rider tidak masuk kategori aktif event ini.' })
      continue
    }

    const availableExact = exactCandidates.find((category) => !isCategoryFull(category.id, capacityMap, workingCounts)) ?? null
    const fallbackCandidates = getFallbackPrimaryCategoryCandidates(eventCategories, birthYear, item.gender, item.date_of_birth, eventDate)
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

    const riderAge = calculateAgeOnDate(item.date_of_birth, eventDate)
    const extraIsNotOlderClass = extra && (extra.category_basis === 'AGE'
      ? riderAge == null || extra.age_min == null || extra.age_min <= riderAge
      : getCategoryMaxYear(extra) >= birthYear)
    if (extra && extraIsNotOlderClass) {
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

    const requestedBundleId = typeof item.bundle_id === 'string' ? item.bundle_id.trim() : ''
    const bundle = requestedBundleId ? bundleOptions.find((option) => option.id === requestedBundleId && option.enabled) : null
    if (requestedBundleId && !bundle) {
      preparedItems.push({ error: 'Pilihan bundling tidak tersedia. Muat ulang halaman lalu pilih kembali.' })
      continue
    }

    const requestedPlateNumber = normalizePlateNumber(item.requested_plate_number, { maxDigits: 3 })
    if (item.requested_plate_number != null && !requestedPlateNumber) {
      preparedItems.push({ error: 'Invalid requested plate number' })
      continue
    }

    const requestedPlateSuffix = normalizePlateSuffix(item.requested_plate_suffix)
    if (item.requested_plate_suffix?.trim() && !requestedPlateSuffix) {
      preparedItems.push({ error: 'Invalid requested plate suffix' })
      continue
    }

    workingCounts.set(primary.id, (workingCounts.get(primary.id) ?? 0) + 1)
    if (extra?.id) {
      workingCounts.set(extra.id, (workingCounts.get(extra.id) ?? 0) + 1)
    }

    const requestedItemBase = options?.basePriceOverrides?.[itemIndex]
    const itemBasePrice = Number.isSafeInteger(requestedItemBase) && Number(requestedItemBase) >= 0
      ? Number(requestedItemBase)
      : basePrice
    preparedItems.push({
      rider_name: item.rider_name,
      rider_nickname: item.rider_nickname ?? null,
      jersey_size: jerseySize ?? null,
      date_of_birth: item.date_of_birth,
      gender: item.gender,
      club: item.club.trim(),
      primary_category_id: primary.id,
      extra_category_id: extra?.id ?? null,
      bundle_id: bundle?.id ?? null,
      bundle_name: bundle?.name ?? null,
      bundle_price: bundle?.price ?? 0,
      requested_plate_number: requestedPlateNumber,
      requested_plate_suffix: requestedPlateSuffix,
      price: itemBasePrice + (extra ? extraPrice : 0) + (bundle?.price ?? 0),
    })
  }

  const invalid = preparedItems.find((item) => 'error' in item)
  if (invalid && 'error' in invalid) {
    return { error: invalid.error }
  }

  const validItems = preparedItems.filter(
    (item): item is Exclude<PreparedItem, { error: string }> => !('error' in item)
  )

  const submittedPlateKeys = new Set<string>()
  const submittedRiderKeys = new Set<string>()
  for (const item of validItems) {
    const riderKey = `${item.rider_name.trim().toLowerCase()}:${item.date_of_birth}`
    if (submittedRiderKeys.has(riderKey)) {
      return { error: `Rider ${item.rider_name} dengan tanggal lahir ${item.date_of_birth} terisi lebih dari satu kali.` }
    }
    submittedRiderKeys.add(riderKey)

    if (!item.requested_plate_number) continue
    const plateKey = `${item.requested_plate_number}:${item.requested_plate_suffix ?? ''}`
    if (submittedPlateKeys.has(plateKey)) {
      return {
        error: `Nomor plate ${item.requested_plate_number}${item.requested_plate_suffix ?? ''} dipakai lebih dari satu rider dalam pendaftaran ini.`,
      }
    }
    submittedPlateKeys.add(plateKey)
  }

  for (const item of validItems) {
    const [{ data: existingRiders, error: existingRiderError }, { data: existingRegistrationItems, error: existingItemError }] =
      await Promise.all([
        adminClient
          .from('riders')
          .select('id')
          .eq('event_id', eventId)
          .eq('date_of_birth', item.date_of_birth)
          .ilike('name', item.rider_name.trim())
          .limit(1),
        adminClient
          .from('registration_items')
          .select('id, registrations!inner(event_id, status)')
          .eq('date_of_birth', item.date_of_birth)
          .ilike('rider_name', item.rider_name.trim())
          .eq('registrations.event_id', eventId)
          .neq('registrations.status', 'REJECTED')
          .neq('status', 'REJECTED')
          .limit(1),
      ])

    if (existingRiderError) return { error: existingRiderError.message }
    if (existingItemError) return { error: existingItemError.message }
    if ((existingRiders ?? []).length > 0 || (existingRegistrationItems ?? []).length > 0) {
      return {
        error: `Rider ${item.rider_name} dengan tanggal lahir ${item.date_of_birth} sudah pernah didaftarkan di event ini.`,
      }
    }
  }

  const plateNumbers = Array.from(new Set(validItems.map((item) => item.requested_plate_number).filter(Boolean))) as string[]
  for (const plateNumber of plateNumbers) {
    const [{ data: riderPlates, error: riderPlateError }, { data: pendingPlateItems, error: pendingPlateError }] =
      await Promise.all([
        adminClient
          .from('riders')
          .select('plate_suffix')
          .eq('event_id', eventId)
          .eq('plate_number', plateNumber),
        adminClient
          .from('registration_items')
          .select('requested_plate_suffix, status, registrations!inner(event_id, status)')
          .eq('requested_plate_number', plateNumber)
          .eq('registrations.event_id', eventId)
          .neq('registrations.status', 'REJECTED')
          .neq('status', 'REJECTED'),
      ])

    if (riderPlateError) return { error: riderPlateError.message }
    if (pendingPlateError) return { error: pendingPlateError.message }

    const usedSuffixes = [
      ...(riderPlates ?? []).map((row) =>
        typeof row.plate_suffix === 'string' && row.plate_suffix.trim() ? row.plate_suffix.trim().toUpperCase() : null
      ),
      ...(pendingPlateItems ?? []).map((row) =>
        typeof row.requested_plate_suffix === 'string' && row.requested_plate_suffix.trim()
          ? row.requested_plate_suffix.trim().toUpperCase()
          : null
      ),
    ]

    for (const item of validItems.filter((entry) => entry.requested_plate_number === plateNumber)) {
      const displayPlate = `${item.requested_plate_number}${item.requested_plate_suffix ?? ''}`
      if (!item.requested_plate_suffix && usedSuffixes.length > 0) {
        return { error: `Nomor plate ${plateNumber} sudah digunakan. Tambahkan suffix/huruf sebelum lanjut pendaftaran.` }
      }
      if (item.requested_plate_suffix && usedSuffixes.includes(item.requested_plate_suffix)) {
        return { error: `Plate ${displayPlate} sudah digunakan. Pilih suffix/huruf lain sebelum lanjut pendaftaran.` }
      }
    }
  }

  const totalAmount = validItems.reduce((sum, item) => sum + item.price, 0)

  // Secret token to authorize step-by-step uploads (photo/docs/payment) without login.
  const uploadToken = randomBytes(32).toString('hex')
  const registrationCode = createRegistrationCode()

  let registration: RegistrationRow | null = null
  let regError: { message: string } | null = null
  const insertWithToken = async () => {
    const { data, error } = await adminClient
      .from('registrations')
      .insert({
        event_id: eventId,
        community_name: community_name ?? null,
        contact_name,
        contact_phone: normalizedContactPhone,
        contact_email: contact_email ?? null,
        registration_code: registrationCode,
        total_amount: totalAmount,
        status: 'PENDING',
        upload_token: uploadToken,
        upload_token_created_at: new Date().toISOString(),
      })
      .select('id, total_amount, registration_code, upload_token')
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
        contact_phone: normalizedContactPhone,
        contact_email: contact_email ?? null,
        registration_code: registrationCode,
        total_amount: totalAmount,
        status: 'PENDING',
      })
      .select('id, total_amount, registration_code')
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

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const copyBundlePendingAsset = async (
  sourcePath: string | null | undefined,
  sourceEventId: string,
  targetEventId: string,
  kind: 'rider-photo' | 'document' | 'payment'
) => {
  if (!sourcePath) return null
  const sourcePrefix = `${getPendingRegistrationUploadPrefix(sourceEventId)}${kind}-`
  if (!sourcePath.startsWith(sourcePrefix)) throw new Error(`File ${kind} tidak berasal dari upload pendaftaran event ini.`)

  const storage = adminClient.storage.from(REGISTRATION_UPLOAD_BUCKET)
  const { data: file, error: downloadError } = await storage.download(sourcePath)
  if (downloadError || !file) throw new Error(`Gagal menyalin ${kind} ke event pasangan.`)

  const mime = file.type || ''
  const sourceExt = sourcePath.split('?')[0]?.split('.').pop()?.toLowerCase() ?? ''
  const extension = mime === 'application/pdf' || sourceExt === 'pdf'
    ? 'pdf'
    : mime === 'image/png' || sourceExt === 'png'
      ? 'png'
      : mime === 'image/webp' || sourceExt === 'webp'
        ? 'webp'
        : mime === 'image/avif' || sourceExt === 'avif'
          ? 'avif'
          : 'jpg'
  const contentType = extension === 'pdf' ? 'application/pdf' : `image/${extension === 'jpg' ? 'jpeg' : extension}`
  const targetPath = `${getPendingRegistrationUploadPrefix(targetEventId)}${kind}-${randomUUID()}.${extension}`
  const { error: uploadError } = await storage.upload(targetPath, Buffer.from(await file.arrayBuffer()), {
    contentType,
    cacheControl: REGISTRATION_UPLOAD_CACHE_CONTROL_SECONDS,
    upsert: false,
  })
  if (uploadError) throw new Error(`Gagal menyiapkan ${kind} untuk event pasangan.`)
  return targetPath
}

const createEventBundleRegistration = async (eventId: string, payload: RegistrationPayload) => {
  const requestedBundle = payload.event_bundle
  const pairedEventId = requestedBundle?.paired_event_id?.trim() ?? ''
  if (!requestedBundle || !pairedEventId || !Array.isArray(requestedBundle.items) || requestedBundle.items.length === 0) {
    return NextResponse.json({ error: 'Data event pasangan belum lengkap.' }, { status: 400 })
  }

  const { data: sourceSettings, error: sourceSettingsError } = await adminClient
    .from('event_settings')
    .select('base_price, business_settings')
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (sourceSettingsError) return NextResponse.json({ error: sourceSettingsError.message }, { status: 400 })

  const sourceBusiness = isPlainRecord(sourceSettings?.business_settings) ? sourceSettings.business_settings : {}
  const configuredOffer = isPlainRecord(sourceBusiness.event_bundle_offer) ? sourceBusiness.event_bundle_offer : null
  if (
    !configuredOffer || configuredOffer.enabled !== true ||
    configuredOffer.id !== requestedBundle.offer_id ||
    configuredOffer.paired_event_id !== pairedEventId ||
    !Number.isSafeInteger(configuredOffer.bundle_base_price_per_rider)
  ) {
    return NextResponse.json({ error: 'Paket event sudah tidak tersedia. Muat ulang halaman lalu coba lagi.' }, { status: 409 })
  }

  const { data: pairedEvent, error: pairedEventError } = await adminClient
    .from('events')
    .select('id, name, is_public, status')
    .eq('id', pairedEventId)
    .maybeSingle()
  if (pairedEventError) return NextResponse.json({ error: pairedEventError.message }, { status: 400 })
  if (!pairedEvent || pairedEvent.is_public === false || pairedEvent.status === 'FINISHED' || pairedEvent.id === eventId) {
    return NextResponse.json({ error: 'Event pasangan tidak tersedia.' }, { status: 400 })
  }

  const sourceItems = payload.items ?? []
  if (sourceItems.length === 0 || requestedBundle.items.length === 0 || requestedBundle.items.length > sourceItems.length) {
    return NextResponse.json({ error: 'Pilih minimal satu rider untuk event pasangan.' }, { status: 400 })
  }
  const pairedItems: RegistrationItemInput[] = []
  const pairedSourceIndexes: number[] = []
  const pairedSourceIndexSet = new Set<number>()
  for (let index = 0; index < requestedBundle.items.length; index += 1) {
    const item = requestedBundle.items[index]
    const sourceIndex = Number.isInteger(item.source_item_index) ? Number(item.source_item_index) : index
    const sourceItem = sourceItems[sourceIndex]
    if (
      !sourceItem || pairedSourceIndexSet.has(sourceIndex) ||
      String(item.rider_name ?? '').trim().toLowerCase() !== sourceItem.rider_name.trim().toLowerCase() ||
      item.date_of_birth !== sourceItem.date_of_birth
    ) {
      return NextResponse.json({ error: 'Data rider di event pasangan tidak cocok dengan rider yang dipilih.' }, { status: 400 })
    }
    pairedSourceIndexSet.add(sourceIndex)
    pairedSourceIndexes.push(sourceIndex)
    pairedItems.push({
      ...item,
      rider_name: sourceItem.rider_name,
      rider_nickname: sourceItem.rider_nickname,
      date_of_birth: sourceItem.date_of_birth,
      gender: sourceItem.gender,
      club: sourceItem.club,
    })
  }

  const { data: pairedSettings, error: pairedSettingsError } = await adminClient
    .from('event_settings')
    .select('base_price')
    .eq('event_id', pairedEventId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (pairedSettingsError) return NextResponse.json({ error: pairedSettingsError.message }, { status: 400 })
  const sourceBase = Number(sourceSettings?.base_price) > 0 ? Number(sourceSettings?.base_price) : BASE_PRICE
  const pairedBase = Number(pairedSettings?.base_price) > 0 ? Number(pairedSettings?.base_price) : BASE_PRICE
  const bundleBasePrice = Number(configuredOffer.bundle_base_price_per_rider)
  if (bundleBasePrice >= sourceBase + pairedBase) {
    return NextResponse.json({ error: 'Harga paket harus lebih rendah daripada total biaya daftar normal kedua event.' }, { status: 400 })
  }
  const sourceAllocatedBase = Math.round(bundleBasePrice * sourceBase / (sourceBase + pairedBase))
  const pairedAllocatedBase = bundleBasePrice - sourceAllocatedBase
  const sourceBasePriceOverrides = sourceItems.map((_, index) =>
    pairedSourceIndexSet.has(index) ? sourceAllocatedBase : sourceBase
  )

  const sourceCreated = await createBaseRegistration(eventId, payload, { basePriceOverrides: sourceBasePriceOverrides })
  if ('error' in sourceCreated) return NextResponse.json({ error: sourceCreated.error }, { status: 400 })

  const copiedPaths: string[] = []
  let pairedCreated: Awaited<ReturnType<typeof createBaseRegistration>> | null = null
  let orderId: string | null = null
  try {
    const pairedItemsWithAssets: RegistrationItemInput[] = []
    for (let index = 0; index < pairedItems.length; index += 1) {
      const pairedItem = pairedItems[index]
      const sourceItem = sourceItems[pairedSourceIndexes[index]]
      if (!pairedItem || !sourceItem) throw new Error('Data rider untuk event pasangan tidak valid.')
      const photoPath = await copyBundlePendingAsset(sourceItem.photo_url, eventId, pairedEventId, 'rider-photo')
      const documentPath = await copyBundlePendingAsset(sourceItem.document_url, eventId, pairedEventId, 'document')
      if (photoPath) copiedPaths.push(photoPath)
      if (documentPath) copiedPaths.push(documentPath)
      pairedItemsWithAssets.push({ ...pairedItem, photo_url: photoPath, document_url: documentPath })
    }

    pairedCreated = await createBaseRegistration(pairedEventId, {
      community_name: payload.community_name ?? null,
      contact_name: payload.contact_name,
      contact_phone: payload.contact_phone,
      contact_email: payload.contact_email ?? null,
      items: pairedItemsWithAssets,
    }, { basePriceOverride: pairedAllocatedBase })
    if ('error' in pairedCreated) throw new Error(pairedCreated.error)

    const proofPath = await copyBundlePendingAsset(payload.payment?.proof_url, eventId, pairedEventId, 'payment')
    if (!proofPath) throw new Error('Bukti pembayaran belum selesai diupload.')
    copiedPaths.push(proofPath)

    const bankName = payload.payment?.bank_name?.trim() ?? ''
    const accountName = payload.payment?.account_name?.trim() ?? ''
    const accountNumber = payload.payment?.account_number?.trim() ?? ''
    if (!bankName || !accountName || !accountNumber) throw new Error('Lengkapi data rekening pengirim.')
    const sourceProofPath = normalizePendingUploadPath(payload.payment?.proof_url, eventId, 'payment')
    if (!sourceProofPath) throw new Error('Bukti pembayaran belum selesai diupload.')

    const { data: order, error: orderError } = await adminClient
      .from('registration_bundle_orders')
      .insert({
        offer_id: String(configuredOffer.id),
        offer_name: String(configuredOffer.name),
        source_event_id: eventId,
        paired_event_id: pairedEventId,
        bundle_base_price_per_rider: bundleBasePrice,
        rider_count: pairedItems.length,
        total_amount: sourceCreated.registration.total_amount + pairedCreated.registration.total_amount,
        payment_status: 'PENDING',
        bank_name: bankName,
        account_name: accountName,
        account_number: accountNumber,
        proof_url: sourceProofPath,
      })
      .select('id')
      .single()
    if (orderError || !order) throw new Error(orderError?.message || 'Gagal membuat order paket event.')
    orderId = order.id

    const { error: linkError } = await adminClient
      .from('registrations')
      .update({ bundle_order_id: order.id })
      .in('id', [sourceCreated.registration.id, pairedCreated.registration.id])
    if (linkError) throw new Error(linkError.message)

    const finalizeEventRegistration = async (
      targetEventId: string,
      created: Exclude<typeof sourceCreated, { error: string }>,
      itemsForEvent: RegistrationItemInput[],
      eventProofPath: string
    ) => {
      const targetEventName = targetEventId === pairedEventId ? pairedEvent.name : 'event utama'
      const documents = itemsForEvent.map((item, index) => {
        const photoPath = normalizePendingUploadPath(item.photo_url, targetEventId, 'rider-photo')
        const documentPath = normalizePendingUploadPath(item.document_url, targetEventId, 'document')
        if (created.riderPhotoUploadEnabled && !photoPath) throw new Error(`Foto rider #${index + 1} belum selesai diupload untuk ${targetEventName}.`)
        if (!documentPath) throw new Error(`Dokumen rider #${index + 1} belum selesai diupload untuk ${targetEventName}.`)
        return { itemId: created.itemRows[index].id, photoPath, documentPath }
      })

      for (const document of documents) {
        if (!document.photoPath) continue
        const { error } = await adminClient.from('registration_items').update({ photo_url: document.photoPath }).eq('id', document.itemId).eq('registration_id', created.registration.id)
        if (error) throw new Error(error.message)
      }
      const { error: documentsError } = await adminClient.from('registration_documents').insert(documents.map((document) => ({
        registration_id: created.registration.id,
        registration_item_id: document.itemId,
        document_type: DOCUMENT_TYPE,
        file_url: document.documentPath,
      })))
      if (documentsError) throw new Error(documentsError.message)

      const { data: payment, error: paymentError } = await adminClient.from('registration_payments').insert({
        registration_id: created.registration.id,
        amount: created.registration.total_amount,
        bank_name: bankName,
        account_name: accountName,
        account_number: accountNumber,
        proof_url: eventProofPath,
        status: 'PENDING',
        payment_method: 'MANUAL_TRANSFER',
      }).select(REGISTRATION_PAYMENT_RETURN_SELECT).single()
      if (paymentError) throw new Error(paymentError.message)
      return payment
    }

    const sourcePayment = await finalizeEventRegistration(eventId, sourceCreated, sourceItems, sourceProofPath)
    const pairedPayment = await finalizeEventRegistration(pairedEventId, pairedCreated, pairedItemsWithAssets, proofPath)

    return NextResponse.json({ data: {
      bundle_order: order,
      total_amount: sourceCreated.registration.total_amount + pairedCreated.registration.total_amount,
      registrations: [
        { event_id: eventId, event_name: 'Event utama', registration: sourceCreated.registration, items: sourceCreated.itemRows, payment: sourcePayment },
        { event_id: pairedEventId, event_name: pairedEvent.name, registration: pairedCreated.registration, items: pairedCreated.itemRows, payment: pairedPayment },
      ],
    } })
  } catch (error) {
    if (orderId) await adminClient.from('registration_bundle_orders').delete().eq('id', orderId)
    await rollbackRegistration(sourceCreated.registration.id, [])
    if (pairedCreated && !('error' in pairedCreated)) await rollbackRegistration(pairedCreated.registration.id, [])
    await removeRegistrationStorageObjects(copiedPaths)
    const message = error instanceof Error ? error.message : 'Gagal menyimpan pendaftaran paket event.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const limited = await rateLimit(req, SUBMIT_REGISTRATION_LIMIT)
  if (!limited.ok) return limited.response

  const { eventId } = await params
  const { payload, formData, isMultipart } = await parseRequest(req)
  if (!payload) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  if (payload.event_bundle) {
    if (isMultipart) return NextResponse.json({ error: 'Paket event harus dikirim setelah semua file selesai diupload.' }, { status: 400 })
    return createEventBundleRegistration(eventId, payload)
  }

  const created = await createBaseRegistration(eventId, payload)
  if ('error' in created) {
    return NextResponse.json({ error: created.error }, { status: 400 })
  }

  const { registration, itemRows, riderPhotoUploadEnabled } = created

  if (!isMultipart || !formData) {
    const usesPreuploadedFiles = Boolean(
      payload.payment ||
        payload.items?.some((item) => Boolean(item.photo_url || item.document_url))
    )
    if (!usesPreuploadedFiles) {
      return NextResponse.json({ data: { registration, items: itemRows, upload_token: registration.upload_token ?? null } })
    }

    try {
      const payloadItems = payload.items ?? []
      const payment = payload.payment
      if (payloadItems.length !== itemRows.length) {
        throw new Error('Jumlah file rider tidak sesuai dengan data pendaftaran.')
      }

      const documents = payloadItems.map((item, index) => {
        const photoPath = normalizePendingUploadPath(item.photo_url, eventId, 'rider-photo')
        const documentPath = normalizePendingUploadPath(item.document_url, eventId, 'document')

        if (riderPhotoUploadEnabled && !photoPath) {
          throw new Error(`Foto rider #${index + 1} belum selesai diupload.`)
        }
        if (!documentPath) {
          throw new Error(`Dokumen rider #${index + 1} belum selesai diupload.`)
        }

        return {
          itemId: itemRows[index].id,
          photoPath,
          documentPath,
        }
      })

      const bankName = typeof payment?.bank_name === 'string' ? payment.bank_name.trim() : ''
      const accountName = typeof payment?.account_name === 'string' ? payment.account_name.trim() : ''
      const accountNumber = typeof payment?.account_number === 'string' ? payment.account_number.trim() : ''
      const proofPath = normalizePendingUploadPath(payment?.proof_url, eventId, 'payment')

      if (!bankName) throw new Error('Bank pengirim wajib diisi.')
      if (!accountName) throw new Error('Nama pengirim wajib diisi.')
      if (!accountNumber) throw new Error('Nomor rekening pengirim wajib diisi.')
      if (!proofPath) throw new Error('Bukti pembayaran belum selesai diupload.')

      for (const document of documents) {
        if (document.photoPath) {
          const { error } = await adminClient
            .from('registration_items')
            .update({ photo_url: document.photoPath })
            .eq('id', document.itemId)
            .eq('registration_id', registration.id)
          if (error) throw new Error(error.message)
        }
      }

      const { error: documentsError } = await adminClient.from('registration_documents').insert(
        documents.map((document) => ({
          registration_id: registration.id,
          registration_item_id: document.itemId,
          document_type: DOCUMENT_TYPE,
          file_url: document.documentPath,
        }))
      )
      if (documentsError) throw new Error(documentsError.message)

      const { data: paymentRow, error: paymentError } = await adminClient
        .from('registration_payments')
        .insert({
          registration_id: registration.id,
          amount: registration.total_amount,
          bank_name: bankName,
          account_name: accountName,
          account_number: accountNumber,
          proof_url: proofPath,
          status: 'PENDING',
          payment_method: 'MANUAL_TRANSFER',
        })
        .select(REGISTRATION_PAYMENT_RETURN_SELECT)
        .single()
      if (paymentError) throw new Error(paymentError.message)

      return NextResponse.json({
        data: {
          registration,
          items: itemRows,
          upload_token: registration.upload_token ?? null,
          payment: paymentRow,
        },
      })
    } catch (error) {
      await rollbackRegistration(registration.id, [])
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Gagal menyimpan file pendaftaran.' },
        { status: 400 }
      )
    }
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

        const docKind = getRegistrationFileKind(docFile)
        if (!docKind.isImage && !docKind.isPdf) {
          throw new Error(`Dokumen KK/Akte rider #${idx + 1} harus berupa gambar atau PDF.`)
        }
        const docUpload = await prepareRegistrationUploadFile(docFile, {
          kind: 'document',
          label: `Dokumen KK/Akte rider #${idx + 1}`,
        })
        const photoPath =
          riderPhotoUploadEnabled && photoFile instanceof File
            ? `events/${eventId}/${registration.id}/${itemRow.id}-photo-${Date.now()}-${idx}.webp`
            : null
        const docPath = `events/${eventId}/${registration.id}/${itemRow.id}-${DOCUMENT_TYPE}-${Date.now()}-${idx}.${docUpload.extension}`

        if (photoPath && photoFile instanceof File) {
          const photoUpload = await prepareRegistrationUploadFile(photoFile, {
            kind: 'rider-photo',
            label: `Foto rider #${idx + 1}`,
          })
          await uploadRegistrationStorageObject(photoPath, photoUpload)
          uploadedPaths.push(photoPath)

          const { error: updatePhotoError } = await adminClient
            .from('registration_items')
            .update({ photo_url: photoPath })
            .eq('id', itemRow.id)
            .eq('registration_id', registration.id)

          if (updatePhotoError) throw new Error(updatePhotoError.message)
        }

        await uploadRegistrationStorageObject(docPath, docUpload)
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

    const paymentKind = getRegistrationFileKind(paymentProof)
    if (!paymentKind.isImage && !paymentKind.isPdf) {
      throw new Error('Bukti pembayaran harus berupa gambar atau PDF.')
    }
    const paymentUpload = await prepareRegistrationUploadFile(paymentProof, {
      kind: 'payment',
      label: 'Bukti pembayaran',
    })
    const paymentPath = `events/${eventId}/${registration.id}/payment-${Date.now()}.${paymentUpload.extension}`
    await uploadRegistrationStorageObject(paymentPath, paymentUpload)
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
      .select(REGISTRATION_PAYMENT_RETURN_SELECT)
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
