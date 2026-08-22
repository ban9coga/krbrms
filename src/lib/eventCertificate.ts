import { adminClient } from './auth'
import type { BusinessSettings } from './eventService'

export type CertificateRider = {
  id: string
  name: string
  category: string
  plate: string
}

type CertificateContext = {
  event: {
    id: string
    name: string
    event_date: string | null
  }
  registrationCode: string
  templateUrl: string
  riders: CertificateRider[]
}

const normalizeCode = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')

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
    adminClient.from('events').select('id, name, event_date, status').eq('id', eventId).maybeSingle(),
    adminClient.from('event_settings').select('business_settings').eq('event_id', eventId).maybeSingle(),
  ])
  if (eventError || settingsError || !event) {
    return { data: null, error: 'Event tidak ditemukan.', status: 404 }
  }
  if (event.status !== 'FINISHED') {
    return { data: null, error: 'E-sertifikat tersedia setelah event selesai.', status: 409 }
  }

  const business = (settings?.business_settings ?? {}) as BusinessSettings
  const templateUrl = business.certificate_template_url?.trim() || ''
  if (!business.certificate_enabled || !templateUrl) {
    return { data: null, error: 'E-sertifikat belum diaktifkan untuk event ini.', status: 404 }
  }

  const { data: registration, error: registrationError } = await adminClient
    .from('registrations')
    .select(
      'id, registration_code, contact_phone, status, registration_items(id, rider_name, requested_plate_number, requested_plate_suffix, status, categories!registration_items_primary_category_id_fkey(label))'
    )
    .eq('event_id', eventId)
    .eq('registration_code', registrationCode)
    .maybeSingle()
  if (registrationError) return { data: null, error: 'Verifikasi sertifikat gagal.', status: 400 }
  if (!registration || normalizeWhatsappDigits(registration.contact_phone) !== contactPhone) {
    return { data: null, error: 'Pendaftaran tidak ditemukan. Periksa nomor registrasi dan WhatsApp wali.', status: 404 }
  }
  if (registration.status !== 'APPROVED') {
    return { data: null, error: 'Pendaftaran ini belum disetujui panitia.', status: 409 }
  }

  const riders = (registration.registration_items ?? [])
    .filter((item) => item.status === 'APPROVED')
    .map((item) => ({
      id: item.id,
      name: item.rider_name,
      category: categoryLabel(item.categories),
      plate: `${item.requested_plate_number ?? ''}${item.requested_plate_suffix ?? ''}`.trim() || '-',
    }))
  if (riders.length === 0) {
    return { data: null, error: 'Belum ada rider yang disetujui untuk sertifikat ini.', status: 409 }
  }

  return {
    data: {
      event: { id: event.id, name: event.name, event_date: event.event_date },
      registrationCode: registration.registration_code,
      templateUrl,
      riders,
    },
  }
}
