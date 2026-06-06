export type NonFinishPenaltyConfig = {
  dnf_point_override?: number | null
  dns_point_override?: number | null
}

export const DEFAULT_NON_FINISH_AUTO_PENALTY = 9

const normalizePenaltyValue = (value: number | null | undefined) => {
  if (value == null) return DEFAULT_NON_FINISH_AUTO_PENALTY
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_NON_FINISH_AUTO_PENALTY
  return parsed
}

export const resolveLastPlaceBasePoint = (riderCount: number | null) => {
  if (!riderCount || riderCount <= 0) return null
  return riderCount
}

export const resolveNonFinishAutoPenalty = (
  status: string | null | undefined,
  config?: NonFinishPenaltyConfig
) => {
  const normalized = String(status ?? '').toUpperCase()
  if (normalized === 'DNF') return normalizePenaltyValue(config?.dnf_point_override)
  if (normalized === 'DNS' || normalized === 'ABSENT') return normalizePenaltyValue(config?.dns_point_override)
  return 0
}

export const resolveBasePointForRaceResult = (
  status: string | null | undefined,
  finishOrder: number | null | undefined,
  riderCount: number | null
) => {
  const normalized = String(status ?? 'FINISH').toUpperCase()
  if (normalized === 'DQ') return null
  if (normalized === 'DNF' && finishOrder != null) return finishOrder
  if (normalized === 'DNF' || normalized === 'DNS' || normalized === 'ABSENT') {
    return resolveLastPlaceBasePoint(riderCount)
  }
  return finishOrder ?? null
}

export const resolveTotalPointForRaceResult = (
  status: string | null | undefined,
  finishOrder: number | null | undefined,
  riderCount: number | null,
  config?: NonFinishPenaltyConfig
) => {
  const basePoint = resolveBasePointForRaceResult(status, finishOrder, riderCount)
  if (basePoint === null) return null
  return basePoint + resolveNonFinishAutoPenalty(status, config)
}
