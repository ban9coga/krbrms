import { NextResponse } from 'next/server'
import { adminClient } from '../../../../lib/auth'

export const runtime = 'nodejs'

const normalizeCode = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')

const normalizeWhatsappDigits = (value: unknown) => {
  const raw = String(value ?? '').trim()
  const digits = raw.replace(/[^\d]/g, '').slice(0, 15)
  if (!digits) return ''
  if (raw.startsWith('+')) return digits
  if (digits.startsWith('00')) return digits.slice(2)
  if (digits.startsWith('0')) return `62${digits.slice(1)}`
  return digits
}

type PublicRegistrationRow = {
  event_id: string
  registration_code: string
  contact_name: string
  community_name: string | null
  total_amount: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  created_at: string
  attendance_status?: 'UNCONFIRMED' | 'ATTENDING' | 'NOT_ATTENDING' | null
  attendance_confirmed_at?: string | null
  checked_in_at?: string | null
  goodie_bag_collected_at?: string | null
  events:
    | { name: string | null; event_date: string; status: string }
    | Array<{ name: string | null; event_date: string; status: string }>
    | null
  registration_items: Array<{
    rider_name: string
    rider_nickname: string | null
    requested_plate_number: string | null
    requested_plate_suffix: string | null
    status: string
    venue_status?: 'UNMARKED' | 'CHECKED_IN' | 'NOT_ATTENDING' | null
    checked_in_at?: string | null
    goodie_bag_collected_at?: string | null
    categories: { label: string | null } | Array<{ label: string | null }> | null
  }>
  registration_payments: Array<{ status: string }>
}

const BASE_REGISTRATION_SELECT =
  'event_id, registration_code, contact_name, contact_phone, community_name, total_amount, status, created_at, events(name, event_date, status), registration_items(rider_name, rider_nickname, requested_plate_number, requested_plate_suffix, status, categories!registration_items_primary_category_id_fkey(label)), registration_payments(status)'

const FULL_REGISTRATION_SELECT =
  'event_id, registration_code, contact_name, contact_phone, community_name, total_amount, status, created_at, attendance_status, attendance_confirmed_at, checked_in_at, goodie_bag_collected_at, events(name, event_date, status), registration_items(rider_name, rider_nickname, requested_plate_number, requested_plate_suffix, status, venue_status, checked_in_at, goodie_bag_collected_at, categories!registration_items_primary_category_id_fkey(label)), registration_payments(status)'

const isMissingRegistrationCodeError = (message: string) => /registration_code/i.test(message)

const isMissingAttendanceFeatureError = (message: string) =>
  /(attendance_status|attendance_confirmed_at|checked_in_at|goodie_bag_collected_at|venue_status)/i.test(message)

const findRegistration = async (registrationCode: string, contactPhone: string) => {
  const fullResult = await adminClient
    .from('registrations')
    .select(FULL_REGISTRATION_SELECT)
    .eq('registration_code', registrationCode)
    .maybeSingle()

  if (!fullResult.error || !isMissingAttendanceFeatureError(fullResult.error.message)) {
    const storedPhone = normalizeWhatsappDigits(
      (fullResult.data as { contact_phone?: string | null } | null)?.contact_phone
    )
    return {
      ...fullResult,
      data: storedPhone && storedPhone === contactPhone ? fullResult.data : null,
      attendanceFeaturesAvailable: true,
    }
  }

  console.warn('[registration-status] attendance columns unavailable, using base status fallback:', fullResult.error.message)
  const baseResult = await adminClient
    .from('registrations')
    .select(BASE_REGISTRATION_SELECT)
    .eq('registration_code', registrationCode)
    .maybeSingle()

  const storedPhone = normalizeWhatsappDigits(
    (baseResult.data as { contact_phone?: string | null } | null)?.contact_phone
  )
  return {
    ...baseResult,
    data: storedPhone && storedPhone === contactPhone ? baseResult.data : null,
    attendanceFeaturesAvailable: false,
  }
}

const jakartaDate = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

const getEventRow = (registration: PublicRegistrationRow) =>
  Array.isArray(registration.events) ? registration.events[0] ?? null : registration.events

