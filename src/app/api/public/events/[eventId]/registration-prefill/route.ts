import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { rateLimit } from '../../../../../../lib/rateLimit'
import {
  getPendingRegistrationUploadPrefix,
  REGISTRATION_UPLOAD_BUCKET,
  REGISTRATION_UPLOAD_CACHE_CONTROL_SECONDS,
  SUPPORTING_IMAGE_MAX_BYTES,
  SUPPORTING_PDF_MAX_BYTES,
} from '../../../../../../lib/registrationUploads'

export const runtime = 'nodejs'

const PREFILL_LIMIT = { key: 'public-registration-prefill', limit: 10, windowMs: 60 * 1000 }

const normalizeWhatsappDigits = (value: unknown) => {
  const raw = String(value ?? '').trim()
  const digits = raw.replace(/[^\d]/g, '').slice(0, 15)
  if (!digits) return ''
  if (raw.startsWith('+')) return digits
  if (digits.startsWith('00')) return digits.slice(2)
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  return digits
}

const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase()
const getWhatsappLookupVariants = (normalizedPhone: string) => {
  const variants = new Set([normalizedPhone])
  if (normalizedPhone.startsWith('62')) variants.add(`0${normalizedPhone.slice(2)}`)
  variants.add(`+${normalizedPhone}`)
  variants.add(`00${normalizedPhone}`)
  return Array.from(variants)
}
const maskName = (value: string) => value.trim().split(/\s+/).filter(Boolean).map((part) => {
  const characters = Array.from(part)
  const visible = characters.slice(0, Math.min(3, characters.length)).join('')
  const hiddenCount = Math.max(2, Math.min(4, characters.length - Array.from(visible).length))
  return `${visible}${'•'.repeat(hiddenCount)}`
}).join(' ')

const hasValidGuardianDetails = (phone: string, email: string) =>
  /^[1-9]\d{9,14}$/.test(phone) && (!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))

const getRegistrationStoragePath = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return null
  const rawPath = value.trim().replace(/^\/+/, '')
  if (!/^https?:\/\//i.test(rawPath)) return rawPath
  try {
    const url = new URL(rawPath)
    const prefixes = [
      `/storage/v1/object/public/${REGISTRATION_UPLOAD_BUCKET}/`,
      `/storage/v1/object/sign/${REGISTRATION_UPLOAD_BUCKET}/`,
      `/storage/v1/object/authenticated/${REGISTRATION_UPLOAD_BUCKET}/`,
    ]
    for (const prefix of prefixes) {
      const index = url.pathname.indexOf(prefix)
      if (index >= 0) return decodeURIComponent(url.pathname.slice(index + prefix.length))
    }
  } catch {}
  return null
}

