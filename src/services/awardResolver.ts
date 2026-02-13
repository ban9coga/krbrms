'use server'

import type { ResolvedRank } from './rankingResolver'

export type AwardType =
  | 'PARTICIPATION'
  | 'BEGINNER'
  | 'AMATEUR'
  | 'ACADEMY'
  | 'ROOKIE'
  | 'PRO'
  | 'NOVICE'
  | 'ELITE'

export type AwardRow = {
  rider_id: string
  award_type: AwardType
  rank_type: 'COMPETITIVE' | 'ADMINISTRATIVE'
  position?: number
}

export function resolveAwards(params: {
  ranks: ResolvedRank[]
  finalClass?: AwardType
}) {
  const rows: AwardRow[] = []

  for (const r of params.ranks) {
    if (r.rank_type === 'ADMINISTRATIVE' || r.participation_status === 'ABSENT') {
      rows.push({ rider_id: r.rider_id, award_type: 'PARTICIPATION', rank_type: 'ADMINISTRATIVE' })
      continue
    }

    if (params.finalClass) {
      rows.push({ rider_id: r.rider_id, award_type: params.finalClass, rank_type: 'COMPETITIVE' })
    } else {
      rows.push({ rider_id: r.rider_id, award_type: 'PARTICIPATION', rank_type: 'COMPETITIVE' })
    }
  }

  return rows
}
