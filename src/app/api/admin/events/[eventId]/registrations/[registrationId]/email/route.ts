import { NextResponse } from 'next/server'
import { adminClient, requireBackoffice } from '../../../../../../../../lib/auth'
import {
  sendRegistrationStatusAccessEmail,
  type RegistrationEmailResult,
} from '../../../../../../../../lib/registrationEmail'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string; registrationId: string }> }
) {
  const { eventId, registrationId } = await params
  const auth = await requireBackoffice(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: registration, error } = await adminClient
    .from('registrations')
    .select('registration_code, contact_email')
    .eq('id', registrationId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!registration) return NextResponse.json({ error: 'Pendaftaran tidak ditemukan.' }, { status: 404 })
  if (!String(registration.registration_code ?? '').trim()) {
    return NextResponse.json({ error: 'Kode registrasi belum tersedia.' }, { status: 400 })
  }
  if (!String(registration.contact_email ?? '').trim()) {
    return NextResponse.json({ error: 'Email wali rider belum diisi.' }, { status: 400 })
  }

  let email: RegistrationEmailResult | { status: 'failed'; reason: string }
  try {
    email = await sendRegistrationStatusAccessEmail(eventId, registrationId)
  } catch (emailError) {
    const reason = emailError instanceof Error ? emailError.message : 'Gagal mengirim email QR dan status.'
    console.warn('[registration-email] failed resending status access:', reason)
    email = { status: 'failed', reason }
  }

  if (email.status === 'failed') {
    return NextResponse.json({ error: email.reason, email }, { status: 502 })
  }

  return NextResponse.json({ ok: true, email })
}
