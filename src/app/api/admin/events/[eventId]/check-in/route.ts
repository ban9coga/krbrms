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
  'id, registration_code, contact_name, contact_phone, community_name, total_amount, status, attendance_status, attendance_confirmed_at, checked_in_at, checked_in_by, goodie_bag_collected_at, goodie_bag_collected_by, registration_items(id, rider_name, rider_nickname, requested_plate_number, requested_plate_suffix, venue_status, checked_in_at, goodie_bag_collected_at, categories!registration_items_primary_category_id_fkey(label)), registration_payments(status)'

type VenueAction = 'CHECK_IN' | 'NOT_ATTENDING' | 'GOODIE_BAG_COLLECTED'

type RegistrationItemVenueRow = {
  id: string
  venue_status: 'UNMARKED' | 'CHECKED_IN' | 'NOT_ATTENDING'
  checked_in_at: string | null
  goodie_bag_collected_at: string | null
}

const loadRegistration = async (eventId: string, code: string) =>
  adminClient
    .from('registrations')
    .select(registrationSelect)
    .eq('event_id', eventId)
    .eq('registration_code', code)
    .maybeSingle()

const syncRegistrationVenueSummary = async (
  registrationId: string,
  eventId: string,
  performedBy: string
) => {
  const { data: items, error } = await adminClient
    .from('registration_items')
    .select('venue_status, checked_in_at, goodie_bag_collected_at')
    .eq('registration_id', registrationId)

  if (error) throw new Error(error.message)
  const rows = (items ?? []) as Array<{
    venue_status: string
    checked_in_at: string | null
    goodie_bag_collected_at: string | null
  }>
  const checkedRows = rows.filter((item) => item.venue_status === 'CHECKED_IN' && item.checked_in_at)
  const allResolved = rows.length > 0 && rows.every((item) => item.venue_status !== 'UNMARKED')
  const allCheckedGoodiesCollected =
    checkedRows.length > 0 && checkedRows.every((item) => Boolean(item.goodie_bag_collected_at))

  await adminClient
    .from('registrations')
    .update({
      checked_in_at: checkedRows[0]?.checked_in_at ?? null,
      checked_in_by: checkedRows.length > 0 ? performedBy : null,
      goodie_bag_collected_at:
        allResolved && allCheckedGoodiesCollected ? checkedRows[0]?.goodie_bag_collected_at ?? null : null,
      goodie_bag_collected_by: allResolved && allCheckedGoodiesCollected ? performedBy : null,
    })
    .eq('id', registrationId)
    .eq('event_id', eventId)
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireBackoffice(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const code = normalizeRegistrationCode(new URL(req.url).searchParams.get('code'))
  if (!code) return NextResponse.json({ error: 'Kode registrasi wajib diisi.' }, { status: 400 })

  const { data, error } = await loadRegistration(eventId, code)
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
  const action = String(body?.action ?? '').trim().toUpperCase() as VenueAction
  const registrationItemId = String(body?.registration_item_id ?? '').trim()
  const applyToAll = body?.apply_to_all === true

  if (!code) return NextResponse.json({ error: 'Kode registrasi wajib diisi.' }, { status: 400 })
  if (!['CHECK_IN', 'NOT_ATTENDING', 'GOODIE_BAG_COLLECTED'].includes(action)) {
    return NextResponse.json({ error: 'Aksi tidak valid.' }, { status: 400 })
  }
  if (!registrationItemId && !applyToAll) {
    return NextResponse.json({ error: 'Pilih rider yang akan diproses.' }, { status: 400 })
  }

  const { data: registration, error: registrationError } = await adminClient
    .from('registrations')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('registration_code', code)
    .maybeSingle()

  if (registrationError) return NextResponse.json({ error: registrationError.message }, { status: 400 })
  if (!registration) return NextResponse.json({ error: 'Pendaftaran tidak ditemukan untuk event ini.' }, { status: 404 })
  if (registration.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Hanya pendaftaran APPROVED yang dapat diproses.' }, { status: 409 })
  }

  let itemQuery = adminClient
    .from('registration_items')
    .select('id, venue_status, checked_in_at, goodie_bag_collected_at')
    .eq('registration_id', registration.id)
  if (!applyToAll) itemQuery = itemQuery.eq('id', registrationItemId)

  const { data: itemRows, error: itemError } = await itemQuery
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 400 })

  let targets = (itemRows ?? []) as RegistrationItemVenueRow[]
  if (applyToAll) {
    if (action === 'CHECK_IN') targets = targets.filter((item) => item.venue_status === 'UNMARKED')
    if (action === 'GOODIE_BAG_COLLECTED') {
      targets = targets.filter(
        (item) => item.venue_status === 'CHECKED_IN' && !item.goodie_bag_collected_at
      )
    }
  }
  if (targets.length === 0) {
    return NextResponse.json({ error: 'Tidak ada rider yang dapat diproses untuk aksi ini.' }, { status: 409 })
  }

  const now = new Date().toISOString()
  let processedCount = 0

  for (const item of targets) {
    if (action === 'NOT_ATTENDING' && item.venue_status === 'CHECKED_IN') continue
    if (action === 'GOODIE_BAG_COLLECTED' && item.venue_status !== 'CHECKED_IN') continue

    const updates =
      action === 'CHECK_IN'
        ? {
            venue_status: 'CHECKED_IN',
            checked_in_at: item.checked_in_at ?? now,
            checked_in_by: auth.user.id,
          }
        : action === 'NOT_ATTENDING'
          ? {
              venue_status: 'NOT_ATTENDING',
              checked_in_at: null,
              checked_in_by: null,
              goodie_bag_collected_at: null,
              goodie_bag_collected_by: null,
            }
          : {
              goodie_bag_collected_at: item.goodie_bag_collected_at ?? now,
              goodie_bag_collected_by: auth.user.id,
            }

    const { error: updateError } = await adminClient
      .from('registration_items')
      .update(updates)
      .eq('id', item.id)
      .eq('registration_id', registration.id)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })
    processedCount += 1

    const { error: logError } = await adminClient.from('registration_checkin_logs').insert({
      registration_id: registration.id,
      registration_item_id: item.id,
      event_id: eventId,
      action,
      performed_by: auth.user.id,
      performed_at: now,
    })
    if (logError) console.warn('[registration-checkin] failed writing rider audit log:', logError.message)
  }

  if (processedCount === 0) {
    return NextResponse.json({ error: 'Status rider tidak dapat diubah untuk aksi ini.' }, { status: 409 })
  }

  try {
    await syncRegistrationVenueSummary(registration.id, eventId, auth.user.id)
  } catch (error) {
    console.warn(
      '[registration-checkin] failed syncing registration summary:',
      error instanceof Error ? error.message : error
    )
  }

  const { data, error } = await loadRegistration(eventId, code)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data, processed_count: processedCount })
}
