export type DragScoringFormat = 'MOTO_POINTS' | 'DRAG_MANUAL' | 'DRAG_TIMING'

export type DragRunStatus = 'FINISH' | 'DNS' | 'DNF' | 'DSQ' | 'RERUN'

export type TimedDragRunInput = {
  status: DragRunStatus
  reactionTimeSeconds: number | null
  elapsedTimeSeconds: number | null
  jumpStart: boolean
}

export type TimedDragRunScore = {
  status: DragRunStatus
  reactionTimeSeconds: number | null
  elapsedTimeSeconds: number | null
  jumpStart: boolean
  jumpPenaltySeconds: number
  totalSeconds: number | null
}

export type DragTimedRider = {
  riderId: string
  runs: TimedDragRunScore[]
}

export type DragTimedRanking = DragTimedRider & {
  completedRuns: number
  totalSeconds: number | null
  totalElapsedSeconds: number | null
  totalReactionSeconds: number | null
  status: 'COMPLETE' | 'DNF' | 'DNS' | 'DSQ' | 'INCOMPLETE'
  tiedWithPrevious: boolean
  needsRunoff: boolean
}

export type DragBracketHeat = {
  id: string
  roundNumber: number
  roundLabel: string
  heatNumber: number
  riderLaneAId: string | null
  riderLaneBId: string | null
  winnerRiderId: string | null
  status: 'UPCOMING' | 'COMPLETE'
  outcome: 'PENDING' | 'BYE'
  nextHeatId: string | null
  nextSlot: 'A' | 'B' | null
}

export type DragTimingHeat = {
  runNumber: 1 | 2
  heatNumber: number
  groupOneRiderId: string | null
  groupTwoRiderId: string | null
  laneARiderId: string | null
  laneBRiderId: string | null
}

const round3 = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000

export const resolveDragScoringFormat = (
  eventFormat: unknown,
  categoryOverride?: unknown
): DragScoringFormat => {
  const allowed: DragScoringFormat[] = ['MOTO_POINTS', 'DRAG_MANUAL', 'DRAG_TIMING']
  if (typeof categoryOverride === 'string' && allowed.includes(categoryOverride as DragScoringFormat)) {
    return categoryOverride as DragScoringFormat
  }
  if (typeof eventFormat === 'string' && allowed.includes(eventFormat as DragScoringFormat)) {
    return eventFormat as DragScoringFormat
  }
  return 'MOTO_POINTS'
}

/** Formula from BPC regulation: 10% RT + 90% ET, plus 3 seconds for a jump start. */
export const calculateDragRun = (input: TimedDragRunInput): TimedDragRunScore => {
  const reaction = input.reactionTimeSeconds
  const elapsed = input.elapsedTimeSeconds
  const jumpPenaltySeconds = input.jumpStart ? 3 : 0

  if (input.status !== 'FINISH') {
    return {
      status: input.status,
      reactionTimeSeconds: reaction,
      elapsedTimeSeconds: elapsed,
      jumpStart: input.jumpStart,
      jumpPenaltySeconds,
      totalSeconds: null,
    }
  }

  if (
    reaction == null || elapsed == null ||
    !Number.isFinite(reaction) || !Number.isFinite(elapsed) || elapsed < 0
  ) {
    throw new Error('RT and ET must be valid numbers for a finished run.')
  }

  return {
    status: 'FINISH',
    reactionTimeSeconds: reaction,
    elapsedTimeSeconds: elapsed,
    jumpStart: input.jumpStart,
    jumpPenaltySeconds,
    totalSeconds: round3(0.1 * reaction + 0.9 * elapsed + jumpPenaltySeconds),
  }
}

const terminalStatus = (runs: TimedDragRunScore[]): DragTimedRanking['status'] => {
  if (runs.some((run) => run.status === 'DSQ')) return 'DSQ'
  if (runs.some((run) => run.status === 'DNS')) return 'DNS'
  if (runs.some((run) => run.status === 'DNF')) return 'DNF'
  return 'INCOMPLETE'
}

const compareNullable = (a: number | null, b: number | null) => {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a - b
}

/** Ranks complete two-run performances by total, then ET, then RT. Exact ties need a runoff. */
export const rankTimedDragRiders = (riders: DragTimedRider[]): DragTimedRanking[] => {
  const rows = riders.map((rider): DragTimedRanking => {
    const runs = rider.runs
    const finishedRuns = runs.filter((run) => run.status === 'FINISH' && run.totalSeconds != null)
    const complete = runs.length >= 2 && finishedRuns.length === 2
    return {
      ...rider,
      completedRuns: finishedRuns.length,
      totalSeconds: complete ? round3(finishedRuns.reduce((sum, run) => sum + (run.totalSeconds ?? 0), 0)) : null,
      totalElapsedSeconds: complete
        ? round3(finishedRuns.reduce((sum, run) => sum + (run.elapsedTimeSeconds ?? 0), 0))
        : null,
      totalReactionSeconds: complete
        ? round3(finishedRuns.reduce((sum, run) => sum + (run.reactionTimeSeconds ?? 0), 0))
        : null,
      status: complete ? 'COMPLETE' : terminalStatus(runs),
      tiedWithPrevious: false,
      needsRunoff: false,
    }
  })

  rows.sort((a, b) => {
    const statusOrder = (status: DragTimedRanking['status']) => status === 'COMPLETE' ? 0 : 1
    const byStatus = statusOrder(a.status) - statusOrder(b.status)
    if (byStatus !== 0) return byStatus
    if (a.status !== 'COMPLETE' || b.status !== 'COMPLETE') return 0
    return compareNullable(a.totalSeconds, b.totalSeconds) ||
      compareNullable(a.totalElapsedSeconds, b.totalElapsedSeconds) ||
      compareNullable(a.totalReactionSeconds, b.totalReactionSeconds)
  })

  return rows.map((row, index) => {
    const previous = rows[index - 1]
    const sameTotal = Boolean(previous && row.status === 'COMPLETE' && previous.status === 'COMPLETE' && row.totalSeconds === previous.totalSeconds)
    const sameElapsed = sameTotal && row.totalElapsedSeconds === previous?.totalElapsedSeconds
    const exactTie = sameElapsed && row.totalReactionSeconds === previous?.totalReactionSeconds
    return { ...row, tiedWithPrevious: sameTotal, needsRunoff: Boolean(exactTie) }
  })
}

