import { randomUUID } from 'node:crypto'
import { adminClient } from './auth'
import { normalizeCertificateLayout, type CertificateLayout } from './certificateLayout'
import type { BusinessSettings } from './eventService'
import { toPublicMediaUrl } from './publicMedia'

export type CertificateType = 'PARTICIPATION' | 'ACHIEVEMENT'

export type CertificateAchievement = { position: number; finalClass: string; label: string }

export type CertificateRider = {
  id: string
  riderId: string | null
  name: string
  category: string
  categoryId: string | null
  plate: string
  achievement: CertificateAchievement | null
}

export type CertificateContext = {
  event: { id: string; name: string; event_date: string | null; location: string | null }
  registrationId: string
  registrationCode: string
  templateUrl: string
  certificatePrefix: string
  achievementEnabled: boolean
  layout: CertificateLayout
  assets: {
    eventLogoUrl: string | null
    organizerLogoUrl: string | null
  }
  riders: CertificateRider[]
}

export type CertificateSnapshot = {
  event_name: string
  event_date: string | null
  location: string | null
  rider_name: string
  category: string
  plate: string
  certificate_type: CertificateType
  achievement: CertificateAchievement | null
}

export type IssuedCertificate = {
  id?: string
  eventId?: string
  registrationItemId?: string
  type?: CertificateType
  code: string
  issuedAt: string
  revokedAt: string | null
  revokedReason: string | null
  snapshot: CertificateSnapshot
}

const normalizeCode = (value: unknown) => String(value ?? '').trim().toUpperCase().replace(/\s+/g, '')
const normalizeCertificateCode = (value: unknown) => String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 48)
const normalizePrefix = (value: unknown) => String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12) || 'RPB'
const normalizeName = (value: unknown) => String(value ?? '').trim().toLocaleUpperCase('id-ID')
const normalizePlate = (value: unknown) => String(value ?? '').trim().toLocaleUpperCase('id-ID')

export const normalizeWhatsappDigits = (value: unknown) => {
  const raw = String(value ?? '').trim()
  const digits = raw.replace(/[^\d]/g, '').slice(0, 15)
  if (!digits) return ''
  if (raw.startsWith('+')) return digits
  if (digits.startsWith('00')) return digits.slice(2)
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  return digits
}

const categoryLabel = (value: { label: string | null } | Array<{ label: string | null }> | null) => {
  const category = Array.isArray(value) ? value[0] : value
  return category?.label?.trim() || 'Kategori event'
}

const toIssuedCertificate = (row: {
  id?: string
  event_id?: string
  registration_item_id?: string
  certificate_type?: CertificateType
  certificate_code: string
  issued_at: string
  revoked_at: string | null
  revoked_reason: string | null
  snapshot: CertificateSnapshot
}): IssuedCertificate => ({
  id: row.id,
  eventId: row.event_id,
  registrationItemId: row.registration_item_id,
  type: row.certificate_type,
  code: row.certificate_code,
  issuedAt: row.issued_at,
  revokedAt: row.revoked_at,
  revokedReason: row.revoked_reason,
  snapshot: row.snapshot,
})

const readExistingCertificate = async (eventId: string, registrationItemId: string, type: CertificateType) => {
  const { data, error } = await adminClient
    .from('event_certificates')
    .select('id, event_id, registration_item_id, certificate_type, certificate_code, issued_at, revoked_at, revoked_reason, snapshot')
    .eq('event_id', eventId)
    .eq('registration_item_id', registrationItemId)
    .eq('certificate_type', type)
    .maybeSingle()
  if (error || !data) return null
  return toIssuedCertificate(data as Parameters<typeof toIssuedCertificate>[0])
}

const achievementLabel = (position: number, finalClass: string) => {
  const title = position === 1 ? 'Juara 1' : position === 2 ? 'Juara 2' : position === 3 ? 'Juara 3' : `Posisi ${position}`
  return `${title} - ${finalClass}`
}

