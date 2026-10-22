export type FinalSourceStage = 'QUALIFICATION' | 'REPECHAGE' | 'QUARTER_FINAL' | 'SEMI_FINAL'

export type FinalRankingSourceCandidate = {
  stage: FinalSourceStage
  position: number | null
  points: number | null
}

export type FinalRankingSourceSeed = {
  priority: number
  position: number
  points: number
}

export type FinalParticipationHistory = {
  dnsCount: number
  dnfCount: number
  dqCount: number
  finishCount: number
}

export type FinalRankingTieBreakEntry = {
  riderId: string
  totalPoints: number
  finishOrder: number | null | undefined
  resultStatus: string | null | undefined
  dnfProgressPercent: number | null | undefined
  history: FinalParticipationHistory
  source: FinalRankingSourceSeed
  qualificationRank: number | null | undefined
  qualificationPoints: number | null | undefined
  qualificationBatchOrder: number | null | undefined
  qualificationGate: number | null | undefined
}

const sourceStagePriority: Record<FinalSourceStage, number> = {
  QUALIFICATION: 1,
  REPECHAGE: 2,
  QUARTER_FINAL: 3,
  SEMI_FINAL: 4,
}

const MAX_RANK = Number.MAX_SAFE_INTEGER

const comparableNumber = (value: number | null | undefined) =>
  value == null || !Number.isFinite(Number(value)) ? MAX_RANK : Number(value)

const compareNumber = (a: number | null | undefined, b: number | null | undefined) =>
  comparableNumber(a) - comparableNumber(b)

export const resolveFinalRankingSourceSeed = (
  candidates: FinalRankingSourceCandidate[]
): FinalRankingSourceSeed => {
  const rankedCandidates = candidates
    .filter((candidate) => candidate.position !== null)
    .map((candidate) => ({
      priority: sourceStagePriority[candidate.stage],
      position: comparableNumber(candidate.position),
      points: comparableNumber(candidate.points),
    }))
    .sort(
      (a, b) =>
        b.priority - a.priority || a.position - b.position || a.points - b.points
    )

  return rankedCandidates[0] ?? { priority: 0, position: MAX_RANK, points: MAX_RANK }
}

const resultStatusPriority = (status: string | null | undefined) => {
  switch (String(status ?? '').toUpperCase()) {
    case 'FINISH':
      return 0
    case 'DNF':
      return 1
    case 'DNS':
      return 2
    case 'DQ':
      return 3
    default:
      return 4
  }
}

const compareParticipationHistory = (a: FinalParticipationHistory, b: FinalParticipationHistory) => {
  if (a.dnsCount !== b.dnsCount) return a.dnsCount - b.dnsCount
  if (a.dnfCount !== b.dnfCount) return a.dnfCount - b.dnfCount
  if (a.dqCount !== b.dqCount) return a.dqCount - b.dqCount
  return b.finishCount - a.finishCount
}

export const compareFinalRankingEntries = (
  a: FinalRankingTieBreakEntry,
  b: FinalRankingTieBreakEntry,
  dnfProgressEnabled: boolean
) => {
  const pointsDiff = compareNumber(a.totalPoints, b.totalPoints)
  if (pointsDiff !== 0) return pointsDiff

  const finishOrderDiff = compareNumber(a.finishOrder, b.finishOrder)
  if (finishOrderDiff !== 0) return finishOrderDiff

  const statusDiff = resultStatusPriority(a.resultStatus) - resultStatusPriority(b.resultStatus)
  if (statusDiff !== 0) return statusDiff

  if (dnfProgressEnabled && a.resultStatus === 'DNF' && b.resultStatus === 'DNF') {
    const progressDiff = Number(b.dnfProgressPercent ?? -1) - Number(a.dnfProgressPercent ?? -1)
    if (progressDiff !== 0) return progressDiff
  }

  const historyDiff = compareParticipationHistory(a.history, b.history)
  if (historyDiff !== 0) return historyDiff

  const sourceStageDiff = b.source.priority - a.source.priority
  if (sourceStageDiff !== 0) return sourceStageDiff

  const sourcePositionDiff = compareNumber(a.source.position, b.source.position)
  if (sourcePositionDiff !== 0) return sourcePositionDiff

  const sourcePointsDiff = compareNumber(a.source.points, b.source.points)
  if (sourcePointsDiff !== 0) return sourcePointsDiff

  const qualificationRankDiff = compareNumber(a.qualificationRank, b.qualificationRank)
  if (qualificationRankDiff !== 0) return qualificationRankDiff

  const qualificationPointsDiff = compareNumber(a.qualificationPoints, b.qualificationPoints)
  if (qualificationPointsDiff !== 0) return qualificationPointsDiff

  const qualificationBatchDiff = compareNumber(a.qualificationBatchOrder, b.qualificationBatchOrder)
  if (qualificationBatchDiff !== 0) return qualificationBatchDiff

  const qualificationGateDiff = compareNumber(a.qualificationGate, b.qualificationGate)
  if (qualificationGateDiff !== 0) return qualificationGateDiff

  return a.riderId.localeCompare(b.riderId)
}
