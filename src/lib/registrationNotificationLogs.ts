import { adminClient } from './auth'

export type RegistrationNotificationKind =
  | 'STATUS_ACCESS'
  | 'EMAIL_STATUS_ACCESS'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAYMENT_REJECTED'

export type RegistrationNotificationChannel = 'WHATSAPP' | 'EMAIL'

export const getRegistrationNotificationLabel = (kind: RegistrationNotificationKind) => {
  if (kind === 'STATUS_ACCESS' || kind === 'EMAIL_STATUS_ACCESS') return 'QR dan status pendaftaran'
  if (kind === 'APPROVED') return 'konfirmasi pendaftaran'
  if (kind === 'PAYMENT_REJECTED') return 'konfirmasi pembayaran'
  return 'penolakan pendaftaran'
}

export const createRegistrationNotificationLog = async ({
  eventId,
  registrationId,
  kind,
  channel,
  recipient,
  performedBy,
  metadata = {},
}: {
  eventId: string
  registrationId: string
  kind: RegistrationNotificationKind
  channel: RegistrationNotificationChannel
  recipient?: string | null
  performedBy?: string | null
  metadata?: Record<string, unknown>
}) => {
  const { data, error } = await adminClient
    .from('registration_notification_logs')
    .insert({
      event_id: eventId,
      registration_id: registrationId,
      notification_kind: kind,
      channel,
      recipient: recipient?.trim() || null,
      performed_by: performedBy || null,
      metadata,
    })
    .select('id, performed_at')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export const hasRegistrationNotificationLog = async (
  registrationId: string,
  kind: RegistrationNotificationKind,
  channel?: RegistrationNotificationChannel
) => {
  let query = adminClient
    .from('registration_notification_logs')
    .select('id')
    .eq('registration_id', registrationId)
    .eq('notification_kind', kind)
    .order('performed_at', { ascending: false })
    .limit(1)

  if (channel) {
    query = query.eq('channel', channel)
  }

  const { data, error } = await query

  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}
