'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'

type CategoryRow = {
  id: string
  label: string
  year?: number | null
  gender?: 'BOY' | 'GIRL' | 'MIX' | null
  total_riders?: number | null
  resolver_source?: 'override' | 'rule' | 'default' | null
  stages?: {
    enableQualification: boolean
    enableQuarterFinal: boolean
    enableSemiFinal: boolean
  } | null
  final_classes?: string[] | null
  qualification_batch_count?: number | null
  max_riders_per_race?: number | null
  qualification_moto_count?: number | null
  repechage_max_riders_per_race?: number | null
  quarter_final_max_riders_per_race?: number | null
  semi_final_max_riders_per_race?: number | null
}

type EventGuideMeta = {
  id: string
  name: string
  community_name?: string | null
  event_logo_url?: string | null
  display_theme?: Record<string, unknown> | null
  final_class_options?: string[] | null
}

type CustomSplitRule = {
  id?: string
  category_id: string
  source_stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'REPECHAGE'
  rank_from: number
  rank_to: number
  target_stage: 'QUARTER_FINAL' | 'SEMI_FINAL' | 'REPECHAGE' | 'FINAL'
  target_final_class: string | null
  sort_order: number
  split_basis: 'COMBINED' | 'PER_BATCH' | 'CUSTOM_PER_BATCH'
  batch_no: number | null
}

const DEFAULT_FINAL_CLASS_OPTIONS = ['ELITE', 'NOVICE', 'PRO', 'ROOKIE', 'ADVANCED', 'INTERMEDIATE', 'ACADEMY', 'AMATEUR', 'BEGINNER']
const SOURCE_STAGE_OPTIONS: Array<CustomSplitRule['source_stage']> = ['QUALIFICATION', 'QUARTER_FINAL', 'SEMI_FINAL', 'REPECHAGE']
const TARGET_STAGE_OPTIONS: Array<CustomSplitRule['target_stage']> = ['FINAL', 'SEMI_FINAL', 'REPECHAGE', 'QUARTER_FINAL']
const SPLIT_BASIS_OPTIONS: Array<CustomSplitRule['split_basis']> = ['COMBINED', 'PER_BATCH', 'CUSTOM_PER_BATCH']

const splitBasisLabel = (value: CustomSplitRule['split_basis']) => {
  if (value === 'PER_BATCH') return 'Top N Per Batch'
  if (value === 'CUSTOM_PER_BATCH') return 'Custom Per Batch'
  return 'Combined Rank'
}

const formatStageLabel = (value: CustomSplitRule['source_stage'] | CustomSplitRule['target_stage']) =>
  value.replace(/_/g, ' ')

const createEmptyRule = (
  categoryId: string,
  sortOrder: number,
  splitBasis: CustomSplitRule['split_basis'] = 'COMBINED',
  targetFinalClass = 'ELITE'
): CustomSplitRule => ({
  category_id: categoryId,
  source_stage: 'QUALIFICATION',
  rank_from: Math.max(1, sortOrder + 1),
  rank_to: Math.max(1, sortOrder + 1),
  target_stage: 'FINAL',
  target_final_class: targetFinalClass,
  sort_order: sortOrder,
  split_basis: splitBasis,
  batch_no: splitBasis === 'CUSTOM_PER_BATCH' ? 1 : null,
})

type RaceEstimate = {
  qualificationRaceCount: number
  quarterRaceCount: number
  repechageRaceCount: number
  semiRaceCount: number
  finalRaceCount: number
  totalRaceCount: number
  notes: string[]
}

const distributeBucketSizes = (total: number, bucketCount: number) => {
  if (total <= 0 || bucketCount <= 0) return [] as number[]
  const base = Math.floor(total / bucketCount)
  const remainder = total % bucketCount
  return Array.from({ length: bucketCount }, (_, index) => base + (index < remainder ? 1 : 0)).filter((size) => size > 0)
}

const countCoveredRanks = (size: number, rankFrom: number, rankTo: number) => {
  if (size < rankFrom) return 0
  return Math.max(0, Math.min(size, rankTo) - rankFrom + 1)
}

const getStageSplitBasis = (
  rules: CustomSplitRule[],
  sourceStage: CustomSplitRule['source_stage']
): CustomSplitRule['split_basis'] => {
  return rules.find((rule) => rule.source_stage === sourceStage)?.split_basis ?? 'COMBINED'
}

const buildStageBucketSizes = (
  rules: CustomSplitRule[],
  sourceStage: CustomSplitRule['source_stage'],
  totalRiders: number,
  fallbackBucketCount: number,
  maxRidersPerRace: number
) => {
  const stageRules = rules.filter((rule) => rule.source_stage === sourceStage)
  if (stageRules.length === 0 || totalRiders <= 0) return [] as number[]
  const stageBasis = getStageSplitBasis(rules, sourceStage)
  if (stageBasis === 'CUSTOM_PER_BATCH') {
    const sizeByBatch = new Map<number, number>()
    stageRules.forEach((rule) => {
      const batchNo = Math.max(1, Number(rule.batch_no ?? 1))
      sizeByBatch.set(batchNo, Math.max(sizeByBatch.get(batchNo) ?? 0, Number(rule.rank_to) || 0))
    })
    const customSizes = Array.from(sizeByBatch.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, size]) => size)
      .filter((size) => size > 0)
    if (customSizes.length > 0) return customSizes
  }
  const bucketCount = Math.max(1, fallbackBucketCount || Math.ceil(totalRiders / Math.max(1, maxRidersPerRace)))
  return distributeBucketSizes(totalRiders, bucketCount)
}

const applyRulesToBuckets = (rules: CustomSplitRule[], sourceStage: CustomSplitRule['source_stage'], bucketSizes: number[]) => {
  const stageRules = rules.filter((rule) => rule.source_stage === sourceStage)
  const stageBasis = getStageSplitBasis(rules, sourceStage)
  const stageCounts = {
    QUARTER_FINAL: 0,
    REPECHAGE: 0,
    SEMI_FINAL: 0,
  }
  const finalCounts = new Map<string, number>()

  if (stageRules.length === 0) {
    return { stageCounts, finalCounts }
  }

  if (stageBasis === 'COMBINED') {
    const total = bucketSizes.reduce((sum, size) => sum + size, 0)
    stageRules.forEach((rule) => {
      const count = countCoveredRanks(total, rule.rank_from, rule.rank_to)
      if (rule.target_stage === 'FINAL') {
        finalCounts.set(rule.target_final_class ?? 'ELITE', (finalCounts.get(rule.target_final_class ?? 'ELITE') ?? 0) + count)
      } else {
        stageCounts[rule.target_stage] += count
      }
    })
    return { stageCounts, finalCounts }
  }

  if (stageBasis === 'PER_BATCH') {
    bucketSizes.forEach((bucketSize) => {
      stageRules.forEach((rule) => {
        const count = countCoveredRanks(bucketSize, rule.rank_from, rule.rank_to)
        if (rule.target_stage === 'FINAL') {
          finalCounts.set(rule.target_final_class ?? 'ELITE', (finalCounts.get(rule.target_final_class ?? 'ELITE') ?? 0) + count)
        } else {
          stageCounts[rule.target_stage] += count
        }
      })
    })
    return { stageCounts, finalCounts }
  }

  bucketSizes.forEach((bucketSize, index) => {
    const batchNo = index + 1
    stageRules
      .filter((rule) => (rule.batch_no ?? 1) === batchNo)
      .forEach((rule) => {
        const count = countCoveredRanks(bucketSize, rule.rank_from, rule.rank_to)
        if (rule.target_stage === 'FINAL') {
          finalCounts.set(rule.target_final_class ?? 'ELITE', (finalCounts.get(rule.target_final_class ?? 'ELITE') ?? 0) + count)
        } else {
          stageCounts[rule.target_stage] += count
        }
      })
  })

  return { stageCounts, finalCounts }
}

