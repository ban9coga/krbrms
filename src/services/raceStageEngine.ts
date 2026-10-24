import {
  resolveQuarterEnabledQualificationLowerClasses,
  resolveSemiEnabledQualificationLowerClasses,
} from '../lib/advancedRaceDefaults'
import {
  compareQualificationTieBreakData,
  createQualificationTieBreakData,
  type QualificationTieBreakData,
} from '../lib/qualificationRanking'

export type RiderFinish = {
  riderId: string
  motoIndex: number
  finishOrder: number | null
  resultStatus?: string | null
  dnfProgressPercent?: number | null
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
  qualificationTieBreak?: QualificationTieBreakData
}

export type StageAdvance = {
  riderId: string
  toStage: 'QUARTER_FINAL' | 'SEMI_FINAL' | 'REPECHAGE' | 'FINAL'
  finalClass?: FinalClass
}

export type FinalClass =
  | 'EXPLORER'
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
  sourceStage?: 'QUALIFICATION' | 'QUARTER_FINAL' | 'REPECHAGE' | 'SEMI_FINAL' | 'FINAL'
  rankFrom: number
  rankTo: number
  targetStage: 'QUARTER_FINAL' | 'SEMI_FINAL' | 'REPECHAGE' | 'FINAL'
  targetFinalClass?: FinalClass | null
  sortOrder?: number
  splitBasis?: 'COMBINED' | 'PER_BATCH' | 'CUSTOM_PER_BATCH' | 'GLOBAL_ACTIVE_FIRST'
  batchNo?: number | null
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
  'EXPLORER',
  'AMATEUR',
  'BEGINNER',
  'ACADEMY',
  'INTERMEDIATE',
  'ADVANCED',
  'ROOKIE',
  'PRO',
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

const rankByPoints = (
  scores: Record<string, number>,
  tieBreakDataByRider?: Record<string, QualificationTieBreakData>,
  tieBreakOptions: { dnfProgressEnabled?: boolean; motoIndexes: number[] } = { motoIndexes: [] }
): RankedRider[] => {
  const rows = Object.entries(scores)
    .map(([riderId, points]) => ({ riderId, points, qualificationTieBreak: tieBreakDataByRider?.[riderId] }))
    .sort((a, b) => {
      if (a.points !== b.points) return a.points - b.points
      const tieDiff = compareQualificationTieBreakData(a.qualificationTieBreak, b.qualificationTieBreak, tieBreakOptions)
      if (tieDiff !== 0) return tieDiff
      return a.riderId.localeCompare(b.riderId)
    })

  let currentRank = 0
  let lastPoints: number | null = null
  let lastTieBreakData: QualificationTieBreakData | undefined
  return rows.map((row, idx) => {
    if (
      lastPoints === null ||
      row.points !== lastPoints ||
      compareQualificationTieBreakData(row.qualificationTieBreak, lastTieBreakData, tieBreakOptions) !== 0
    ) {
      currentRank = idx + 1
      lastPoints = row.points
      lastTieBreakData = row.qualificationTieBreak
    }
    const tieBreakers = tieBreakOptions.motoIndexes.map(
      (motoIndex) => row.qualificationTieBreak?.motoResults.find((result) => result.motoIndex === motoIndex)?.points ?? Number.MAX_SAFE_INTEGER
    )
    return { ...row, tieBreakers, rank: currentRank }
  })
}

export function computeQualificationAdvancesFromRanks(
  ranked: RankedRider[],
  primaryAdvance: Pick<StageAdvance, 'toStage' | 'finalClass'> = { toStage: 'QUARTER_FINAL' },
  customRules?: CustomSplitRule[],
  options?: {
    singleBatchFinalElite?: boolean
    quarterEnabledFinalClasses?: string[]
    semiEnabledFinalClasses?: string[]
  }
): StageAdvance[] {
  const advances: StageAdvance[] = []
  const primaryRows = ranked.slice(0, 4)
  const consolationRows = ranked.slice(primaryRows.length)
  const splitRemainderHalf = Math.ceil(consolationRows.length / 2)
  const quarterEnabledLowerClasses = resolveQuarterEnabledQualificationLowerClasses(options?.quarterEnabledFinalClasses ?? FINAL_CLASS_ORDER)
  const semiEnabledLowerClasses = resolveSemiEnabledQualificationLowerClasses(options?.semiEnabledFinalClasses ?? FINAL_CLASS_ORDER)
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
        if (semiEnabledLowerClasses.length === 1) {
          advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass: semiEnabledLowerClasses[0] as FinalClass })
        } else {
          const finalClass: FinalClass = consolationIndex < splitRemainderHalf ? 'PRO' : 'ROOKIE'
          advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass })
        }
      } else {
        const consolationIndex = index - primaryRows.length
        const totalConsolationCount = consolationRows.length
        let finalClass: FinalClass | undefined
        if (quarterEnabledLowerClasses.length > 0) {
          let start = 0
          const bucketBaseSize = Math.floor(totalConsolationCount / quarterEnabledLowerClasses.length)
          const bucketRemainder = totalConsolationCount % quarterEnabledLowerClasses.length
          for (let bucketIndex = 0; bucketIndex < quarterEnabledLowerClasses.length; bucketIndex += 1) {
            const bucketSize = bucketBaseSize + (bucketIndex < bucketRemainder ? 1 : 0)
            if (consolationIndex < start + bucketSize) {
              finalClass = quarterEnabledLowerClasses[bucketIndex] as FinalClass
              break
            }
            start += bucketSize
          }
        }
        if (finalClass) {
          advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass })
        }
      }
    }
  }

  return advances
}

