import { NextResponse } from 'next/server'
import { adminClient, requireBackoffice } from '../../../../../../lib/auth'

const normalizeRegistrationCode = (value: unknown) => {
  const raw = String(value ?? '').trim().toUpperCase()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    return String(url.searchParams.get('code') ?? '').trim().toUpperCase()
  } catch {
    return raw
  }
}

const registrationSelect =
  'id, registration_code, contact_name, contact_phone, community_name, total_amount, status, attendance_status, attendance_confirmed_at, checked_in_at, checked_in_by, goodie_bag_collected_at, goodie_bag_collected_by, registration_items(rider_name, rider_nickname, requested_plate_number, requested_plate_suffix, categories!registration_items_primary_category_id_fkey(label)), registration_payments(status)'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireBackoffice(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const code = normalizeRegistrationCode(new URL(req.url).searchParams.get('code'))
  if (!code) return NextResponse.json({ error: 'Kode registrasi wajib diisi.' }, { status: 400 })

  const { data, error } = await adminClient
    .from('registrations')
    .select(registrationSelect)
    .eq('event_id', eventId)
    .eq('registration_code', code)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!data) return NextResponse.json({ error: 'Pendaftaran tidak ditemukan untuk event ini.' }, { status: 404 })
  return NextResponse.json({ data })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireBackoffice(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const code = normalizeRegistrationCode(body?.registration_code)
  const action = String(body?.action ?? '').trim().toUpperCase()
  if (!code) return NextResponse.json({ error: 'Kode registrasi wajib diisi.' }, { status: 400 })
  if (action !== 'CHECK_IN' && action !== 'GOODIE_BAG_COLLECTED') {
    return NextResponse.json({ error: 'Aksi tidak valid.' }, { status: 400 })
  }

  const { data: registration, error: registrationError } = await adminClient
    .from('registrations')
    .select('id, status, checked_in_at, goodie_bag_collected_at')
    .eq('event_id', eventId)
    .eq('registration_code', code)
    .maybeSingle()

  if (registrationError) return NextResponse.json({ error: registrationError.message }, { status: 400 })
  if (!registration) return NextResponse.json({ error: 'Pendaftaran tidak ditemukan untuk event ini.' }, { status: 404 })
  if (registration.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Hanya pendaftaran APPROVED yang dapat diproses.' }, { status: 409 })
  }
  if (action === 'GOODIE_BAG_COLLECTED' && !registration.checked_in_at) {
    return NextResponse.json({ error: 'Lakukan check-in venue terlebih dahulu.' }, { status: 409 })
  }

  let alreadyProcessed =
    action === 'CHECK_IN' ? Boolean(registration.checked_in_at) : Boolean(registration.goodie_bag_collected_at)
  if (!alreadyProcessed) {
    const now = new Date().toISOString()
    const updates =
      action === 'CHECK_IN'
        ? { checked_in_at: now, checked_in_by: auth.user.id }
        : { goodie_bag_collected_at: now, goodie_bag_collected_by: auth.user.id }

    let updateQuery = adminClient
      .from('registrations')
      .update(updates)
      .eq('id', registration.id)
      .eq('event_id', eventId)
    updateQuery =
      action === 'CHECK_IN'
        ? updateQuery.is('checked_in_at', null)
        : updateQuery.is('goodie_bag_collected_at', null)
    const { data: updatedRows, error: updateError } = await updateQuery.select('id')
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })
    alreadyProcessed = (updatedRows ?? []).length === 0

    if (!alreadyProcessed) {
      const { error: logError } = await adminClient.from('registration_checkin_logs').insert({
        registration_id: registration.id,
        event_id: eventId,
        action,
        performed_by: auth.user.id,
        performed_at: now,
      })
      if (logError) {
        console.warn('[registration-checkin] failed writing audit log:', logError.message)
      }
    }
  }

  const { data, error } = await adminClient
    .from('registrations')
    .select(registrationSelect)
    .eq('id', registration.id)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ data, already_processed: alreadyProcessed })
}