const estimateRaceCounts = (category: CategoryRow, rules: CustomSplitRule[]): RaceEstimate => {
  const totalRiders = Math.max(0, Number(category.total_riders ?? 0))
  const maxRidersPerRace = Math.max(1, Number(category.max_riders_per_race ?? 8))
  const repechageMaxRidersPerRace = Math.max(1, Number(category.repechage_max_riders_per_race ?? category.max_riders_per_race ?? 8))
  const quarterMaxRidersPerRace = Math.max(1, Number(category.quarter_final_max_riders_per_race ?? category.max_riders_per_race ?? 8))
  const semiMaxRidersPerRace = Math.max(1, Number(category.semi_final_max_riders_per_race ?? category.max_riders_per_race ?? 8))
  const qualificationRules = rules.filter((rule) => rule.source_stage === 'QUALIFICATION')
  const actualQualificationBatchCount = Math.max(0, Number(category.qualification_batch_count ?? 0))
  const qualificationBucketSizes =
    actualQualificationBatchCount > 0
      ? distributeBucketSizes(totalRiders, actualQualificationBatchCount)
      : qualificationRules.length > 0 && getStageSplitBasis(rules, 'QUALIFICATION') === 'CUSTOM_PER_BATCH'
      ? buildStageBucketSizes(rules, 'QUALIFICATION', totalRiders, 0, maxRidersPerRace)
      : distributeBucketSizes(
          totalRiders,
          totalRiders <= maxRidersPerRace ? 1 : Math.max(1, Math.ceil(totalRiders / maxRidersPerRace))
        )

  const qualificationBatchCount = qualificationBucketSizes.length
  const qualificationRaceCount =
    qualificationBatchCount === 0 ? 0 : qualificationBatchCount === 1 ? 3 : qualificationBatchCount * 2

  const qualificationOutputs = applyRulesToBuckets(rules, 'QUALIFICATION', qualificationBucketSizes)

  const repechageBucketSizes = buildStageBucketSizes(
    rules,
    'REPECHAGE',
    qualificationOutputs.stageCounts.REPECHAGE,
    Math.ceil(Math.max(qualificationOutputs.stageCounts.REPECHAGE, 0) / repechageMaxRidersPerRace),
    repechageMaxRidersPerRace
  )
  const repechageRaceCount = repechageBucketSizes.length
  const repechageOutputs = applyRulesToBuckets(rules, 'REPECHAGE', repechageBucketSizes)

  const quarterIncoming = qualificationOutputs.stageCounts.QUARTER_FINAL + repechageOutputs.stageCounts.QUARTER_FINAL
  const quarterBucketSizes = buildStageBucketSizes(
    rules,
    'QUARTER_FINAL',
    quarterIncoming,
    Math.ceil(Math.max(quarterIncoming, 0) / quarterMaxRidersPerRace),
    quarterMaxRidersPerRace
  )
  const quarterRaceCount = quarterBucketSizes.length
  const quarterOutputs = applyRulesToBuckets(rules, 'QUARTER_FINAL', quarterBucketSizes)

  const semiIncoming =
    qualificationOutputs.stageCounts.SEMI_FINAL + repechageOutputs.stageCounts.SEMI_FINAL + quarterOutputs.stageCounts.SEMI_FINAL
  const semiBucketSizes = buildStageBucketSizes(
    rules,
    'SEMI_FINAL',
    semiIncoming,
    Math.ceil(Math.max(semiIncoming, 0) / semiMaxRidersPerRace),
    semiMaxRidersPerRace
  )
  const semiRaceCount = semiBucketSizes.length
  const semiOutputs = applyRulesToBuckets(rules, 'SEMI_FINAL', semiBucketSizes)

  const finalCounts = new Map<string, number>()
  ;[qualificationOutputs.finalCounts, repechageOutputs.finalCounts, quarterOutputs.finalCounts, semiOutputs.finalCounts].forEach((map) => {
    map.forEach((count, key) => {
      finalCounts.set(key, (finalCounts.get(key) ?? 0) + count)
    })
  })
  const finalRaceCount = Array.from(finalCounts.values()).filter((count) => count > 0).length

  const notes: string[] = []
  if (qualificationBatchCount === 1 && qualificationRaceCount === 3) {
    notes.push('1 batch memakai 3 moto qualification.')
    notes.push('Urutan gate Moto 3 mengikuti total point terkecil dari Moto 1 dan Moto 2.')
  } else if (qualificationBatchCount > 1) {
    notes.push(`Qualification dihitung ${qualificationRaceCount} race dari ${qualificationBatchCount} batch x 2 moto.`)
  }
  if (repechageRaceCount > 0) notes.push(`Repechage: ${repechageRaceCount} moto/race.`)
  if (quarterRaceCount > 0) notes.push(`Quarter Final: ${quarterRaceCount} moto/race.`)
  if (semiRaceCount > 0) notes.push(`Semi Final: ${semiRaceCount} moto/race.`)
  if (finalRaceCount > 0) notes.push(`Final class: ${finalRaceCount} moto/race.`)

  return {
    qualificationRaceCount,
    quarterRaceCount,
    repechageRaceCount,
    semiRaceCount,
    finalRaceCount,
    totalRaceCount: qualificationRaceCount + quarterRaceCount + repechageRaceCount + semiRaceCount + finalRaceCount,
    notes,
  }
}

const buildRiderRaceEstimateText = (estimate: RaceEstimate) => {
  const qualificationPerRider =
    estimate.qualificationRaceCount <= 0
      ? 0
      : estimate.qualificationRaceCount === 3
        ? 3
        : 2
  const extraStageCount =
    (estimate.repechageRaceCount > 0 ? 1 : 0) +
    (estimate.quarterRaceCount > 0 ? 1 : 0) +
    (estimate.semiRaceCount > 0 ? 1 : 0) +
    (estimate.finalRaceCount > 0 ? 1 : 0)
  const maxRacePerRider = qualificationPerRider + extraStageCount

  if (estimate.totalRaceCount <= 0) {
    return 'Prediksi jumlah moto belum bisa dihitung karena data rider atau rules belum lengkap.'
  }

  if (qualificationPerRider <= 0) {
    return `Kategori ini diprediksi punya ${estimate.totalRaceCount} moto/race. Rider yang lolos stage bisa race sampai sekitar ${maxRacePerRider} kali.`
  }

  return `Prediksi: kategori ini punya ${estimate.totalRaceCount} moto/race. Setiap rider minimal race ${qualificationPerRider} kali di qualification. Rider yang terus lolos bisa race sampai sekitar ${maxRacePerRider} kali.`
}

