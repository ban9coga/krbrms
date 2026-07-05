import { NextResponse } from 'next/server'
import { adminClient, requireBackoffice } from '../../../../../../../../lib/auth'
import {
  createRegistrationNotificationLog,
  DuplicateRegistrationNotificationError,
  type RegistrationNotificationChannel,
  type RegistrationNotificationKind,
} from '../../../../../../../../lib/registrationNotificationLogs'

const NOTIFICATION_KINDS: RegistrationNotificationKind[] = [
  'STATUS_ACCESS',
  'EMAIL_STATUS_ACCESS',
  'APPROVED',
  'REJECTED',
  'PAYMENT_REJECTED',
]

const CHANNELS: RegistrationNotificationChannel[] = ['WHATSAPP', 'EMAIL']

const normalizeKind = (value: unknown): RegistrationNotificationKind | null => {
  const normalized = String(value ?? '').trim().toUpperCase()
  return NOTIFICATION_KINDS.includes(normalized as RegistrationNotificationKind)
    ? (normalized as RegistrationNotificationKind)
    : null
}

const normalizeChannel = (value: unknown): RegistrationNotificationChannel | null => {
  const normalized = String(value ?? '').trim().toUpperCase()
  return CHANNELS.includes(normalized as RegistrationNotificationChannel)
    ? (normalized as RegistrationNotificationChannel)
    : null
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string; registrationId: string }> }
) {
  const { eventId, registrationId } = await params
  const auth = await requireBackoffice(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const kind = normalizeKind(body?.kind)
  const channel = normalizeChannel(body?.channel)
  if (!kind || !channel) {
    return NextResponse.json({ error: 'Invalid notification kind/channel' }, { status: 400 })
  }

  const { data: registration, error } = await adminClient
    .from('registrations')
    .select('id, event_id, contact_phone, contact_email')
    .eq('id', registrationId)
    .eq('event_id', eventId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!registration) return NextResponse.json({ error: 'Pendaftaran tidak ditemukan.' }, { status: 404 })

  const recipient =
    channel === 'WHATSAPP'
      ? String(registration.contact_phone ?? '').trim()
      : String(registration.contact_email ?? '').trim()

  try {
    const log = await createRegistrationNotificationLog({
      eventId,
      registrationId,
      kind,
      channel,
      recipient,
      performedBy: auth.user.id,
      metadata:
        body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
          ? (body.metadata as Record<string, unknown>)
          : {},
    })
    return NextResponse.json({ ok: true, data: log })
  } catch (err) {
    if (err instanceof DuplicateRegistrationNotificationError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Gagal mencatat notifikasi.' }, { status: 400 })
  }
}

