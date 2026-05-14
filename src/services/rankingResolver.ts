'use server'

import { sumPenaltyPoints, type PenaltyStage } from './penaltyService'

export type ParticipationStatus = 'ACTIVE' | 'DNF' | 'DNS' | 'ABSENT'
export type RankType = 'COMPETITIVE' | 'ADMINISTRATIVE'

export type RankingRow = {
  rider_id: string
  race_point: number
  participation_status: ParticipationStatus
  administrative_order?: number
}

export type ResolvedRank = {
  rider_id: string
  total_point: number
  rank_type: RankType
  participation_status: ParticipationStatus
  administrative_order?: number
}

const statusPriority: Record<ParticipationStatus, number> = {
  ACTIVE: 1,
  DNF: 2,
  DNS: 3,
  ABSENT: 3,
}

export async function resolveRanking(params: {
  event_id: string
  stage: PenaltyStage
  rows: RankingRow[]
  penaltyEnabled?: boolean
}) {
  const penaltyEnabled = params.penaltyEnabled ?? false

  const resolved: ResolvedRank[] = []
  for (const row of params.rows) {
    const penalty = penaltyEnabled
      ? await sumPenaltyPoints({
          event_id: params.event_id,
          rider_id: row.rider_id,
          stage: params.stage,
        })
      : { total: 0 }

    resolved.push({
      rider_id: row.rider_id,
      total_point: row.race_point + penalty.total,
      participation_status: row.participation_status,
      rank_type: 'COMPETITIVE',
      administrative_order: row.administrative_order,
    })
  }

  const competitive = resolved
    .sort((a, b) => {
      const status = statusPriority[a.participation_status] - statusPriority[b.participation_status]
      if (status !== 0) return status
      return a.total_point - b.total_point
    })

  const administrative: ResolvedRank[] = []

  return { competitive, administrative }
}