const buildCustomStageGuideLines = (rules: CustomSplitRule[]) => {
  const targetStageOrder: Array<CustomSplitRule['target_stage']> = ['QUARTER_FINAL', 'REPECHAGE', 'SEMI_FINAL', 'FINAL']
  return SOURCE_STAGE_OPTIONS
    .filter((stage) => rules.some((rule) => rule.source_stage === stage))
    .map((sourceStage) => {
      const stageRules = rules.filter((rule) => rule.source_stage === sourceStage)
      const labels = targetStageOrder.flatMap((targetStage) => {
        const targetRules = stageRules.filter((rule) => rule.target_stage === targetStage)
        if (targetRules.length === 0) return []
        if (targetStage === 'FINAL') {
          return Array.from(new Set(targetRules.map((rule) => rule.target_final_class).filter(Boolean))).map(
            (finalClass) => `Final ${finalClass}`
          )
        }
        return [formatStageLabel(targetStage)]
      })

      if (labels.length === 0) return null
      const flowText =
        labels.length === 1
          ? labels[0]
          : labels.length === 2
            ? `${labels[0]} dan ${labels[1]}`
            : `${labels.slice(0, -1).join(', ')}, dan ${labels[labels.length - 1]}`

      return `Setelah ${formatStageLabel(sourceStage)}, rider yang lolos akan lanjut ke ${flowText}.`
    })
    .filter(Boolean) as string[]
}

const buildCustomAutomationNotes = (rules: CustomSplitRule[]) => {
  const notes: string[] = []
  const sourceStages = new Set(rules.map((rule) => rule.source_stage))
  const targetStages = new Set(rules.map((rule) => rule.target_stage))
  const hasRepechageToQuarter = rules.some(
    (rule) => rule.source_stage === 'REPECHAGE' && rule.target_stage === 'QUARTER_FINAL'
  )

  if (targetStages.has('REPECHAGE')) {
    notes.push('Jika ada rider yang masuk Repechage, sistem akan membuat moto Repechage setelah hasil sebelumnya dihitung.')
  }

  if (targetStages.has('QUARTER_FINAL')) {
    if (hasRepechageToQuarter) {
      notes.push('Quarter Final akan menunggu Repechage selesai jika ada rider dari Repechage yang harus masuk Quarter Final.')
    } else {
      notes.push('Sistem akan membuat Quarter Final setelah hasil sebelumnya dihitung.')
    }
  }

  if (targetStages.has('SEMI_FINAL')) {
    notes.push('Sistem akan membuat Semi Final setelah hasil sebelumnya dihitung.')
  }

  if (targetStages.has('FINAL')) {
    if (sourceStages.has('QUARTER_FINAL') || sourceStages.has('SEMI_FINAL') || sourceStages.has('REPECHAGE')) {
      notes.push('Final akan dibuat setelah stage sebelumnya selesai dihitung.')
    } else {
      notes.push('Final akan dibuat setelah qualification selesai dihitung.')
    }
  }

  return notes
}

type BatchCountPerStage = {
  qualification: number
  repechage: number
  quarterFinal: number
  semiFinal: number
  final: number
}

const calculateBatchCountPerStage = (category: CategoryRow, rules: CustomSplitRule[]): BatchCountPerStage => {
  const totalRiders = Math.max(0, Number(category.total_riders ?? 0))
  const maxRidersPerRace = Math.max(1, Number(category.max_riders_per_race ?? 8))
  const repechageMaxRidersPerRace = Math.max(1, Number(category.repechage_max_riders_per_race ?? category.max_riders_per_race ?? 8))
  const quarterMaxRidersPerRace = Math.max(1, Number(category.quarter_final_max_riders_per_race ?? category.max_riders_per_race ?? 8))
  const semiMaxRidersPerRace = Math.max(1, Number(category.semi_final_max_riders_per_race ?? category.max_riders_per_race ?? 8))

  const qualificationRules = rules.filter((rule) => rule.source_stage === 'QUALIFICATION')
  const actualQualificationBatchCount = Math.max(0, Number(category.qualification_batch_count ?? 0))
  const qualificationBucketSizes =
    actualQualificationBatchCount > 0
      ? distributeBucketSizes(totalRiders, actualQualificationBatchCount)
      : qualificationRules.length > 0 && getStageSplitBasis(rules, 'QUALIFICATION') === 'CUSTOM_PER_BATCH'
      ? buildStageBucketSizes(rules, 'QUALIFICATION', totalRiders, 0, maxRidersPerRace)
      : distributeBucketSizes(
          totalRiders,
          totalRiders <= maxRidersPerRace ? 1 : Math.max(1, Math.ceil(totalRiders / maxRidersPerRace))
        )

  const qualificationOutputs = applyRulesToBuckets(rules, 'QUALIFICATION', qualificationBucketSizes)
  const qualificationBatchCount = qualificationBucketSizes.length

  const repechageBucketSizes = buildStageBucketSizes(
    rules,
    'REPECHAGE',
    qualificationOutputs.stageCounts.REPECHAGE,
    Math.ceil(Math.max(qualificationOutputs.stageCounts.REPECHAGE, 0) / repechageMaxRidersPerRace),
    repechageMaxRidersPerRace
  )
  const repechageBatchCount = repechageBucketSizes.length
  const repechageOutputs = applyRulesToBuckets(rules, 'REPECHAGE', repechageBucketSizes)

  const quarterIncoming = qualificationOutputs.stageCounts.QUARTER_FINAL + repechageOutputs.stageCounts.QUARTER_FINAL
  const quarterBucketSizes = buildStageBucketSizes(
    rules,
    'QUARTER_FINAL',
    quarterIncoming,
    Math.ceil(Math.max(quarterIncoming, 0) / quarterMaxRidersPerRace),
    quarterMaxRidersPerRace
  )
  const quarterBatchCount = quarterBucketSizes.length
  const quarterOutputs = applyRulesToBuckets(rules, 'QUARTER_FINAL', quarterBucketSizes)

  const semiIncoming =
    qualificationOutputs.stageCounts.SEMI_FINAL + repechageOutputs.stageCounts.SEMI_FINAL + quarterOutputs.stageCounts.SEMI_FINAL
  const semiBucketSizes = buildStageBucketSizes(
    rules,
    'SEMI_FINAL',
    semiIncoming,
    Math.ceil(Math.max(semiIncoming, 0) / semiMaxRidersPerRace),
    semiMaxRidersPerRace
  )
  const semiBatchCount = semiBucketSizes.length

  const finalCounts = new Map<string, number>()
  const semiOutputs = applyRulesToBuckets(rules, 'SEMI_FINAL', semiBucketSizes)

  ;[qualificationOutputs.finalCounts, repechageOutputs.finalCounts, quarterOutputs.finalCounts, semiOutputs.finalCounts].forEach((map) => {
    map.forEach((count, key) => {
      finalCounts.set(key, (finalCounts.get(key) ?? 0) + count)
    })
  })
  const finalBatchCount = Array.from(finalCounts.values()).filter((count) => count > 0).length

  return {
    qualification: qualificationBatchCount,
    repechage: repechageBatchCount,
    quarterFinal: quarterBatchCount,
    semiFinal: semiBatchCount,
    final: finalBatchCount,
  }
}