const bracketSeedOrder = (size: number) => {
  let seeds = [1, 2]
  while (seeds.length < size) {
    const nextSize = seeds.length * 2
    seeds = seeds.flatMap((seed) => [seed, nextSize + 1 - seed])
  }
  return seeds
}

const roundLabel = (roundNumber: number, roundCount: number) => {
  const remainingMatches = 2 ** (roundCount - roundNumber)
  if (remainingMatches === 1) return 'Final'
  if (remainingMatches === 2) return 'Semifinal'
  if (remainingMatches === 4) return 'Perempat Final'
  return `${remainingMatches * 2} Besar`
}

/** Builds a single-elimination bracket. Input order is seed order; null seeds become byes. */
export const buildDragManualBracket = (
  orderedRiderIds: string[],
  createId: () => string = () => crypto.randomUUID()
): DragBracketHeat[] => {
  const unique = new Set(orderedRiderIds)
  if (orderedRiderIds.length < 2) throw new Error('Minimal 2 rider untuk membuat bracket.')
  if (unique.size !== orderedRiderIds.length) throw new Error('Daftar rider bracket berisi duplikat.')

  let size = 2
  while (size < orderedRiderIds.length) size *= 2
  const roundCount = Math.log2(size)
  const seedOrder = bracketSeedOrder(size)
  const seededRiders = new Map(orderedRiderIds.map((riderId, index) => [index + 1, riderId]))
  const firstRoundSlots = seedOrder.map((seed) => seededRiders.get(seed) ?? null)
  const rounds: DragBracketHeat[][] = []

  for (let roundNumber = 1, heatCount = size / 2; heatCount >= 1; roundNumber += 1, heatCount = Math.floor(heatCount / 2)) {
    const heats = Array.from({ length: heatCount }, (_, index): DragBracketHeat => ({
      id: createId(),
      roundNumber,
      roundLabel: roundLabel(roundNumber, roundCount),
      heatNumber: index + 1,
      riderLaneAId: roundNumber === 1 ? firstRoundSlots[index * 2] : null,
      riderLaneBId: roundNumber === 1 ? firstRoundSlots[index * 2 + 1] : null,
      winnerRiderId: null,
      status: 'UPCOMING',
      outcome: 'PENDING',
      nextHeatId: null,
      nextSlot: null,
    }))
    rounds.push(heats)
  }

  for (let roundIndex = 0; roundIndex < rounds.length - 1; roundIndex += 1) {
    rounds[roundIndex].forEach((heat, index) => {
      const nextHeat = rounds[roundIndex + 1][Math.floor(index / 2)]
      heat.nextHeatId = nextHeat.id
      heat.nextSlot = index % 2 === 0 ? 'A' : 'B'
      // Only first-round empty seeds are byes. In later rounds an empty slot
      // means its feeder heat has not finished yet, so auto-advancing here
      // would let a rider skip the opponent who is still racing.
      const onlyRider = heat.riderLaneAId ?? heat.riderLaneBId
      const isBye = roundIndex === 0 && Boolean(onlyRider) && !(heat.riderLaneAId && heat.riderLaneBId)
      if (isBye) {
        heat.winnerRiderId = onlyRider
        heat.status = 'COMPLETE'
        heat.outcome = 'BYE'
        if (heat.nextSlot === 'A') nextHeat.riderLaneAId = onlyRider
        else nextHeat.riderLaneBId = onlyRider
      }
    })
  }

  return rounds.flat()
}

/** Creates two timed runs per rider; group 1 and group 2 swap lanes in run 2. */
export const buildDragTimingSchedule = (groupOneIds: string[], groupTwoIds: string[]): DragTimingHeat[] => {
  if (!groupOneIds.length || !groupTwoIds.length) throw new Error('Dua grup rider harus terisi.')
  if (new Set([...groupOneIds, ...groupTwoIds]).size !== groupOneIds.length + groupTwoIds.length) {
    throw new Error('Rider muncul lebih dari sekali pada pembagian grup.')
  }
  if (Math.abs(groupOneIds.length - groupTwoIds.length) > 1) {
    throw new Error('Jumlah rider kedua grup harus seimbang; selisih maksimal satu rider.')
  }

  const heats: DragTimingHeat[] = []
  for (const runNumber of [1, 2] as const) {
    const count = Math.max(groupOneIds.length, groupTwoIds.length)
    for (let index = 0; index < count; index += 1) {
      const groupOneRiderId = groupOneIds[index] ?? null
      // Reverse the opposing group in run two when there is more than one
      // rider. Pairings change without giving any rider an extra run.
      const groupTwoIndex = runNumber === 1 ? index : groupTwoIds.length - 1 - index
      const groupTwoRiderId = groupTwoIds[groupTwoIndex] ?? null
      heats.push({
        runNumber,
        heatNumber: index + 1,
        groupOneRiderId,
        groupTwoRiderId,
        laneARiderId: runNumber === 1 ? groupOneRiderId : groupTwoRiderId,
        laneBRiderId: runNumber === 1 ? groupTwoRiderId : groupOneRiderId,
      })
    }
  }
  return heats
}
