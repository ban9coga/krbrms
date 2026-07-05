import { NextResponse } from 'next/server'
import { adminClient, requireBackoffice } from '../../../../../../../../../lib/auth'
import {
  sendRegistrationPaymentRejectionEmail,
  type RegistrationEmailResult,
} from '../../../../../../../../../lib/registrationEmail'
import { createRegistrationNotificationLog } from '../../../../../../../../../lib/registrationNotificationLogs'

const PAYMENT_STATUSES = ['APPROVED', 'REJECTED'] as const
const PAYMENT_RETURN_SELECT =
  'id, registration_id, amount, bank_name, account_name, account_number, proof_url, status, payment_method, created_at'

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string; registrationId: string; paymentId: string }> }
) {
  const { eventId, registrationId, paymentId } = await params
  const auth = await requireBackoffice(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const status = String(body?.status ?? '').trim().toUpperCase()
  if (!PAYMENT_STATUSES.includes(status as (typeof PAYMENT_STATUSES)[number])) {
    return NextResponse.json({ error: 'Invalid payment status' }, { status: 400 })
  }

  const { data: registration, error: regError } = await adminClient
    .from('registrations')
    .select('id, status, contact_email')
    .eq('id', registrationId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (regError) return NextResponse.json({ error: regError.message }, { status: 400 })
  if (!registration) return NextResponse.json({ error: 'Registration not found' }, { status: 404 })

  const { data, error } = await adminClient
    .from('registration_payments')
    .update({ status })
    .eq('id', paymentId)
    .eq('registration_id', registrationId)
    .select(PAYMENT_RETURN_SELECT)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  let email: RegistrationEmailResult | { status: 'failed'; reason: string } | null = null
  if (status === 'REJECTED') {
    const reason =
      typeof body?.notes === 'string' && body.notes.trim()
        ? body.notes.trim()
        : 'Bukti pembayaran belum dapat dikonfirmasi. Silakan cek kembali bukti pembayaran atau hubungi panitia.'
    try {
      email = await sendRegistrationPaymentRejectionEmail(eventId, registrationId, reason)
      if (email.status === 'sent') {
        try {
          await createRegistrationNotificationLog({
            eventId,
            registrationId,
            kind: 'PAYMENT_REJECTED',
            channel: 'EMAIL',
            recipient: registration.contact_email,
            performedBy: auth.user.id,
            metadata: { source: 'payment_rejection' },
          })
        } catch (logError) {
          const message = logError instanceof Error ? logError.message : 'Unknown error'
          console.warn('[registration-notification-log] failed logging payment rejection:', message)
        }
      }
    } catch (emailError) {
      const message = emailError instanceof Error ? emailError.message : 'Gagal mengirim email penolakan pembayaran.'
      console.warn('[registration-email] failed sending payment rejection notification:', message)
      email = { status: 'failed', reason: message }
    }
  }

  return NextResponse.json({ data, email })
}