export const loadCertificateContext = async (
  eventId: string,
  registrationCodeInput: unknown,
  contactPhoneInput: unknown
): Promise<{ data: CertificateContext | null; error?: string; status?: number }> => {
  const registrationCode = normalizeCode(registrationCodeInput)
  const contactPhone = normalizeWhatsappDigits(contactPhoneInput)
  if (!registrationCode || !contactPhone || contactPhone.length < 10) {
    return { data: null, error: 'Masukkan nomor registrasi dan WhatsApp yang valid.', status: 400 }
  }

  const [{ data: event, error: eventError }, { data: settings, error: settingsError }] = await Promise.all([
    adminClient.from('events').select('id, name, event_date, location, status').eq('id', eventId).maybeSingle(),
    adminClient.from('event_settings').select('business_settings').eq('event_id', eventId).maybeSingle(),
  ])
  if (eventError || settingsError || !event) return { data: null, error: 'Event tidak ditemukan.', status: 404 }
  if (event.status !== 'FINISHED') return { data: null, error: 'E-sertifikat tersedia setelah event selesai.', status: 409 }

  const business = (settings?.business_settings ?? {}) as BusinessSettings
  const templateUrl = toPublicMediaUrl(business.certificate_template_url)?.trim() || ''
  if (!business.certificate_enabled || !templateUrl) return { data: null, error: 'E-sertifikat belum diaktifkan untuk event ini.', status: 404 }

  const { data: registration, error: registrationError } = await adminClient
    .from('registrations')
    .select('id, registration_code, contact_phone, status, registration_items(id, rider_name, requested_plate_number, requested_plate_suffix, primary_category_id, status, categories!registration_items_primary_category_id_fkey(label))')
    .eq('event_id', eventId)
    .eq('registration_code', registrationCode)
    .maybeSingle()
  if (registrationError) return { data: null, error: 'Verifikasi sertifikat gagal.', status: 400 }
  if (!registration || normalizeWhatsappDigits(registration.contact_phone) !== contactPhone) {
    return { data: null, error: 'Pendaftaran tidak ditemukan. Periksa nomor registrasi dan WhatsApp wali.', status: 404 }
  }
  if (registration.status !== 'APPROVED') return { data: null, error: 'Pendaftaran ini belum disetujui panitia.', status: 409 }

  const approvedItems = (registration.registration_items ?? []).filter((item) => item.status === 'APPROVED')
  if (!approvedItems.length) return { data: null, error: 'Belum ada rider yang disetujui untuk sertifikat ini.', status: 409 }

  const { data: eventRiders } = await adminClient.from('riders').select('id, name, no_plate_display, primary_category_id').eq('event_id', eventId)
  const riderLookup = new Map(
    (eventRiders ?? []).map((rider) => [
      `${normalizeName(rider.name)}|${normalizePlate(rider.no_plate_display)}|${rider.primary_category_id ?? ''}`,
      rider,
    ])
  )
  const riderIds = (eventRiders ?? []).map((rider) => rider.id)
  const { data: finalRows } = riderIds.length
    ? await adminClient
        .from('race_stage_result')
        .select('rider_id, category_id, final_class, position')
        .eq('stage', 'FINAL')
        .in('rider_id', riderIds)
        .not('position', 'is', null)
    : { data: [] as Array<{ rider_id: string; category_id: string; final_class: string | null; position: number | null }> }
  const finalLookup = new Map((finalRows ?? []).map((row) => [`${row.rider_id}|${row.category_id}`, row]))

  const riders = approvedItems.map((item) => {
    const plate = `${item.requested_plate_number ?? ''}${item.requested_plate_suffix ?? ''}`.trim() || '-'
    const mappedRider = riderLookup.get(`${normalizeName(item.rider_name)}|${normalizePlate(plate)}|${item.primary_category_id ?? ''}`) ?? null
    const final = mappedRider && item.primary_category_id ? finalLookup.get(`${mappedRider.id}|${item.primary_category_id}`) : null
    const position = typeof final?.position === 'number' ? final.position : null
    const finalClass = String(final?.final_class ?? '').trim()
    return {
      id: item.id,
      riderId: mappedRider?.id ?? null,
      name: item.rider_name,
      category: categoryLabel(item.categories),
      categoryId: item.primary_category_id ?? null,
      plate,
      achievement: position && finalClass ? { position, finalClass, label: achievementLabel(position, finalClass) } : null,
    }
  })

  return {
    data: {
      event: { id: event.id, name: event.name, event_date: event.event_date, location: event.location },
      registrationId: registration.id,
      registrationCode: registration.registration_code,
      templateUrl,
      certificatePrefix: normalizePrefix(business.certificate_id_prefix),
      achievementEnabled: Boolean(business.certificate_achievement_enabled),
      layout: normalizeCertificateLayout(business.certificate_layout),
      assets: {
        eventLogoUrl: toPublicMediaUrl(business.certificate_event_logo_url),
        organizerLogoUrl: toPublicMediaUrl(business.certificate_organizer_logo_url),
      },
      riders,
    },
  }
}