export function computeCombinedQualificationBucketAdvances(
  ranked: RankedRider[],
  stages: StageFlagsLike,
  finalClasses: FinalClass[]
): StageAdvance[] {
  const advances: StageAdvance[] = []
  const normalizedFinalClasses = [...finalClasses]
  const lowerClassesDescendingStrength = normalizedFinalClasses
    .filter((finalClass) => finalClass !== 'ELITE' && finalClass !== 'NOVICE')
    .reverse()

  if (stages.enableQuarterFinal) {
    const quarterFinalists = ranked.slice(0, 16)
    quarterFinalists.forEach((row) => advances.push({ riderId: row.riderId, toStage: 'QUARTER_FINAL' }))
    lowerClassesDescendingStrength.forEach((finalClass, classIndex) => {
      ranked.slice(16 + classIndex * 8, 16 + (classIndex + 1) * 8).forEach((row) => {
        advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass })
      })
    })
    return advances
  }

  if (stages.enableSemiFinal) {
    const semiFinalists = ranked.slice(0, 16)
    semiFinalists.forEach((row) => advances.push({ riderId: row.riderId, toStage: 'SEMI_FINAL' }))
    lowerClassesDescendingStrength.forEach((finalClass, classIndex) => {
      ranked.slice(16 + classIndex * 8, 16 + (classIndex + 1) * 8).forEach((row) => {
        advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass })
      })
    })
    return advances
  }

  ranked.slice(0, 8).forEach((row) => {
    advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass: 'ELITE' })
  })
  ranked.slice(8, 16).forEach((row) => {
    advances.push({ riderId: row.riderId, toStage: 'FINAL', finalClass: 'NOVICE' })
  })
  return advances
}

export function computeQualification(
  batches: BatchInput[],
  pointResolver: PointResolver = defaultPointResolver,
  primaryAdvance: Pick<StageAdvance, 'toStage' | 'finalClass'> = { toStage: 'QUARTER_FINAL' },
  customRules?: CustomSplitRule[],
  options?: {
    singleBatchFinalElite?: boolean
    quarterEnabledFinalClasses?: string[]
    semiEnabledFinalClasses?: string[]
    dnfProgressEnabled?: boolean
    qualificationMotoCount?: number
  }
): { batchRanks: Record<string, RankedRider[]>; advances: StageAdvance[] } {
  const advances: StageAdvance[] = []
  const batchRanks: Record<string, RankedRider[]> = {}

  for (const batch of batches) {
    const scoreMap: Record<string, number> = {}
    const tieBreakDataByRider: Record<string, QualificationTieBreakData> = {}
    for (const riderId of batch.riders) scoreMap[riderId] = 0

    for (const finish of batch.finishes) {
      if (!scoreMap.hasOwnProperty(finish.riderId)) continue
      scoreMap[finish.riderId] += pointResolver(finish.finishOrder)
    }

    for (const riderId of batch.riders) {
      const riderFinishes = batch.finishes.filter((finish) => finish.riderId === riderId)
      
      tieBreakDataByRider[riderId] = createQualificationTieBreakData(
        riderFinishes.map((finish) => ({
          motoIndex: finish.motoIndex,
          points: pointResolver(finish.finishOrder),
          resultStatus: finish.resultStatus,
          dnfProgressPercent: finish.dnfProgressPercent,
        }))
      )
    }

    const maxMotoIndex = batch.finishes.reduce((max, finish) => Math.max(max, finish.motoIndex), 0)
    const qualificationMotoCount = options?.qualificationMotoCount ?? maxMotoIndex
    const motoIndexes = qualificationMotoCount >= 3
      ? [3]
      : Array.from(new Set(batch.finishes.map((finish) => finish.motoIndex))).sort((a, b) => b - a)
    const ranked = rankByPoints(scoreMap, tieBreakDataByRider, {
      dnfProgressEnabled: options?.dnfProgressEnabled,
      motoIndexes,
    })
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
      const finalClass: FinalClass =
        primaryAdvance.toStage === 'FINAL'
          ? 'NOVICE'
          : consolationIndex < splitRemainderHalf
            ? 'PRO'
            : 'ROOKIE'
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
