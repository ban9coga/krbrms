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
  tieBreakers?: number[]
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

const compareTieBreakers = (a: number[] = [], b: number[] = []) => {
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const av = a[index] ?? 9999
    const bv = b[index] ?? 9999
    if (av !== bv) return av - bv
  }
  return 0
}

const rankByPoints = (
  scores: Record<string, number>,
  tieBreakersByRider?: Record<string, number[]>
): RankedRider[] => {
  const rows = Object.entries(scores)
    .map(([riderId, points]) => ({ riderId, points, tieBreakers: tieBreakersByRider?.[riderId] ?? [] }))
    .sort((a, b) => {
      if (a.points !== b.points) return a.points - b.points
      const tieDiff = compareTieBreakers(a.tieBreakers, b.tieBreakers)
      if (tieDiff !== 0) return tieDiff
      return a.riderId.localeCompare(b.riderId)
    })

  let currentRank = 0
  let lastPoints: number | null = null
  let lastTieBreakers: number[] | null = null
  return rows.map((row, idx) => {
    if (
      lastPoints === null ||
      row.points !== lastPoints ||
      compareTieBreakers(row.tieBreakers, lastTieBreakers ?? []) !== 0
    ) {
      currentRank = idx + 1
      lastPoints = row.points
      lastTieBreakers = row.tieBreakers
    }
    return { ...row, rank: currentRank }
  })
}

export function computeQualificationAdvancesFromRanks(
  ranked: RankedRider[],
  primaryAdvance: Pick<StageAdvance, 'toStage' | 'finalClass'> = { toStage: 'QUARTER_FINAL' },
  customRules?: CustomSplitRule[],
  options?: {
    singleBatchFinalElite?: boolean
  }
): StageAdvance[] {
  const advances: StageAdvance[] = []
  const primaryRows = ranked.slice(0, 4)
  const consolationRows = ranked.slice(primaryRows.length)
  const splitRemainderHalf = Math.ceil(consolationRows.length / 2)
  const orderedRules = Array.isArray(customRules) && customRules.length > 0
    ? [...customRules].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.rankFrom - b.rankFrom || a.rankTo - b.rankTo
      )
    : []
  const singleBatchFinalElite = Boolean(options?.singleBatchFinalElite) && orderedRules.length === 0

  for (const [index, row] of ranked.entries()) {
    const slot = index + 1
    const customRule = orderedRules.find((item) => slot >= item.rankFrom && slot <= item.rankTo)

    if (customRule) {
      if (customRule.targetStage === 'FINAL') {
        advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass: customRule.targetFinalClass ?? 'ELITE' })
      } else {
        advances.push({ riderId: row.riderId, toStage: customRule.targetStage })
      }
    } else if (singleBatchFinalElite) {
      advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass: 'ELITE' })
    } else {
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
  }

  return advances
}

export function computeQualification(
  batches: BatchInput[],
  pointResolver: PointResolver = defaultPointResolver,
  primaryAdvance: Pick<StageAdvance, 'toStage' | 'finalClass'> = { toStage: 'QUARTER_FINAL' },
  customRules?: CustomSplitRule[],
  options?: {
    singleBatchFinalElite?: boolean
  }
): { batchRanks: Record<string, RankedRider[]>; advances: StageAdvance[] } {
  const advances: StageAdvance[] = []
  const batchRanks: Record<string, RankedRider[]> = {}

  for (const batch of batches) {
    const scoreMap: Record<string, number> = {}
    const tieBreakersByRider: Record<string, number[]> = {}
    for (const riderId of batch.riders) scoreMap[riderId] = 0

    for (const finish of batch.finishes) {
      if (!scoreMap.hasOwnProperty(finish.riderId)) continue
      scoreMap[finish.riderId] += pointResolver(finish.finishOrder)
    }

    const maxMotoIndex = batch.finishes.reduce((max, finish) => Math.max(max, finish.motoIndex ?? 0), 0)
    for (const riderId of batch.riders) {
      const finishByMoto = new Map(
        batch.finishes
          .filter((finish) => finish.riderId === riderId)
          .map((finish) => [finish.motoIndex, pointResolver(finish.finishOrder)])
      )
      const tieBreakers: number[] = []
      for (let motoIndex = maxMotoIndex; motoIndex >= 1; motoIndex -= 1) {
        tieBreakers.push(finishByMoto.get(motoIndex) ?? 9999)
      }
      tieBreakersByRider[riderId] = tieBreakers
    }

    const ranked = rankByPoints(scoreMap, tieBreakersByRider)
    batchRanks[batch.batchId] = ranked
    advances.push(...computeQualificationAdvancesFromRanks(ranked, primaryAdvance, customRules, options))
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