const buildStageBucketSizeMap = (category: CategoryRow, rules: CustomSplitRule[]) => {
  const totalRiders = Math.max(0, Number(category.total_riders ?? 0))
  const maxRidersPerRace = Math.max(1, Number(category.max_riders_per_race ?? 8))
  const repechageMaxRidersPerRace = Math.max(1, Number(category.repechage_max_riders_per_race ?? category.max_riders_per_race ?? 8))
  const quarterMaxRidersPerRace = Math.max(1, Number(category.quarter_final_max_riders_per_race ?? category.max_riders_per_race ?? 8))
  const semiMaxRidersPerRace = Math.max(1, Number(category.semi_final_max_riders_per_race ?? category.max_riders_per_race ?? 8))
  const actualQualificationBatchCount = Math.max(0, Number(category.qualification_batch_count ?? 0))
  const qualificationRules = rules.filter((rule) => rule.source_stage === 'QUALIFICATION')
  const qualificationBucketSizes =
    actualQualificationBatchCount > 0
      ? distributeBucketSizes(totalRiders, actualQualificationBatchCount)
      : qualificationRules.length > 0 && getStageSplitBasis(rules, 'QUALIFICATION') === 'CUSTOM_PER_BATCH'
        ? buildStageBucketSizes(rules, 'QUALIFICATION', totalRiders, 0, maxRidersPerRace)
        : distributeBucketSizes(
            totalRiders,
            totalRiders <= maxRidersPerRace ? 1 : Math.max(1, Math.ceil(totalRiders / maxRidersPerRace))
          )
  const qualificationOutputs = applyRulesToBuckets(rules, 'QUALIFICATION', qualificationBucketSizes)
  const repechageBucketSizes = buildStageBucketSizes(
    rules,
    'REPECHAGE',
    qualificationOutputs.stageCounts.REPECHAGE,
    Math.ceil(Math.max(qualificationOutputs.stageCounts.REPECHAGE, 0) / repechageMaxRidersPerRace),
    repechageMaxRidersPerRace
  )
  const repechageOutputs = applyRulesToBuckets(rules, 'REPECHAGE', repechageBucketSizes)
  const quarterIncoming = qualificationOutputs.stageCounts.QUARTER_FINAL + repechageOutputs.stageCounts.QUARTER_FINAL
  const quarterBucketSizes = buildStageBucketSizes(
    rules,
    'QUARTER_FINAL',
    quarterIncoming,
    Math.ceil(Math.max(quarterIncoming, 0) / quarterMaxRidersPerRace),
    quarterMaxRidersPerRace
  )
  const quarterOutputs = applyRulesToBuckets(rules, 'QUARTER_FINAL', quarterBucketSizes)
  const semiIncoming =
    qualificationOutputs.stageCounts.SEMI_FINAL + repechageOutputs.stageCounts.SEMI_FINAL + quarterOutputs.stageCounts.SEMI_FINAL
  const semiBucketSizes = buildStageBucketSizes(
    rules,
    'SEMI_FINAL',
    semiIncoming,
    Math.ceil(Math.max(semiIncoming, 0) / semiMaxRidersPerRace),
    semiMaxRidersPerRace
  )

  return {
    QUALIFICATION: qualificationBucketSizes,
    REPECHAGE: repechageBucketSizes,
    QUARTER_FINAL: quarterBucketSizes,
    SEMI_FINAL: semiBucketSizes,
  } satisfies Record<CustomSplitRule['source_stage'], number[]>
}

const estimateRuleRiderCount = (
  rule: CustomSplitRule,
  stageBucketSizes: Record<CustomSplitRule['source_stage'], number[]>
) => {
  const bucketSizes = stageBucketSizes[rule.source_stage] ?? []
  if (rule.split_basis === 'COMBINED') {
    return countCoveredRanks(bucketSizes.reduce((sum, size) => sum + size, 0), rule.rank_from, rule.rank_to)
  }
  if (rule.split_basis === 'CUSTOM_PER_BATCH') {
    const batchSize = bucketSizes[Math.max(1, Number(rule.batch_no ?? 1)) - 1] ?? 0
    return countCoveredRanks(batchSize, rule.rank_from, rule.rank_to)
  }
  return bucketSizes.reduce((sum, size) => sum + countCoveredRanks(size, rule.rank_from, rule.rank_to), 0)
}