const getDocumentFileInfo = (path: string, contentType: string) => {
  const extension = path.split('?')[0]?.split('.').pop()?.toLowerCase() ?? ''
  if (contentType === 'application/pdf' || extension === 'pdf') {
    return { extension: 'pdf', contentType: 'application/pdf', previewType: 'pdf' as const, maxBytes: SUPPORTING_PDF_MAX_BYTES }
  }
  const imageTypes: Record<string, { extension: string; contentType: string }> = {
    jpg: { extension: 'jpg', contentType: 'image/jpeg' },
    jpeg: { extension: 'jpg', contentType: 'image/jpeg' },
    png: { extension: 'png', contentType: 'image/png' },
    webp: { extension: 'webp', contentType: 'image/webp' },
    gif: { extension: 'gif', contentType: 'image/gif' },
    bmp: { extension: 'bmp', contentType: 'image/bmp' },
    avif: { extension: 'avif', contentType: 'image/avif' },
  }
  const image = imageTypes[extension]
  if (!image && !contentType.startsWith('image/')) return null
  return {
    extension: image?.extension ?? 'jpg',
    contentType: image?.contentType ?? contentType,
    previewType: 'image' as const,
    maxBytes: SUPPORTING_IMAGE_MAX_BYTES,
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const limited = await rateLimit(req, PREFILL_LIMIT)
  if (!limited.ok) return limited.response

  const body = await req.json().catch(() => null)
  const action = body?.action
  const contactPhone = normalizeWhatsappDigits(body?.contact_phone)
  const contactEmail = normalizeEmail(body?.contact_email)
  if (!hasValidGuardianDetails(contactPhone, contactEmail)) {
    return NextResponse.json({ error: 'Isi nomor WhatsApp yang digunakan saat pendaftaran sebelumnya dan pastikan format email benar jika diisi.' }, { status: 400 })
  }

  if (action === 'lookup') {
    const { data, error } = await adminClient
      .from('registrations')
      .select('contact_email, created_at, registration_items(id, rider_name, date_of_birth)')
      .in('contact_phone', getWhatsappLookupVariants(contactPhone))
      .order('created_at', { ascending: false })
      .limit(30)

    if (error) {
      console.error('[registration-prefill] lookup failed:', error.message)
      return NextResponse.json({ error: 'Data rider sebelumnya belum dapat dimuat.' }, { status: 500 })
    }

    const uniqueRiders = new Map<string, { id: string; masked_name: string }>()
    for (const registration of data ?? []) {
      const storedEmail = normalizeEmail(registration.contact_email)
      // Legacy registrations may not have an email. Match those by phone and
      // require the rider's exact date of birth before returning any full data.
      if (storedEmail && (!contactEmail || storedEmail !== contactEmail)) continue
      for (const item of registration.registration_items ?? []) {
        if (!item?.id || typeof item.rider_name !== 'string' || typeof item.date_of_birth !== 'string') continue
        const dedupeKey = `${item.rider_name.trim().toLowerCase()}|${item.date_of_birth}`
        if (!uniqueRiders.has(dedupeKey)) {
          uniqueRiders.set(dedupeKey, { id: item.id, masked_name: maskName(item.rider_name) })
        }
        if (uniqueRiders.size >= 12) break
      }
      if (uniqueRiders.size >= 12) break
    }

    const riders = Array.from(uniqueRiders.values())
    if (riders.length === 0) {
      return NextResponse.json({ error: 'Tidak ada data rider yang cocok dengan nomor WhatsApp tersebut. Jika email tercatat saat pendaftaran lama, gunakan email yang sama.' }, { status: 404 })
    }
    return NextResponse.json({ data: { riders } })
  }

  if (action === 'load_many') {
    const requestedRiders = Array.isArray(body?.riders) ? body.riders.map((rider: { id?: unknown; date_of_birth?: unknown }) => ({
      id: typeof rider?.id === 'string' ? rider.id.trim() : '',
      date_of_birth: typeof rider?.date_of_birth === 'string' ? rider.date_of_birth.trim() : '',
    })) : []
    const riderIds = requestedRiders.map((rider: { id: string; date_of_birth: string }) => rider.id)
    if (
      requestedRiders.length === 0 || requestedRiders.length > 12 ||
      riderIds.some((id: string) => !/^[0-9a-f-]{36}$/i.test(id)) ||
      requestedRiders.some((rider: { id: string; date_of_birth: string }) => !/^\d{4}-\d{2}-\d{2}$/.test(rider.date_of_birth)) ||
      new Set(riderIds).size !== riderIds.length
    ) {
      return NextResponse.json({ error: 'Pilih rider dan masukkan tanggal lahir masing-masing dengan benar.' }, { status: 400 })
    }

    const { data, error } = await adminClient
      .from('registration_items')
      .select('id, rider_name, rider_nickname, jersey_size, date_of_birth, gender, club, requested_plate_number, requested_plate_suffix, registrations!inner(contact_phone, contact_email)')
      .in('id', riderIds)

    if (error) {
      console.error('[registration-prefill] rider verification failed:', error.message)
      return NextResponse.json({ error: 'Verifikasi data rider gagal. Coba lagi.' }, { status: 500 })
    }

    const itemsById = new Map((data ?? []).map((item) => [item.id, item]))
    const verifiedRiders = requestedRiders.map((requested: { id: string; date_of_birth: string }) => {
      const item = itemsById.get(requested.id)
      const registration = Array.isArray(item?.registrations) ? item.registrations[0] : item?.registrations
      const storedEmail = normalizeEmail(registration?.contact_email)
      const verified = item &&
        item.date_of_birth === requested.date_of_birth &&
        normalizeWhatsappDigits(registration?.contact_phone) === contactPhone &&
        (!storedEmail || storedEmail === contactEmail) &&
        (item.gender === 'BOY' || item.gender === 'GIRL')
      if (!verified) return null
      return {
        id: item.id,
        name: item.rider_name,
        nickname: item.rider_nickname,
        jersey_size: item.jersey_size,
        date_of_birth: item.date_of_birth,
        gender: item.gender,
        club: item.club,
        requested_plate_number: item.requested_plate_number,
        requested_plate_suffix: item.requested_plate_suffix,
      }
    })

    if (verifiedRiders.some((rider: unknown) => !rider)) {
      return NextResponse.json({ error: 'Tanggal lahir salah untuk satu atau beberapa rider. Periksa kembali semua tanggal lahir.' }, { status: 404 })
    }

    type VerifiedPrefillRider = {
      id: string
      name: string
      nickname: string | null
      jersey_size: string | null
      date_of_birth: string
      gender: 'BOY' | 'GIRL'
      club: string | null
      requested_plate_number: string | null
      requested_plate_suffix: string | null
    }
    const verifiedItems = verifiedRiders.filter((rider: VerifiedPrefillRider | null): rider is VerifiedPrefillRider => Boolean(rider))
    const { data: documents, error: documentsError } = await adminClient
      .from('registration_documents')
      .select('registration_item_id, document_type, file_url, created_at')
      .in('registration_item_id', riderIds)
      .in('document_type', ['KK', 'AKTE', 'KIA'])
      .order('created_at', { ascending: false })

    if (documentsError) {
      console.error('[registration-prefill] document lookup failed:', documentsError.message)
    }

    const latestDocumentByItem = new Map<string, { file_url: string; document_type: string }>()
    for (const document of documents ?? []) {
      if (document.registration_item_id && !latestDocumentByItem.has(document.registration_item_id)) {
        latestDocumentByItem.set(document.registration_item_id, document)
      }
    }

    const storage = adminClient.storage.from(REGISTRATION_UPLOAD_BUCKET)
    const ridersWithDocuments = await Promise.all(verifiedItems.map(async (rider: VerifiedPrefillRider) => {
      const document = latestDocumentByItem.get(rider.id)
      const sourcePath = getRegistrationStoragePath(document?.file_url)
      if (!sourcePath) return { ...rider, document_upload_path: null, document_preview_url: null, document_preview_type: null }

      const { data: sourceFile, error: downloadError } = await storage.download(sourcePath)
      if (downloadError || !sourceFile) {
        console.error('[registration-prefill] previous document download failed:', downloadError?.message)
        return { ...rider, document_upload_path: null, document_preview_url: null, document_preview_type: null }
      }

      const fileInfo = getDocumentFileInfo(sourcePath, sourceFile.type || '')
      if (!fileInfo || sourceFile.size > fileInfo.maxBytes) {
        return { ...rider, document_upload_path: null, document_preview_url: null, document_preview_type: null }
      }

      const pendingPath = `${getPendingRegistrationUploadPrefix(eventId)}document-${randomUUID()}.${fileInfo.extension}`
      const bytes = Buffer.from(await sourceFile.arrayBuffer())
      const { error: uploadError } = await storage.upload(pendingPath, bytes, {
        contentType: fileInfo.contentType,
        cacheControl: REGISTRATION_UPLOAD_CACHE_CONTROL_SECONDS,
        upsert: false,
      })
      if (uploadError) {
        console.error('[registration-prefill] previous document copy failed:', uploadError.message)
        return { ...rider, document_upload_path: null, document_preview_url: null, document_preview_type: null }
      }

      const { data: signedDocument, error: signedUrlError } = await storage.createSignedUrl(pendingPath, 60 * 60)
      if (signedUrlError || !signedDocument?.signedUrl) {
        await storage.remove([pendingPath])
        console.error('[registration-prefill] document preview link failed:', signedUrlError?.message)
        return { ...rider, document_upload_path: null, document_preview_url: null, document_preview_type: null }
      }

      return {
        ...rider,
        document_upload_path: pendingPath,
        document_preview_url: signedDocument.signedUrl,
        document_preview_type: fileInfo.previewType,
      }
    }))

    return NextResponse.json({ data: { riders: ridersWithDocuments } })
  }

  return NextResponse.json({ error: 'Permintaan tidak valid.' }, { status: 400 })
}
