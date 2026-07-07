import { NextResponse } from 'next/server'
import { adminClient, requireBackoffice } from '../../../../../../../../lib/auth'

const CONTACT_SELECT = 'id, event_id, contact_name, contact_phone, contact_email, community_name'

const normalizeOptionalText = (value: unknown) => {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || null
}

const normalizeRequiredText = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const isValidEmail = (value: string | null) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string; registrationId: string }> }
) {
  const { eventId, registrationId } = await params
  const auth = await requireBackoffice(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const nextContactName = normalizeRequiredText(body.contact_name)
  const nextContactPhone = normalizeRequiredText(body.contact_phone)
  const nextContactEmail = normalizeOptionalText(body.contact_email)
  const nextCommunityName = normalizeOptionalText(body.community_name)

  if (!nextContactName) {
    return NextResponse.json({ error: 'Nama wali/penanggung jawab wajib diisi.' }, { status: 400 })
  }
  if (!nextContactPhone) {
    return NextResponse.json({ error: 'Nomor WhatsApp wali wajib diisi.' }, { status: 400 })
  }
  if (!isValidEmail(nextContactEmail)) {
    return NextResponse.json({ error: 'Format email wali tidak valid.' }, { status: 400 })
  }

  const { data: current, error: currentError } = await adminClient
    .from('registrations')
    .select(CONTACT_SELECT)
    .eq('id', registrationId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 })
  if (!current) return NextResponse.json({ error: 'Pendaftaran tidak ditemukan.' }, { status: 404 })

  const oldValues = {
    contact_name: current.contact_name ?? null,
    contact_phone: current.contact_phone ?? null,
    contact_email: current.contact_email ?? null,
    community_name: current.community_name ?? null,
  }
  const newValues = {
    contact_name: nextContactName,
    contact_phone: nextContactPhone,
    contact_email: nextContactEmail,
    community_name: nextCommunityName,
  }

  const hasChanges = Object.entries(newValues).some(
    ([key, value]) => oldValues[key as keyof typeof oldValues] !== value
  )
  if (!hasChanges) return NextResponse.json({ ok: true, data: current, changed: false })

  const { data, error } = await adminClient
    .from('registrations')
    .update(newValues)
    .eq('id', registrationId)
    .eq('event_id', eventId)
    .select(CONTACT_SELECT)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const { error: logError } = await adminClient.from('registration_contact_change_logs').insert({
    event_id: eventId,
    registration_id: registrationId,
    changed_by: auth.user.id,
    old_values: oldValues,
    new_values: newValues,
  })
  if (logError) console.warn('[registration-contact] failed writing audit log:', logError.message)

  return NextResponse.json({ ok: true, data, changed: true })
}