const getAttendanceAvailability = async (registration: PublicRegistrationRow) => {
  const event = getEventRow(registration)
  const { data: settings } = await adminClient
    .from('event_settings')
    .select('registration_open')
    .eq('event_id', registration.event_id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const registrationClosed = settings?.registration_open === false
  const eventNotPassed = Boolean(event?.event_date && event.event_date >= jakartaDate())
  const eventNotStarted = event?.status === 'UPCOMING'
  return {
    can_confirm_attendance:
      registration.status === 'APPROVED' &&
      registrationClosed &&
      eventNotPassed &&
      eventNotStarted &&
      !registration.checked_in_at,
    attendance_message:
      registration.status !== 'APPROVED'
        ? 'Konfirmasi kehadiran tersedia setelah pendaftaran disetujui.'
        : !registrationClosed
          ? 'Konfirmasi kehadiran dibuka setelah pendaftaran event ditutup.'
          : !eventNotPassed || !eventNotStarted
            ? 'Periode konfirmasi kehadiran sudah berakhir.'
            : registration.checked_in_at
              ? 'Kehadiran sudah dikonfirmasi melalui check-in venue.'
              : 'Konfirmasikan kehadiran sebelum event dimulai.',
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const registrationCode = normalizeCode(body?.registration_code)
  const contactPhone = normalizeWhatsappDigits(body?.contact_phone)

  if (!/^RPB-\d{6}-[A-Z0-9]{8}$/.test(registrationCode)) {
    return NextResponse.json({ error: 'Format kode registrasi tidak valid.' }, { status: 400 })
  }
  if (contactPhone.length < 10) {
    return NextResponse.json({ error: 'Nomor WhatsApp tidak valid.' }, { status: 400 })
  }

  const { data, error, attendanceFeaturesAvailable } = await findRegistration(registrationCode, contactPhone)

  if (error) {
    console.warn('[registration-status] failed loading registration:', error.message)
    return NextResponse.json(
      {
        error: isMissingRegistrationCodeError(error.message)
          ? 'Fitur kode registrasi belum diaktifkan di database.'
          : 'Status pendaftaran gagal dimuat.',
      },
      { status: 400 }
    )
  }
  if (!data) {
    return NextResponse.json(
      { error: 'Pendaftaran tidak ditemukan. Periksa kembali kode registrasi dan nomor WhatsApp.' },
      { status: 404 }
    )
  }

  const registration = data as unknown as PublicRegistrationRow
  const attendanceAvailability = attendanceFeaturesAvailable
    ? await getAttendanceAvailability(registration)
    : {
        can_confirm_attendance: false,
        attendance_message:
          'Status dasar tersedia. Fitur konfirmasi kehadiran belum diaktifkan oleh panitia.',
      }
  const event = getEventRow(registration)
  const payments = Array.isArray(registration.registration_payments) ? registration.registration_payments : []
  const paymentStatus = payments.some((payment) => payment.status === 'APPROVED')
    ? 'APPROVED'
    : payments.some((payment) => payment.status === 'REJECTED')
      ? 'REJECTED'
      : payments.length > 0
        ? 'PENDING'
        : 'NO_PAYMENT'

  return NextResponse.json({
    data: {
      registration_code: registration.registration_code,
      contact_name: registration.contact_name,
      community_name: registration.community_name,
      total_amount: registration.total_amount,
      status: registration.status,
      created_at: registration.created_at,
      attendance_status: registration.attendance_status ?? 'UNCONFIRMED',
      attendance_confirmed_at: registration.attendance_confirmed_at ?? null,
      ...attendanceAvailability,
      checked_in_at: registration.checked_in_at ?? null,
      goodie_bag_collected_at: registration.goodie_bag_collected_at ?? null,
      event_name: event?.name ?? 'Event',
      event_date: event?.event_date ?? null,
      payment_status: paymentStatus,
      riders: (registration.registration_items ?? []).map((item) => ({
        name: item.rider_name,
        nickname: item.rider_nickname,
        plate: `${item.requested_plate_number ?? ''}${item.requested_plate_suffix ?? ''}` || '-',
        status: item.status,
        category: Array.isArray(item.categories) ? item.categories[0]?.label ?? '-' : item.categories?.label ?? '-',
        venue_status: item.venue_status ?? 'UNMARKED',
        checked_in_at: item.checked_in_at ?? null,
        goodie_bag_collected_at: item.goodie_bag_collected_at ?? null,
      })),
    },
  })
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null)
  const registrationCode = normalizeCode(body?.registration_code)
  const contactPhone = normalizeWhatsappDigits(body?.contact_phone)
  const attendanceStatus = String(body?.attendance_status ?? '').trim().toUpperCase()

  if (!/^RPB-\d{6}-[A-Z0-9]{8}$/.test(registrationCode)) {
    return NextResponse.json({ error: 'Format kode registrasi tidak valid.' }, { status: 400 })
  }
  if (contactPhone.length < 10) {
    return NextResponse.json({ error: 'Nomor WhatsApp tidak valid.' }, { status: 400 })
  }
  if (attendanceStatus !== 'ATTENDING' && attendanceStatus !== 'NOT_ATTENDING') {
    return NextResponse.json({ error: 'Pilihan konfirmasi kehadiran tidak valid.' }, { status: 400 })
  }

  const { data, error } = await adminClient
    .from('registrations')
    .select(
      'id, event_id, registration_code, contact_name, contact_phone, community_name, total_amount, status, created_at, attendance_status, attendance_confirmed_at, checked_in_at, goodie_bag_collected_at, events(name, event_date, status), registration_items(rider_name, rider_nickname, requested_plate_number, requested_plate_suffix, status, categories!registration_items_primary_category_id_fkey(label)), registration_payments(status)'
    )
    .eq('registration_code', registrationCode)
    .maybeSingle()

  if (error) {
    console.warn('[registration-status] failed loading attendance confirmation:', error.message)
    return NextResponse.json(
      {
        error: isMissingAttendanceFeatureError(error.message)
          ? 'Fitur konfirmasi kehadiran belum diaktifkan di database.'
          : 'Konfirmasi kehadiran gagal dimuat.',
      },
      { status: 400 }
    )
  }
  const storedPhone = normalizeWhatsappDigits(
    (data as { contact_phone?: string | null } | null)?.contact_phone
  )
  if (!data || !storedPhone || storedPhone !== contactPhone) {
    return NextResponse.json({ error: 'Pendaftaran tidak ditemukan.' }, { status: 404 })
  }

  const registration = data as unknown as PublicRegistrationRow & { id: string }
  const availability = await getAttendanceAvailability(registration)
  if (!availability.can_confirm_attendance) {
    return NextResponse.json({ error: availability.attendance_message }, { status: 409 })
  }

  const { error: updateError } = await adminClient
    .from('registrations')
    .update({
      attendance_status: attendanceStatus,
      attendance_confirmed_at: new Date().toISOString(),
    })
    .eq('id', registration.id)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

  return POST(
    new Request(req.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registration_code: registrationCode, contact_phone: contactPhone }),
    })
  )
}
