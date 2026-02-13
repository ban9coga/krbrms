'use server'

import { adminClient } from '../lib/auth'

export type ParticipationStatus = 'ACTIVE' | 'DNS' | 'DNF' | 'ABSENT'
export type RankType = 'COMPETITIVE' | 'ADMINISTRATIVE'

export type RiderStatusRow = {
  rider_id: string
  participation_status: ParticipationStatus
  registration_order: number
}

export type AbsentResolution = {
  rider_id: string
  rank_type: RankType
  administrative_order?: number
  absent_point?: number
}

export async function getAbsentPoint(eventId: string) {
  const { data, error } = await adminClient
    .from('event_absent_config')
    .select('absent_point')
    .eq('event_id', eventId)
    .maybeSingle()
  if (error) {
    console.warn('Absent config load failed. Using default 99.')
    return 99
  }
  return data?.absent_point ?? 99
}

export function resolveAbsentRanks(rows: RiderStatusRow[], absentPoint: number): AbsentResolution[] {
  const active = rows.filter((r) => r.participation_status !== 'ABSENT')
  const absent = rows
    .filter((r) => r.participation_status === 'ABSENT')
    .sort((a, b) => a.registration_order - b.registration_order)

  const resolutions: AbsentResolution[] = []
  for (const r of active) {
    resolutions.push({ rider_id: r.rider_id, rank_type: 'COMPETITIVE' })
  }
  let order = 1
  for (const r of absent) {
    resolutions.push({
      rider_id: r.rider_id,
      rank_type: 'ADMINISTRATIVE',
      administrative_order: order++,
      absent_point: absentPoint,
    })
  }
  return resolutions
}
