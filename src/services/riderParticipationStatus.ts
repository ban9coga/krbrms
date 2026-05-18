import { adminClient } from '../lib/auth'

type RiderParticipationStatusRow = {
  event_id: string
  moto_id: string | null
  rider_id: string
  participation_status: string
  registration_order: number
}

const isLegacyUniqueConstraintError = (error: { code?: string; message?: string; details?: string; hint?: string } | null) => {
  if (!error) return false
  const text = [error.message, error.details, error.hint].filter(Boolean).join(' ')
  return error.code === '23505' && text.includes('uq_rider_participation_event_rider')
}

export const upsertRiderParticipationStatuses = async (rows: RiderParticipationStatusRow[]) => {
  if (rows.length === 0) {
    return { error: null, legacyFallbackUsed: false }
  }

  const runUpsert = async (payload: RiderParticipationStatusRow[]) =>
    adminClient
      .from('rider_participation_status')
      .upsert(payload, { onConflict: 'event_id,moto_id,rider_id' })

  const { error } = await runUpsert(rows)
  if (!error) {
    return { error: null, legacyFallbackUsed: false }
  }

  if (!isLegacyUniqueConstraintError(error)) {
    return { error, legacyFallbackUsed: false }
  }

  const rowsByEvent = new Map<string, RiderParticipationStatusRow[]>()
  for (const row of rows) {
    const current = rowsByEvent.get(row.event_id) ?? []
    current.push(row)
    rowsByEvent.set(row.event_id, current)
  }

  for (const [eventId, eventRows] of rowsByEvent) {
    const riderIds = Array.from(new Set(eventRows.map((row) => row.rider_id)))
    const { error: cleanupError } = await adminClient
      .from('rider_participation_status')
      .delete()
      .eq('event_id', eventId)
      .in('rider_id', riderIds)

    if (cleanupError) {
      return { error: cleanupError, legacyFallbackUsed: false }
    }
  }

  const retry = await runUpsert(rows)
  return {
    error: retry.error ?? null,
    legacyFallbackUsed: !retry.error,
  }
}
