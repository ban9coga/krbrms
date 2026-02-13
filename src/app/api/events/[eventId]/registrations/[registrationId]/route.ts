import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string; registrationId: string }> }) {
  const { eventId, registrationId } = await params
  const { data, error } = await adminClient
    .from('registration_items')
    .select('id, name, date_of_birth, gender, plate_number, plate_suffix, club, primary_category_id, extra_category_ids')
    .eq('event_id', eventId)
    .eq('registration_id', registrationId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: data ?? [] })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string; registrationId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId, registrationId } = await params
  const body = await req.json().catch(() => ({}))
  const status = body?.status as 'APPROVED' | 'REJECTED' | undefined
  if (!status) return NextResponse.json({ error: 'status required' }, { status: 400 })

  if (status === 'REJECTED') {
    const { error } = await adminClient
      .from('registrations')
      .update({ status: 'REJECTED' })
      .eq('event_id', eventId)
      .eq('id', registrationId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  const { data: items, error: itemError } = await adminClient
    .from('registration_items')
    .select(
      'id, name, date_of_birth, gender, plate_number, plate_suffix, club, primary_category_id, extra_category_ids'
    )
    .eq('event_id', eventId)
    .eq('registration_id', registrationId)
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 400 })

  const payload = (items ?? []).map((item) => ({
    event_id: eventId,
    name: item.name,
    date_of_birth: item.date_of_birth,
    gender: item.gender,
    plate_number: item.plate_number,
    plate_suffix: item.plate_suffix ?? null,
    club: item.club ?? null,
  }))

  const { data: riderRows, error: riderError } = await adminClient
    .from('riders')
    .insert(payload)
    .select('id')
  if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })

  const extraRows: Array<{ event_id: string; rider_id: string; category_id: string }> = []
  ;(items ?? []).forEach((item, idx) => {
    const riderId = riderRows?.[idx]?.id
    const extra = Array.isArray(item.extra_category_ids) ? item.extra_category_ids : []
    extra.forEach((categoryId: string) => {
      extraRows.push({ event_id: eventId, rider_id: riderId, category_id: categoryId })
    })
  })
  if (extraRows.length > 0) {
    const { error: extraError } = await adminClient.from('rider_extra_categories').insert(extraRows)
    if (extraError) return NextResponse.json({ error: extraError.message }, { status: 400 })
  }

  const { error: regError } = await adminClient
    .from('registrations')
    .update({ status: 'APPROVED' })
    .eq('event_id', eventId)
    .eq('id', registrationId)
  if (regError) return NextResponse.json({ error: regError.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
