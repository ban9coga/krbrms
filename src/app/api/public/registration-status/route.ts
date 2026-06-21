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
  registration_code: string
  contact_name: string
  community_name: string | null
  total_amount: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  notes: string | null
  created_at: string
  events: { name: string | null } | Array<{ name: string | null }> | null
  registration_items: Array<{
    rider_name: string
    rider_nickname: string | null
    requested_plate_number: string | null
    requested_plate_suffix: string | null
    status: string
    categories: { label: string | null } | Array<{ label: string | null }> | null
  }>
  registration_payments: Array<{ status: string }>
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

  const { data, error } = await adminClient
    .from('registrations')
    .select(
      'registration_code, contact_name, contact_phone, community_name, total_amount, status, notes, created_at, events(name), registration_items(rider_name, rider_nickname, requested_plate_number, requested_plate_suffix, status, categories!registration_items_primary_category_id_fkey(label)), registration_payments(status)'
    )
    .eq('registration_code', registrationCode)
    .eq('contact_phone', contactPhone)
    .maybeSingle()

  if (error) {
    const missingColumn = /registration_code/i.test(error.message)
    return NextResponse.json(
      {
        error: missingColumn
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
      notes: registration.notes,
      created_at: registration.created_at,
      event_name: Array.isArray(registration.events)
        ? registration.events[0]?.name ?? 'Event'
        : registration.events?.name ?? 'Event',
      payment_status: paymentStatus,
      riders: (registration.registration_items ?? []).map((item) => ({
        name: item.rider_name,
        nickname: item.rider_nickname,
        plate: `${item.requested_plate_number ?? ''}${item.requested_plate_suffix ?? ''}` || '-',
        status: item.status,
        category: Array.isArray(item.categories) ? item.categories[0]?.label ?? '-' : item.categories?.label ?? '-',
      })),
    },
  })
}
