import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../../../../lib/auth'

const PAYMENT_STATUSES = ['APPROVED', 'REJECTED'] as const

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ eventId: string; registrationId: string; paymentId: string }> }
) {
  const { eventId, registrationId, paymentId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const status = String(body?.status ?? '').trim().toUpperCase()
  if (!PAYMENT_STATUSES.includes(status as (typeof PAYMENT_STATUSES)[number])) {
    return NextResponse.json({ error: 'Invalid payment status' }, { status: 400 })
  }

  const { data: registration, error: regError } = await adminClient
    .from('registrations')
    .select('id, status')
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
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