export default function CustomFinalSplitClient({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(false)
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(false)
  const [eventMeta, setEventMeta] = useState<EventGuideMeta | null>(null)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [rulesByCategory, setRulesByCategory] = useState<Record<string, CustomSplitRule[]>>({})

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...((options.headers ?? {}) as Record<string, string>),
    }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Request failed')
    return json
  }

  const load = async () => {
    if (!eventId) return
    setLoading(true)
    try {
      const res = await apiFetch(`/api/events/${eventId}/custom-final-split`)
      setEventMeta((res.data?.event ?? null) as EventGuideMeta | null)
      const nextCategories = (res.data?.categories ?? []) as CategoryRow[]
      const nextRules = (res.data?.rules ?? []) as CustomSplitRule[]
      const grouped: Record<string, CustomSplitRule[]> = {}
      for (const row of nextRules) {
        if (!grouped[row.category_id]) grouped[row.category_id] = []
        grouped[row.category_id].push({
          ...row,
          split_basis:
            row.split_basis === 'CUSTOM_PER_BATCH'
              ? 'CUSTOM_PER_BATCH'
              : row.split_basis === 'PER_BATCH'
                ? 'PER_BATCH'
                : 'COMBINED',
          batch_no: row.batch_no != null ? Number(row.batch_no) : null,
        })
      }
      Object.keys(grouped).forEach((categoryId) => {
        grouped[categoryId] = grouped[categoryId]
          .sort((a, b) => a.sort_order - b.sort_order || a.rank_from - b.rank_from)
          .map((rule, index) => ({ ...rule, sort_order: index }))
      })
      setCategories(nextCategories)
      setRulesByCategory(grouped)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal memuat final class rules.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const finalClassOptions = useMemo(() => {
    const configured =
      Array.isArray(eventMeta?.final_class_options) && eventMeta.final_class_options.length > 0
        ? eventMeta.final_class_options
        : DEFAULT_FINAL_CLASS_OPTIONS
    const existingRuleClasses = Object.values(rulesByCategory)
      .flat()
      .map((rule) => rule.target_final_class)
      .filter((value): value is string => Boolean(value?.trim()))
    return Array.from(new Set([...configured, ...existingRuleClasses].map((value) => value.trim().toUpperCase()).filter(Boolean)))
  }, [eventMeta?.final_class_options, rulesByCategory])

  const defaultFinalClass = finalClassOptions.includes('ELITE') ? 'ELITE' : finalClassOptions[0] ?? 'ELITE'

  const categorySummary = useMemo(() => {
    const summary: Record<string, string> = {}
    for (const category of categories) {
      const rules = rulesByCategory[category.id] ?? []
      const estimate = estimateRaceCounts(category, rules)
      const stageBasisSummary = SOURCE_STAGE_OPTIONS
        .filter((stage) => rules.some((rule) => rule.source_stage === stage))
        .map((stage) => `${formatStageLabel(stage)}: ${splitBasisLabel(getStageSplitBasis(rules, stage))}`)
        .join(' | ')
      summary[category.id] =
        rules.length === 0
          ? 'Belum ada custom split.'
          : `Estimasi race ${estimate.totalRaceCount} | ${stageBasisSummary || 'Basis stage standar'} | ` +
            rules
              .map((rule) => {
                const rankLabel = `${rule.rank_from}-${rule.rank_to}`
                const targetLabel = rule.target_stage === 'FINAL' ? rule.target_final_class : formatStageLabel(rule.target_stage)
                return rule.split_basis === 'CUSTOM_PER_BATCH'
                  ? `${formatStageLabel(rule.source_stage)} | Batch ${rule.batch_no ?? '?'} ${rankLabel} -> ${targetLabel}`
                  : `${formatStageLabel(rule.source_stage)} | ${rankLabel} -> ${targetLabel}`
              })
              .join(' | ')
    }
    return summary
  }, [categories, rulesByCategory])

  const batchCountPerStage = useMemo(() => {
    const result: Record<string, BatchCountPerStage> = {}
    for (const category of categories) {
      const rules = rulesByCategory[category.id] ?? []
      result[category.id] = calculateBatchCountPerStage(category, rules)
    }
    return result
  }, [categories, rulesByCategory])

  const guideEntries = useMemo(() => {
    return categories.map((category) => {
      const rules = rulesByCategory[category.id] ?? []
      const estimate = estimateRaceCounts(category, rules)
      const totalRiders = Math.max(0, Number(category.total_riders ?? 0))
      const maxRidersPerRace = Math.max(1, Number(category.max_riders_per_race ?? 8))
      const actualQualificationBatchCount = Math.max(0, Number(category.qualification_batch_count ?? 0))
      const batchCount =
        actualQualificationBatchCount > 0
          ? actualQualificationBatchCount
          : totalRiders > 0
            ? Math.max(1, Math.ceil(totalRiders / maxRidersPerRace))
            : 0
      const usesSingleBatchFinal = batchCount === 1
      const qualificationMotoCount = usesSingleBatchFinal
        ? 3
        : Math.max(2, Number(category.qualification_moto_count ?? 2))
      const stageFlags = category.stages ?? {
        enableQualification: false,
        enableQuarterFinal: false,
        enableSemiFinal: false,
      }
      const introParts = [
        `${category.label} diikuti ${totalRiders} rider`,
        batchCount > 0 ? `dibagi menjadi ${batchCount} batch` : 'belum punya batch',
      ]
      if (stageFlags.enableQualification || usesSingleBatchFinal) {
        introParts.push(`dengan ${qualificationMotoCount} moto qualification per batch`)
      }

      let systemText = ''
      let allocationText = ''
      if (rules.length > 0) {
        const basisSummary = SOURCE_STAGE_OPTIONS
          .filter((stage) => rules.some((rule) => rule.source_stage === stage))
          .map((stage) => `${formatStageLabel(stage)} memakai ${splitBasisLabel(getStageSplitBasis(rules, stage))}`)
          .join(', ')
        systemText = `Pembagian rider memakai aturan khusus. ${basisSummary}.`
        allocationText = buildCustomAutomationNotes(rules).join(' ')
      } else if (stageFlags.enableQuarterFinal) {
        systemText = 'Alurnya: qualification dulu, lalu rider terbaik lanjut ke Quarter Final, Semi Final, dan Final.'
      } else if (stageFlags.enableSemiFinal) {
        systemText = 'Alurnya: qualification dulu, lalu rider terbaik lanjut ke Semi Final dan Final.'
      } else if (stageFlags.enableQualification) {
        systemText = 'Alurnya: qualification dulu, lalu rider dibagi ke kelas final sesuai hasil.'
      } else if (usesSingleBatchFinal) {
        systemText = 'Karena hanya 1 batch, semua rider race 3 moto. Total point dari 3 moto menentukan hasil akhir.'
      } else {
        systemText = 'Kategori ini langsung memakai hasil race tanpa pembagian stage tambahan.'
      }

      const stageBucketSizes = buildStageBucketSizeMap(category, rules)
      const ruleLines =
        rules.length === 0
          ? [
              stageFlags.enableQualification
                ? `Final class standar yang mungkin terbentuk: ${(category.final_classes ?? []).join(', ') || 'ELITE'}.`
                : `Final class default kategori ini: ${(category.final_classes ?? []).join(', ') || 'ELITE'}.`,
            ]
          : rules.map((rule) => {
              const targetLabel = rule.target_stage === 'FINAL' ? `Final ${rule.target_final_class}` : formatStageLabel(rule.target_stage)
              const riderCount = estimateRuleRiderCount(rule, stageBucketSizes)
              const countLabel = riderCount > 0 ? `, estimasi ${riderCount} rider` : ''
              if (rule.split_basis === 'CUSTOM_PER_BATCH') {
                return `${formatStageLabel(rule.source_stage)} Batch ${rule.batch_no ?? '?'}: posisi ${rule.rank_from}-${rule.rank_to} masuk ${targetLabel}${countLabel}.`
              }
              if (rule.split_basis === 'PER_BATCH') {
                return `${formatStageLabel(rule.source_stage)}: posisi ${rule.rank_from}-${rule.rank_to} dari setiap batch masuk ${targetLabel}${countLabel}.`
              }
              return `${formatStageLabel(rule.source_stage)}: posisi gabungan ${rule.rank_from}-${rule.rank_to} masuk ${targetLabel}${countLabel}.`
            })

      const customStageLines = rules.length > 0 ? buildCustomStageGuideLines(rules) : []
      const stageLine =
        customStageLines.length > 0
          ? customStageLines.join(' ')
          : stageFlags.enableQuarterFinal
            ? 'Rider yang lolos dari qualification akan lanjut ke Quarter Final, Semi Final, lalu Final.'
            : stageFlags.enableSemiFinal
              ? 'Rider yang lolos dari qualification akan lanjut ke Semi Final, lalu Final.'
              : stageFlags.enableQualification
                ? 'Setelah qualification selesai, rider dibagi ke final class sesuai aturan kategori ini.'
                : usesSingleBatchFinal
                  ? 'Setelah Moto 3 selesai dan dikunci, total point akan menjadi hasil akhir kategori.'
                  : 'Kategori ini langsung memakai hasil final tanpa stage lanjutan.'
      const batchCounts = batchCountPerStage[category.id]
      const batchLine = batchCounts
        ? [
            batchCounts.qualification > 0 ? `Q ${batchCounts.qualification}` : '',
            batchCounts.repechage > 0 ? `REP ${batchCounts.repechage}` : '',
            batchCounts.quarterFinal > 0 ? `QF ${batchCounts.quarterFinal}` : '',
            batchCounts.semiFinal > 0 ? `SF ${batchCounts.semiFinal}` : '',
            batchCounts.final > 0 ? `F ${batchCounts.final}` : '',
          ]
            .filter(Boolean)
            .join(' | ')
        : ''

      return {
        category,
        title: category.label,
        intro: `${introParts.join(', ')}.`,
        systemText,
        allocationText,
        batchCountText: batchLine ? `Batch per stage: ${batchLine}.` : '',
        estimateText:
          estimate.totalRaceCount > 0
            ? `Perkiraan jumlah moto kategori ini: ${estimate.totalRaceCount}. Rinciannya: Qualification ${estimate.qualificationRaceCount}, Quarter Final ${estimate.quarterRaceCount}, Repechage ${estimate.repechageRaceCount}, Semi Final ${estimate.semiRaceCount}, Final ${estimate.finalRaceCount}.`
            : 'Perkiraan jumlah moto akan muncul setelah data rider dan rules lengkap.',
        riderEstimateText: buildRiderRaceEstimateText(estimate),
        estimateNotes: estimate.notes,
        ruleLines,
        stageLine,
      }
    })
  }, [batchCountPerStage, categories, rulesByCategory])

  const guideText = useMemo(
    () =>
      guideEntries
        .map((entry) =>
          [
            entry.title,
            entry.intro,
            entry.systemText,
            entry.allocationText,
            entry.batchCountText,
            entry.estimateText,
            entry.riderEstimateText,
            ...entry.estimateNotes,
            entry.stageLine,
            ...entry.ruleLines,
          ]
            .filter(Boolean)
            .join('\n')
        )
        .join('\n\n'),
    [guideEntries]
  )

  const theme = (eventMeta?.display_theme ?? {}) as Record<string, unknown>
  const themePrimary = typeof theme.primary_color === 'string' ? theme.primary_color : '#2563eb'
  const themeSecondary = typeof theme.secondary_color === 'string' ? theme.secondary_color : '#0f172a'
  const themeHeaderBg = typeof theme.header_bg === 'string' ? theme.header_bg : '#e0f2fe'
  const themeCardBg = typeof theme.card_bg === 'string' ? theme.card_bg : '#ffffff'
  const themeLogoUrl =
    typeof eventMeta?.event_logo_url === 'string' && eventMeta.event_logo_url
      ? eventMeta.event_logo_url
      : typeof theme.logo_url === 'string' && theme.logo_url
        ? theme.logo_url
        : null
  const themeSlogan = typeof theme.slogan === 'string' ? theme.slogan : ''

  const copyGuideText = async () => {
    try {
      await navigator.clipboard.writeText(guideText)
      alert('Race System Guide berhasil disalin.')
    } catch {
      alert('Gagal menyalin Race System Guide.')
    }
  }

  const printGuide = () => {
    const sections = guideEntries
      .map(
        (entry) => `
          <section class="guide-card">
            <h2>${entry.title}</h2>
            <p>${entry.intro}</p>
            <p>${entry.systemText}</p>
            ${entry.allocationText ? `<p>${entry.allocationText}</p>` : ''}
            ${entry.batchCountText ? `<p>${entry.batchCountText}</p>` : ''}
            <p>${entry.estimateText}</p>
            <p>${entry.riderEstimateText}</p>
            ${entry.estimateNotes.map((line) => `<p>${line}</p>`).join('')}
            <p>${entry.stageLine}</p>
            <ul>${entry.ruleLines.map((line) => `<li>${line}</li>`).join('')}</ul>
          </section>
        `
      )
      .join('')
    const headerLogo = themeLogoUrl
      ? `<div class="hero-logo-wrap"><img class="hero-logo" src="${themeLogoUrl}" alt="${eventMeta?.name ?? 'Event Logo'}" /></div>`
      : ''
    const subtitleParts = [eventMeta?.community_name, themeSlogan].filter(Boolean).join(' | ')

    const frame = document.createElement('iframe')
    frame.style.position = 'fixed'
    frame.style.right = '0'
    frame.style.bottom = '0'
    frame.style.width = '0'
    frame.style.height = '0'
    frame.style.border = '0'
    frame.setAttribute('aria-hidden', 'true')
    document.body.appendChild(frame)

    const frameWindow = frame.contentWindow
    const frameDocument = frame.contentDocument ?? frameWindow?.document
    if (!frameWindow || !frameDocument) {
      document.body.removeChild(frame)
      alert('Gagal membuka dokumen cetak Race System Guide.')
      return
    }

    frameDocument.open()
    frameDocument.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Race System Guide</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
      .page { padding: 28px; }
      .hero { background: linear-gradient(135deg, ${themeSecondary}, ${themePrimary}); color: white; padding: 24px; border-radius: 22px; margin-bottom: 18px; position: relative; overflow: hidden; }
      .hero::after { content: ''; position: absolute; inset: auto -60px -80px auto; width: 220px; height: 220px; background: rgba(255,255,255,0.10); border-radius: 999px; }
      .hero-top { display: flex; align-items: center; justify-content: space-between; gap: 18px; position: relative; z-index: 1; }
      .hero-logo-wrap { width: 82px; height: 82px; border-radius: 20px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.28); display: grid; place-items: center; flex: 0 0 auto; padding: 8px; }
      .hero-logo { width: 100%; height: 100%; object-fit: contain; }
      .hero-copy { flex: 1 1 auto; }
      .hero-kicker { display: inline-block; margin-bottom: 8px; padding: 6px 10px; border-radius: 999px; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.22); font-size: 11px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
      .hero h1 { margin: 0 0 8px; font-size: 30px; line-height: 1.05; }
      .hero p { margin: 0; font-size: 14px; opacity: 0.94; }
      .guide-card { background: ${themeCardBg}; border: 2px solid ${themeHeaderBg}; border-radius: 18px; padding: 18px; margin-bottom: 14px; page-break-inside: avoid; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); }
      .guide-card h2 { margin: 0 0 8px; font-size: 22px; color: ${themeSecondary}; }
      .guide-card p { margin: 0 0 8px; line-height: 1.5; }
      .guide-card ul { margin: 10px 0 0 18px; padding: 0; }
      .guide-card li { margin-bottom: 6px; line-height: 1.45; }
      .guide-card li::marker { color: ${themePrimary}; }
      @media print {
        body { background: white; }
        .page { padding: 0; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <div class="hero">
        <div class="hero-top">
          ${headerLogo}
          <div class="hero-copy">
            <div class="hero-kicker">Race System Guide</div>
            <h1>${eventMeta?.name ?? 'Race System Guide'}</h1>
            <p>${subtitleParts || 'Penjelasan otomatis sistem race per kategori untuk dibagikan ke wali rider dan panitia.'}</p>
          </div>
        </div>
      </div>
      ${sections}
    </main>
    <script>
      window.onload = () => {
        window.print();
      };
    </script>
  </body>
</html>`)
    frameDocument.close()
    frameWindow.focus()
    const cleanup = () => {
      window.setTimeout(() => {
        if (frame.parentNode) {
          frame.parentNode.removeChild(frame)
        }
      }, 1000)
    }
    frameWindow.onafterprint = cleanup
    window.setTimeout(() => {
      try {
        frameWindow.print()
      } finally {
        cleanup()
      }
    }, 250)
  }

  const updateRule = (categoryId: string, index: number, patch: Partial<CustomSplitRule>) => {
    setRulesByCategory((prev) => {
      const current = [...(prev[categoryId] ?? [])]
      current[index] = { ...current[index], ...patch }
      return { ...prev, [categoryId]: current }
    })
  }

  const addRule = (categoryId: string) => {
    setRulesByCategory((prev) => {
      const current = [...(prev[categoryId] ?? [])]
      const splitBasis = getStageSplitBasis(current, 'QUALIFICATION')
      current.push(createEmptyRule(categoryId, current.length, splitBasis, defaultFinalClass))
      return { ...prev, [categoryId]: current }
    })
  }

  const updateSplitBasis = (
    categoryId: string,
    sourceStage: CustomSplitRule['source_stage'],
    splitBasis: CustomSplitRule['split_basis']
  ) => {
    setRulesByCategory((prev) => {
      const current = [...(prev[categoryId] ?? [])]
      if (current.length === 0 && sourceStage === 'QUALIFICATION') {
        return { ...prev, [categoryId]: [createEmptyRule(categoryId, 0, splitBasis, defaultFinalClass)] }
      }
      return {
        ...prev,
        [categoryId]: current.map((rule) =>
          rule.source_stage === sourceStage
            ? {
                ...rule,
                split_basis: splitBasis,
                batch_no: splitBasis === 'CUSTOM_PER_BATCH' ? rule.batch_no ?? 1 : null,
              }
            : rule
        ),
      }
    })
  }

  const removeRule = (categoryId: string, index: number) => {
    setRulesByCategory((prev) => {
      const current = [...(prev[categoryId] ?? [])]
      current.splice(index, 1)
      return {
        ...prev,
        [categoryId]: current.map((rule, nextIndex) => ({ ...rule, sort_order: nextIndex })),
      }
    })
  }

  const saveRules = async (categoryId: string) => {
    const payload = (rulesByCategory[categoryId] ?? []).map((rule, index) => ({
      ...rule,
      sort_order: index,
      rank_from: Number(rule.rank_from),
      rank_to: Number(rule.rank_to),
      target_final_class: rule.target_stage === 'FINAL' ? rule.target_final_class ?? defaultFinalClass : null,
      split_basis:
        rule.split_basis === 'CUSTOM_PER_BATCH'
          ? 'CUSTOM_PER_BATCH'
          : rule.split_basis === 'PER_BATCH'
            ? 'PER_BATCH'
            : 'COMBINED',
      batch_no: rule.split_basis === 'CUSTOM_PER_BATCH' ? Math.max(1, Number(rule.batch_no) || 1) : null,
    }))
    const category = categories.find((item) => item.id === categoryId)
    const totalRiders = Math.max(0, Number(category?.total_riders ?? 0))
    const qualificationRules = payload.filter((rule) => rule.source_stage === 'QUALIFICATION')
    const qualificationBasis = qualificationRules[0]?.split_basis ?? null
    const allQualificationCombined =
      qualificationRules.length > 0 && qualificationRules.every((rule) => rule.split_basis === 'COMBINED')
    const highestCoveredRank = qualificationRules.reduce((max, rule) => Math.max(max, Number(rule.rank_to) || 0), 0)

    if (qualificationBasis === 'COMBINED' && allQualificationCombined && totalRiders > 0 && highestCoveredRank < totalRiders) {
      alert(
        `Rule saat ini hanya mencakup rank 1-${highestCoveredRank}, sementara total rider kategori ini ${totalRiders}. Lengkapi rule sampai rank ${totalRiders} dulu.`
      )
      return
    }

    setSavingCategoryId(categoryId)
    try {
      await apiFetch(`/api/events/${eventId}/custom-final-split`, {
        method: 'POST',
        body: JSON.stringify({
          category_id: categoryId,
          rules: payload,
        }),
      })
      await load()
      alert('Final class rules berhasil disimpan.')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menyimpan final class rules.')
    } finally {
      setSavingCategoryId(null)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 1180 }}>
      <div
        style={{
          border: '2px solid #111',
          borderRadius: 18,
          background: '#fff',
          padding: 18,
          display: 'grid',
          gap: 8,
        }}
      >
                <div style={{ fontSize: 26, fontWeight: 950 }}>Final Class Rules</div>
                <div style={{ color: '#334155', fontWeight: 700 }}>
          Override split standar AMS per kategori. Dipakai kalau kamu butuh pola khusus seperti 9 rider: top 3 ke Final Elite, 3 berikutnya ke Final Novice.
        </div>
        <div style={{ color: '#64748b', fontSize: 13, fontWeight: 800 }}>
          Pilihan Final Class mengikuti <b>Event Settings - Display & Race Format - Final classes</b>.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {finalClassOptions.length > 0 ? (
            finalClassOptions.map((value) => (
              <span
                key={value}
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#0f172a',
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                {value}
              </span>
            ))
          ) : (
            <span style={{ color: '#64748b', fontSize: 12, fontWeight: 800 }}>-</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '2px solid #111',
              background: '#dbeafe',
              fontWeight: 900,
            }}
          >
            Race System Guide
          </button>
        </div>
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '2px dashed #111',
            background: '#f8fafc',
            fontSize: 13,
            fontWeight: 700,
            color: '#475569',
          }}
        >
          Custom split sekarang bisa dipakai untuk hasil <b>Qualification</b>, <b>Quarter Final</b>, <b>Repechage</b>, dan <b>Semi Final</b>.
          <br />
          <b>Combined Rank</b> = rank gabungan seluruh batch.
          <br />
          <b>Top N Per Batch</b> = range rank dihitung ulang di tiap batch.
          <br />
          <b>Custom Per Batch</b> = tiap batch boleh punya rule sendiri.
        </div>
      </div>

      {loading && (
        <div style={{ padding: 14, border: '2px dashed #111', borderRadius: 14, background: '#fff', fontWeight: 900 }}>
          Loading final class rules...
        </div>
      )}

      {!loading &&
        categories.map((category) => {
          const rules = rulesByCategory[category.id] ?? []
          const estimate = estimateRaceCounts(category, rules)
          return (
            <section
              key={category.id}
              style={{
                border: '2px solid #111',
                borderRadius: 18,
                background: '#fff',
                padding: 18,
                display: 'grid',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 24, fontWeight: 950 }}>{category.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                    Total Rider: {category.total_riders ?? 0}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                    Estimasi Race: {estimate.totalRaceCount} (Q {estimate.qualificationRaceCount} | QF {estimate.quarterRaceCount} | REP {estimate.repechageRaceCount} | SF {estimate.semiRaceCount} | F {estimate.finalRaceCount})
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', display: 'grid', gap: 6 }}>
                    <div>Batch per stage:</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {(
                        [
                          { label: 'Q', value: batchCountPerStage[category.id]?.qualification ?? 0 },
                          estimate.repechageRaceCount > 0 ? { label: 'REP', value: batchCountPerStage[category.id]?.repechage ?? 0 } : null,
                          estimate.quarterRaceCount > 0 ? { label: 'QF', value: batchCountPerStage[category.id]?.quarterFinal ?? 0 } : null,
                          estimate.semiRaceCount > 0 ? { label: 'SF', value: batchCountPerStage[category.id]?.semiFinal ?? 0 } : null,
                          estimate.finalRaceCount > 0 ? { label: 'F', value: batchCountPerStage[category.id]?.final ?? 0 } : null,
                        ] as Array<{ label: string; value: number } | null>
                      )
                        .filter((item): item is { label: string; value: number } => item !== null && item.value > 0)
                        .map((item) => (
                          <span
                            key={`${category.id}-${item.label}`}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 999,
                              border: '1px solid #cbd5e1',
                              background: '#f8fafc',
                              color: '#0f172a',
                              fontSize: 11,
                              fontWeight: 900,
                            }}
                          >
                            {item.label}: {item.value}
                          </span>
                        ))}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>{categorySummary[category.id]}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} />
              </div>

              {rules.length === 0 && (
                <div style={{ padding: 12, borderRadius: 12, border: '2px dashed #111', background: '#f8fafc', fontWeight: 800 }}>
                  Belum ada custom split. Kalau kategori ini cukup pakai rule AMS standar, boleh dibiarkan kosong.
                </div>
              )}

              {rules.map((rule, index) => (
                <div
                  key={`${category.id}-${index}`}
                  style={{
                    display: 'grid',
                    gap: 10,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    alignItems: 'end',
                    border: '2px solid #111',
                    borderRadius: 14,
                    padding: 12,
                    background: '#f8fafc',
                  }}
                >
                  {rule.split_basis === 'CUSTOM_PER_BATCH' && (
                    <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>
                      <span>Batch</span>
                      <input
                        type="number"
                        min={1}
                        value={rule.batch_no ?? 1}
                        onChange={(e) => updateRule(category.id, index, { batch_no: Math.max(1, Number(e.target.value) || 1) })}
                        style={{ padding: '10px 12px', borderRadius: 10, border: '2px solid #111', background: '#fff' }}
                      />
                    </label>
                  )}

                  <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>
                    <span>Source Stage</span>
                    <select
                      value={rule.source_stage}
                      onChange={(e) =>
                        updateRule(category.id, index, (() => {
                          const nextStage = e.target.value as CustomSplitRule['source_stage']
                          const nextBasis = getStageSplitBasis(rules, nextStage)
                          return {
                            source_stage: nextStage,
                            split_basis: nextBasis,
                            batch_no: nextBasis === 'CUSTOM_PER_BATCH' ? rule.batch_no ?? 1 : null,
                          }
                        })())
                      }
                      style={{ padding: '10px 12px', borderRadius: 10, border: '2px solid #111', background: '#fff' }}
                    >
                      {SOURCE_STAGE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>
                    <span>Rule Basis</span>
                    <select
                      value={rule.split_basis}
                      onChange={(e) =>
                        updateSplitBasis(category.id, rule.source_stage, e.target.value as CustomSplitRule['split_basis'])
                      }
                      style={{ padding: '10px 12px', borderRadius: 10, border: '2px solid #111', background: '#fff' }}
                    >
                      {SPLIT_BASIS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {splitBasisLabel(option)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>
                    <span>{rule.split_basis === 'COMBINED' ? 'Rank From' : 'Rank From Per Batch'}</span>
                    <input
                      type="number"
                      min={1}
                      value={rule.rank_from}
                      onChange={(e) => updateRule(category.id, index, { rank_from: Number(e.target.value) || 1 })}
                      style={{ padding: '10px 12px', borderRadius: 10, border: '2px solid #111', background: '#fff' }}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>
                    <span>{rule.split_basis === 'COMBINED' ? 'Rank To' : 'Rank To Per Batch'}</span>
                    <input
                      type="number"
                      min={rule.rank_from}
                      value={rule.rank_to}
                      onChange={(e) => updateRule(category.id, index, { rank_to: Number(e.target.value) || rule.rank_from })}
                      style={{ padding: '10px 12px', borderRadius: 10, border: '2px solid #111', background: '#fff' }}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>
                    <span>Target Stage</span>
                    <select
                      value={rule.target_stage}
                      onChange={(e) =>
                        updateRule(category.id, index, {
                          target_stage: e.target.value as CustomSplitRule['target_stage'],
                          target_final_class: e.target.value === 'FINAL' ? rule.target_final_class ?? defaultFinalClass : null,
                        })
                      }
                      style={{ padding: '10px 12px', borderRadius: 10, border: '2px solid #111', background: '#fff' }}
                    >
                      {TARGET_STAGE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>
                    <span>Final Class</span>
                    <select
                      value={rule.target_final_class ?? defaultFinalClass}
                      onChange={(e) => updateRule(category.id, index, { target_final_class: e.target.value })}
                      disabled={rule.target_stage !== 'FINAL'}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '2px solid #111',
                        background: rule.target_stage === 'FINAL' ? '#fff' : '#e2e8f0',
                      }}
                    >
                      {finalClassOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() => removeRule(category.id, index)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '2px solid #111',
                      background: '#ffd7d7',
                      fontWeight: 900,
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  flexWrap: 'wrap',
                  paddingTop: 4,
                }}
              >
                <button
                  type="button"
                  onClick={() => addRule(category.id)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: '2px solid #111',
                    background: '#fff1b8',
                    fontWeight: 900,
                  }}
                >
                  Add Rule
                </button>
                <button
                  type="button"
                  onClick={() => saveRules(category.id)}
                  disabled={savingCategoryId === category.id}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 10,
                    border: '2px solid #111',
                    background: '#bfead2',
                    fontWeight: 900,
                    opacity: savingCategoryId === category.id ? 0.7 : 1,
                  }}
                >
                  {savingCategoryId === category.id ? 'Saving...' : 'Save Rules'}
                </button>
              </div>
            </section>
          )
        })}

      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
            zIndex: 60,
          }}
        >
          <div
            style={{
              width: 'min(980px, 100%)',
              maxHeight: '90vh',
              overflow: 'auto',
              borderRadius: 20,
              border: '2px solid #111',
              background: '#fff',
              padding: 18,
              display: 'grid',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 28, fontWeight: 950 }}>Race System Guide</div>
                <div style={{ color: '#475569', fontWeight: 700 }}>
                  Penjelasan otomatis sistem penilaian dan pembagian stage/final per kategori.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => void copyGuideText()}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '2px solid #111',
                    background: '#fff1b8',
                    fontWeight: 900,
                  }}
                >
                  Copy Text
                </button>
                <button
                  type="button"
                  onClick={printGuide}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '2px solid #111',
                    background: '#d9f99d',
                    fontWeight: 900,
                  }}
                >
                  Cetak / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '2px solid #111',
                    background: '#ffd7d7',
                    fontWeight: 900,
                  }}
                >
                  Tutup
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              <section
                style={{
                  border: `2px solid ${themeHeaderBg}`,
                  borderRadius: 18,
                  background: `linear-gradient(135deg, ${themeSecondary}, ${themePrimary})`,
                  color: '#fff',
                  padding: 18,
                  display: 'flex',
                  gap: 16,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                {themeLogoUrl && (
                  <div
                    style={{
                      width: 82,
                      height: 82,
                      borderRadius: 18,
                      background: 'rgba(255,255,255,0.12)',
                      border: '1px solid rgba(255,255,255,0.24)',
                      display: 'grid',
                      placeItems: 'center',
                      padding: 8,
                    }}
                  >
                    <Image
                      src={themeLogoUrl}
                      alt={eventMeta?.name ?? 'Event Logo'}
                      width={66}
                      height={66}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>
                )}
                <div style={{ display: 'grid', gap: 6 }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      width: 'fit-content',
                      padding: '6px 10px',
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.12)',
                      border: '1px solid rgba(255,255,255,0.22)',
                      fontSize: 11,
                      fontWeight: 900,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Race System Guide
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 950 }}>{eventMeta?.name ?? 'Race System Guide'}</div>
                  {(eventMeta?.community_name || themeSlogan) && (
                    <div style={{ fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>
                      {[eventMeta?.community_name, themeSlogan].filter(Boolean).join(' | ')}
                    </div>
                  )}
                </div>
              </section>

              {guideEntries.map((entry) => (
                <section
                  key={entry.category.id}
                  style={{
                    border: `2px solid ${themeHeaderBg}`,
                    borderRadius: 16,
                    background: themeCardBg,
                    padding: 16,
                    display: 'grid',
                    gap: 8,
                    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
                  }}
                >
                <div style={{ fontSize: 22, fontWeight: 950, color: themeSecondary }}>{entry.title}</div>
                <div style={{ color: '#0f172a', fontWeight: 700, lineHeight: 1.5 }}>{entry.intro}</div>
                <div style={{ color: '#334155', fontWeight: 700, lineHeight: 1.5 }}>{entry.systemText}</div>
                {entry.allocationText && (
                  <div style={{ color: themePrimary, fontWeight: 900, lineHeight: 1.5 }}>{entry.allocationText}</div>
                )}
                {entry.batchCountText && (
                  <div style={{ color: '#475569', fontWeight: 800, lineHeight: 1.5 }}>{entry.batchCountText}</div>
                )}
                <div style={{ color: '#0f172a', fontWeight: 900, lineHeight: 1.5 }}>{entry.estimateText}</div>
                <div style={{ color: themePrimary, fontWeight: 950, lineHeight: 1.5 }}>{entry.riderEstimateText}</div>
                  {entry.estimateNotes.length > 0 && (
                    <div style={{ display: 'grid', gap: 4 }}>
                      {entry.estimateNotes.map((line, index) => (
                        <div key={`${entry.category.id}-estimate-${index}`} style={{ color: '#475569', fontWeight: 800, lineHeight: 1.45 }}>
                          {line}
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ color: '#334155', fontWeight: 700, lineHeight: 1.5 }}>{entry.stageLine}</div>
                  <ul style={{ margin: '4px 0 0 18px', padding: 0, display: 'grid', gap: 6 }}>
                    {entry.ruleLines.map((line, index) => (
                      <li key={`${entry.category.id}-${index}`} style={{ color: '#0f172a', fontWeight: 700, lineHeight: 1.45 }}>
                        {line}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
