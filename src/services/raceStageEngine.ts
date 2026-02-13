export type RiderFinish = {
  riderId: string
  motoIndex: number
  finishOrder: number | null
}

export type BatchInput = {
  batchId: string
  riders: string[]
  finishes: RiderFinish[]
}

export type RankedRider = {
  riderId: string
  points: number
  rank: number
}

export type StageAdvance = {
  riderId: string
  toStage: 'QUARTER_FINAL' | 'SEMI_FINAL' | 'FINAL'
  finalClass?: 'BEGINNER' | 'AMATEUR' | 'ACADEMY' | 'ROOKIE' | 'PRO' | 'NOVICE' | 'ELITE'
}

export type FinalFinish = {
  riderId: string
  finishOrder: number | null
  finalClass: 'BEGINNER' | 'AMATEUR' | 'ACADEMY' | 'ROOKIE' | 'PRO' | 'NOVICE' | 'ELITE'
}

export type FinalWinner = {
  riderId: string
  finalClass: FinalFinish['finalClass']
  position: number
}

export type SafetyConfig = {
  minRaceSize?: number
}

export type SafetyResult = {
  ok: boolean
  warning?: string
}

export type PointResolver = (finishOrder: number | null) => number

const defaultPointResolver: PointResolver = (finishOrder) => {
  if (finishOrder === null || finishOrder === undefined) return 9999
  return finishOrder
}

const rankByPoints = (scores: Record<string, number>): RankedRider[] => {
  const rows = Object.entries(scores)
    .map(([riderId, points]) => ({ riderId, points }))
    .sort((a, b) => a.points - b.points)

  let currentRank = 0
  let lastPoints: number | null = null
  return rows.map((row, idx) => {
    if (lastPoints === null || row.points !== lastPoints) {
      currentRank = idx + 1
      lastPoints = row.points
    }
    return { ...row, rank: currentRank }
  })
}

export function computeQualification(
  batches: BatchInput[],
  pointResolver: PointResolver = defaultPointResolver
): { batchRanks: Record<string, RankedRider[]>; advances: StageAdvance[] } {
  const advances: StageAdvance[] = []
  const batchRanks: Record<string, RankedRider[]> = {}

  for (const batch of batches) {
    const scoreMap: Record<string, number> = {}
    for (const riderId of batch.riders) scoreMap[riderId] = 0

    for (const finish of batch.finishes) {
      if (!scoreMap.hasOwnProperty(finish.riderId)) continue
      scoreMap[finish.riderId] += pointResolver(finish.finishOrder)
    }

    const ranked = rankByPoints(scoreMap)
    batchRanks[batch.batchId] = ranked

    for (const row of ranked) {
      if (row.rank >= 1 && row.rank <= 4) {
        advances.push({ riderId: row.riderId, toStage: 'QUARTER_FINAL' })
      } else if (row.rank === 5) {
        advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass: 'ACADEMY' })
      } else if (row.rank === 6) {
        advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass: 'AMATEUR' })
      } else if (row.rank === 7 || row.rank === 8) {
        advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass: 'BEGINNER' })
      }
    }
  }

  return { batchRanks, advances }
}

export function computeQuarterFinal(ranked: RankedRider[]): StageAdvance[] {
  const advances: StageAdvance[] = []
  for (const row of ranked) {
    if (row.rank >= 1 && row.rank <= 4) {
      advances.push({ riderId: row.riderId, toStage: 'SEMI_FINAL' })
    } else if (row.rank === 5 || row.rank === 6) {
      advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass: 'PRO' })
    } else if (row.rank === 7 || row.rank === 8) {
      advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass: 'ROOKIE' })
    }
  }
  return advances
}

export function computeSemiFinal(ranked: RankedRider[]): StageAdvance[] {
  const advances: StageAdvance[] = []
  for (const row of ranked) {
    if (row.rank >= 1 && row.rank <= 4) {
      advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass: 'ELITE' })
    } else if (row.rank >= 5 && row.rank <= 8) {
      advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass: 'NOVICE' })
    }
  }
  return advances
}

// Final race: single moto, no carry-over points. Ranking = finish position.
export function computeFinalWinners(finishes: FinalFinish[]): FinalWinner[] {
  const byClass = new Map<FinalFinish['finalClass'], FinalFinish[]>()
  for (const row of finishes) {
    if (!byClass.has(row.finalClass)) byClass.set(row.finalClass, [])
    byClass.get(row.finalClass)?.push(row)
  }

  const winners: FinalWinner[] = []
  for (const [finalClass, rows] of byClass.entries()) {
    const ordered = rows
      .filter((r) => r.finishOrder !== null && r.finishOrder !== undefined)
      .sort((a, b) => (a.finishOrder ?? 9999) - (b.finishOrder ?? 9999))
    if (ordered.length > 0) {
      winners.push({ riderId: ordered[0].riderId, finalClass, position: ordered[0].finishOrder as number })
    }
  }
  return winners
}

export function validateFinalAssignments(
  finishes: FinalFinish[],
  config: SafetyConfig = {}
): SafetyResult {
  const minRaceSize = config.minRaceSize ?? 4
  if (finishes.length < minRaceSize) {
    const warning = `Final race size < ${minRaceSize}. Auto logic skipped.`
    console.warn(warning)
    return { ok: false, warning }
  }

  const seen = new Map<string, string>()
  for (const row of finishes) {
    const existing = seen.get(row.riderId)
    if (existing && existing !== row.finalClass) {
      const warning = `Rider ${row.riderId} appears in multiple final classes (${existing}, ${row.finalClass}). Auto logic skipped.`
      console.warn(warning)
      return { ok: false, warning }
    }
    seen.set(row.riderId, row.finalClass)
  }

  return { ok: true }
}
