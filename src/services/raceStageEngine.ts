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
  finalClass?: FinalClass
}

export type FinalClass =
  | 'ROOKIE'
  | 'BEGINNER'
  | 'NOVICE'
  | 'AMATEUR'
  | 'ACADEMY'
  | 'INTERMEDIATE'
  | 'ADVANCED'
  | 'PRO'
  | 'ELITE'

export type CustomSplitRule = {
  rankFrom: number
  rankTo: number
  targetStage: 'QUARTER_FINAL' | 'SEMI_FINAL' | 'FINAL'
  targetFinalClass?: FinalClass | null
  sortOrder?: number
}

export type FinalFinish = {
  riderId: string
  finishOrder: number | null
  finalClass: FinalClass
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

export const FINAL_CLASS_ORDER: FinalClass[] = [
  'BEGINNER',
  'AMATEUR',
  'ACADEMY',
  'ADVANCED',
  'PRO',
  'ROOKIE',
  'NOVICE',
  'ELITE',
]

export type StageFlagsLike = {
  enableQuarterFinal: boolean
  enableSemiFinal: boolean
}

const applyPrimaryAdvance = (
  advances: StageAdvance[],
  riderId: string,
  primaryAdvance: Pick<StageAdvance, 'toStage' | 'finalClass'>
) => {
  if (primaryAdvance.toStage === 'FINAL') {
    advances.push({ riderId, toStage: 'FINAL', finalClass: primaryAdvance.finalClass ?? 'ELITE' })
    return
  }
  advances.push({ riderId, toStage: primaryAdvance.toStage })
}

export const resolveQualificationPrimaryAdvance = (stages: StageFlagsLike): Pick<StageAdvance, 'toStage' | 'finalClass'> => {
  if (stages.enableQuarterFinal) return { toStage: 'QUARTER_FINAL' }
  if (stages.enableSemiFinal) return { toStage: 'SEMI_FINAL' }
  return { toStage: 'FINAL', finalClass: 'ELITE' }
}

export const resolveQuarterFinalPrimaryAdvance = (stages: Pick<StageFlagsLike, 'enableSemiFinal'>): Pick<StageAdvance, 'toStage' | 'finalClass'> => {
  if (stages.enableSemiFinal) return { toStage: 'SEMI_FINAL' }
  return { toStage: 'FINAL', finalClass: 'ELITE' }
}

export const formatStageAdvanceLabel = (advance: Pick<StageAdvance, 'toStage' | 'finalClass'>): string => {
  if (advance.toStage === 'FINAL') return `FINAL ${advance.finalClass ?? 'ELITE'}`
  return advance.toStage.replace(/_/g, ' ')
}

const defaultPointResolver: PointResolver = (finishOrder) => {
  if (finishOrder === null || finishOrder === undefined) return 9999
  return finishOrder
}

const rankByPoints = (scores: Record<string, number>): RankedRider[] => {
  const rows = Object.entries(scores)
    .map(([riderId, points]) => ({ riderId, points }))
    .sort((a, b) => {
      if (a.points !== b.points) return a.points - b.points
      return a.riderId.localeCompare(b.riderId)
    })

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

export function computeQualificationAdvancesFromRanks(
  ranked: RankedRider[],
  primaryAdvance: Pick<StageAdvance, 'toStage' | 'finalClass'> = { toStage: 'QUARTER_FINAL' },
  customRules?: CustomSplitRule[]
): StageAdvance[] {
  if (Array.isArray(customRules) && customRules.length > 0) {
    const orderedRules = [...customRules].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.rankFrom - b.rankFrom || a.rankTo - b.rankTo
    )
    return ranked.reduce<StageAdvance[]>((acc, row, index) => {
      const slot = index + 1
      const rule = orderedRules.find((item) => slot >= item.rankFrom && slot <= item.rankTo)
      if (!rule) return acc
      if (rule.targetStage === 'FINAL') {
        acc.push({ riderId: row.riderId, toStage: 'FINAL', finalClass: rule.targetFinalClass ?? 'ELITE' })
        return acc
      }
      acc.push({ riderId: row.riderId, toStage: rule.targetStage })
      return acc
    }, [])
  }

  const advances: StageAdvance[] = []
  const primaryRows = ranked.slice(0, 4)
  const consolationRows = ranked.slice(primaryRows.length)
  const splitRemainderHalf = Math.ceil(consolationRows.length / 2)

  for (const [index, row] of ranked.entries()) {
    if (index < primaryRows.length) {
      applyPrimaryAdvance(advances, row.riderId, primaryAdvance)
    } else if (primaryAdvance.toStage === 'FINAL') {
      advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass: 'NOVICE' })
    } else if (primaryAdvance.toStage === 'SEMI_FINAL') {
      const consolationIndex = index - primaryRows.length
      const finalClass: FinalClass = consolationIndex < splitRemainderHalf ? 'PRO' : 'ROOKIE'
      advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass })
    } else {
      const qualificationLowerClasses: FinalClass[] = ['ADVANCED', 'ACADEMY', 'AMATEUR', 'BEGINNER']
      const finalClass = qualificationLowerClasses[index - primaryRows.length]
      if (finalClass) {
        advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass })
      }
    }
  }

  return advances
}

export function computeQualification(
  batches: BatchInput[],
  pointResolver: PointResolver = defaultPointResolver,
  primaryAdvance: Pick<StageAdvance, 'toStage' | 'finalClass'> = { toStage: 'QUARTER_FINAL' },
  customRules?: CustomSplitRule[]
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
    advances.push(...computeQualificationAdvancesFromRanks(ranked, primaryAdvance, customRules))
  }

  return { batchRanks, advances }
}

export function computeQuarterFinal(
  ranked: RankedRider[],
  primaryAdvance: Pick<StageAdvance, 'toStage' | 'finalClass'> = { toStage: 'SEMI_FINAL' }
): StageAdvance[] {
  const advances: StageAdvance[] = []
  const primaryRows = ranked.slice(0, 4)
  const consolationRows = ranked.slice(primaryRows.length)
  const splitRemainderHalf = Math.ceil(consolationRows.length / 2)
  for (const [index, row] of ranked.entries()) {
    if (index < primaryRows.length) {
      applyPrimaryAdvance(advances, row.riderId, primaryAdvance)
    } else {
      const consolationIndex = index - primaryRows.length
      const finalClass: FinalClass = consolationIndex < splitRemainderHalf ? 'PRO' : 'ROOKIE'
      advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass })
    }
  }
  return advances
}

export function computeSemiFinal(ranked: RankedRider[]): StageAdvance[] {
  const advances: StageAdvance[] = []
  const eliteCutoff = Math.ceil(ranked.length / 2)
  for (const [index, row] of ranked.entries()) {
    if (index < eliteCutoff) {
      advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass: 'ELITE' })
    } else {
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