const buildCertificateCode = (prefix: string, eventDate: string | null) => {
  const year = eventDate?.slice(0, 4).match(/^\d{4}$/)?.[0] ?? String(new Date().getFullYear())
  return `${prefix}-${year}-${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`
}

export const issueCertificate = async (
  context: CertificateContext,
  rider: CertificateRider,
  type: CertificateType
): Promise<{ data: IssuedCertificate | null; error?: string }> => {
  if (type === 'ACHIEVEMENT' && (!context.achievementEnabled || !rider.achievement)) {
    return { data: null, error: 'Sertifikat prestasi belum tersedia untuk rider ini.' }
  }
  const existing = await readExistingCertificate(context.event.id, rider.id, type)
  if (existing) return { data: existing }
  const snapshot: CertificateSnapshot = {
    event_name: context.event.name,
    event_date: context.event.event_date,
    location: context.event.location,
    rider_name: rider.name,
    category: rider.category,
    plate: rider.plate,
    certificate_type: type,
    achievement: type === 'ACHIEVEMENT' ? rider.achievement : null,
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await adminClient
      .from('event_certificates')
      .insert({
        event_id: context.event.id,
        registration_id: context.registrationId,
        registration_item_id: rider.id,
        certificate_type: type,
        certificate_code: buildCertificateCode(context.certificatePrefix, context.event.event_date),
        snapshot,
      })
      .select('id, event_id, registration_item_id, certificate_type, certificate_code, issued_at, revoked_at, revoked_reason, snapshot')
      .single()
    if (data) return { data: toIssuedCertificate(data as Parameters<typeof toIssuedCertificate>[0]) }
    const concurrent = await readExistingCertificate(context.event.id, rider.id, type)
    if (concurrent) return { data: concurrent }
    if (error?.code !== '23505') return { data: null, error: 'Certificate ID gagal dibuat.' }
  }
  return { data: null, error: 'Certificate ID gagal dibuat. Silakan coba lagi.' }
}

export const getCertificateVerification = async (
  certificateCodeInput: unknown
): Promise<{ data: IssuedCertificate | null; error?: string; status?: number }> => {
  const certificateCode = normalizeCertificateCode(certificateCodeInput)
  if (!certificateCode) return { data: null, error: 'Certificate ID tidak valid.', status: 400 }
  const { data, error } = await adminClient
    .from('event_certificates')
    .select('id, event_id, registration_item_id, certificate_type, certificate_code, issued_at, revoked_at, revoked_reason, snapshot')
    .eq('certificate_code', certificateCode)
    .maybeSingle()
  if (error || !data) return { data: null, error: 'Sertifikat tidak ditemukan.', status: 404 }
  const certificate = toIssuedCertificate(data as Parameters<typeof toIssuedCertificate>[0])
  if (certificate.revokedAt) return { data: certificate, error: 'Sertifikat ini sudah dicabut.', status: 410 }
  return { data: certificate }
}
