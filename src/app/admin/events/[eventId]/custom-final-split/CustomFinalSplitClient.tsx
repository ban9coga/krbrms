'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import { useApiFetch } from '@/src/hooks/useApiFetch'

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
  single_batch_final_enabled?: boolean | null
  single_batch_two_moto_final_enabled?: boolean | null
  repechage_max_riders_per_race?: number | null
  quarter_final_max_riders_per_race?: number | null
  semi_final_max_riders_per_race?: number | null
  dnf_point_override?: number | null
  dns_point_override?: number | null
}

type EventGuideMeta = {
  id: string
  name: string
  community_name?: string | null
  event_logo_url?: string | null
  display_theme?: Record<string, unknown> | null
  final_class_options?: string[] | null
  qualification_batch_mode?: 'FIXED' | 'ROTATE_EACH_MOTO'
  promote_next_best_on_dns?: boolean
}

type PenaltyGuideRule = {
  code: string
  description: string | null
  penalty_point: number
  applies_to_stage: 'MOTO' | 'QUARTER' | 'REPECHAGE' | 'SEMI' | 'FINAL' | 'ALL'
  is_active: boolean
  checker_enabled: boolean
  rd_enabled: boolean
}

type PenaltyGuideRequirement = {
  label: string
  penalty_code: string | null
  is_required: boolean
}

type PenaltyGuideFlags = {
  penalty_enabled: boolean
  absent_enabled: boolean
  dns_enabled: boolean
  finisher_dns_enabled: boolean
  dnf_enabled: boolean
  dnf_progress_enabled: boolean
  dq_retains_final_classification: boolean
}

const escapeGuideHtml = (value: unknown) => {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }
  return String(value ?? '').replace(/[&<>"']/g, (character) => entities[character] ?? character)
}

type CustomSplitRule = {
  id?: string
  category_id: string
  source_stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'REPECHAGE'
  rank_from: number
  rank_to: number
  target_stage: 'QUARTER_FINAL' | 'SEMI_FINAL' | 'REPECHAGE' | 'FINAL' | 'FINISHER'
  target_outcome?: 'STAGE' | 'FINISHER'
  target_final_class: string | null
  sort_order: number
  split_basis: 'COMBINED' | 'PER_BATCH' | 'CUSTOM_PER_BATCH' | 'GLOBAL_ACTIVE_FIRST'
  batch_no: number | null
}

const DEFAULT_FINAL_CLASS_OPTIONS = ['ELITE', 'NOVICE', 'PRO', 'ROOKIE', 'ADVANCED', 'INTERMEDIATE', 'ACADEMY', 'AMATEUR', 'BEGINNER']
const SOURCE_STAGE_OPTIONS: Array<CustomSplitRule['source_stage']> = ['QUALIFICATION', 'QUARTER_FINAL', 'SEMI_FINAL', 'REPECHAGE']
const TARGET_STAGE_OPTIONS: Array<CustomSplitRule['target_stage']> = ['FINAL', 'SEMI_FINAL', 'REPECHAGE', 'QUARTER_FINAL', 'FINISHER']
const SPLIT_BASIS_OPTIONS: Array<CustomSplitRule['split_basis']> = [
  'COMBINED',
  'PER_BATCH',
  'GLOBAL_ACTIVE_FIRST',
  'CUSTOM_PER_BATCH',
]

const splitBasisLabel = (value: CustomSplitRule['split_basis']) => {
  if (value === 'PER_BATCH') return 'Top N Per Batch'
  if (value === 'GLOBAL_ACTIVE_FIRST') return 'Global: FINISH/DNF First'
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
  qualificationMotoCount: number
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

const normalizeQualificationRuleBasis = (rules: CustomSplitRule[], rotatingBatches: boolean) =>
  rotatingBatches
    ? rules.map((rule) =>
        rule.source_stage === 'QUALIFICATION' && rule.split_basis !== 'GLOBAL_ACTIVE_FIRST'
          ? { ...rule, split_basis: 'COMBINED' as const, batch_no: null }
          : rule
      )
    : rules

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
      } else if (rule.target_stage !== 'FINISHER') {
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
        } else if (rule.target_stage !== 'FINISHER') {
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
        } else if (rule.target_stage !== 'FINISHER') {
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
  const oneBatchQualificationMotoCount = category.single_batch_two_moto_final_enabled === true ? 2 : 3
  const qualificationRaceCount =
    qualificationBatchCount === 0
      ? 0
      : qualificationBatchCount === 1
        ? oneBatchQualificationMotoCount
        : qualificationBatchCount * (Number(category.qualification_moto_count ?? 2) >= 3 ? 3 : 2)
  const qualificationMotoCount =
    qualificationBatchCount === 0
      ? 0
      : qualificationBatchCount === 1
        ? oneBatchQualificationMotoCount
        : Number(category.qualification_moto_count ?? 2) >= 3
          ? 3
          : 2

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
  if (qualificationBatchCount === 1 && qualificationMotoCount === 3) {
    notes.push('1 batch memakai 3 moto qualification.')
    notes.push('Urutan gate Moto 3 mengikuti total point terkecil dari Moto 1 dan Moto 2.')
  } else if (qualificationBatchCount === 1 && qualificationMotoCount === 2) {
    notes.push('1 batch memakai 2 moto qualification. Final dibuat setelah hasil Moto 2 dihitung.')
  } else if (qualificationBatchCount > 1) {
    notes.push(`Qualification dihitung ${qualificationRaceCount} race dari ${qualificationBatchCount} batch x ${qualificationMotoCount} moto.`)
  }
  if (repechageRaceCount > 0) notes.push(`Repechage: ${repechageRaceCount} moto/race.`)
  if (quarterRaceCount > 0) notes.push(`Quarter Final: ${quarterRaceCount} moto/race.`)
  if (semiRaceCount > 0) notes.push(`Semi Final: ${semiRaceCount} moto/race.`)
  if (finalRaceCount > 0) notes.push(`Final class: ${finalRaceCount} moto/race.`)

  return {
    qualificationRaceCount,
    qualificationMotoCount,
    quarterRaceCount,
    repechageRaceCount,
    semiRaceCount,
    finalRaceCount,
    totalRaceCount: qualificationRaceCount + quarterRaceCount + repechageRaceCount + semiRaceCount + finalRaceCount,
    notes,
  }
}

const buildRiderRaceEstimateText = (estimate: RaceEstimate) => {
  const qualificationPerRider = estimate.qualificationMotoCount
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
  const targetStageOrder: Array<CustomSplitRule['target_stage']> = ['QUARTER_FINAL', 'REPECHAGE', 'SEMI_FINAL', 'FINAL', 'FINISHER']
  return SOURCE_STAGE_OPTIONS
    .filter((stage) => rules.some((rule) => rule.source_stage === stage))
    .map((sourceStage) => {
      const stageRules = rules.filter((rule) => rule.source_stage === sourceStage)
      const labels = targetStageOrder.flatMap((targetStage) => {
        const targetRules = stageRules.filter((rule) => rule.target_stage === targetStage)
        if (targetRules.length === 0) return []
        if (targetStage === 'FINISHER') return ['Finisher']
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

  if (targetStages.has('FINISHER')) {
    notes.push('Rider pada rentang Finisher menjadi hasil akhir setelah stage sumbernya dan tidak dibuatkan moto tambahan.')
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
  const [showPenaltyGuide, setShowPenaltyGuide] = useState(false)
  const [penaltyGuideLoading, setPenaltyGuideLoading] = useState(false)
  const [penaltyGuideRules, setPenaltyGuideRules] = useState<PenaltyGuideRule[]>([])
  const [penaltyGuideRequirements, setPenaltyGuideRequirements] = useState<PenaltyGuideRequirement[]>([])
  const [penaltyGuideFlags, setPenaltyGuideFlags] = useState<PenaltyGuideFlags | null>(null)
  const [eventMeta, setEventMeta] = useState<EventGuideMeta | null>(null)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [rulesByCategory, setRulesByCategory] = useState<Record<string, CustomSplitRule[]>>({})

  const apiFetch = useApiFetch()

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
              : row.split_basis === 'GLOBAL_ACTIVE_FIRST'
                ? 'GLOBAL_ACTIVE_FIRST'
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

  const [updatingSettings, setUpdatingSettings] = useState(false)

  const handleTogglePromoteNextBestOnDns = async (checked: boolean) => {
    try {
      setUpdatingSettings(true)
      const res = await apiFetch(`/api/events/${eventId}/custom-final-split`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promote_next_best_on_dns: checked }),
      })
      if (!res.ok) {
        alert(res.error || 'Gagal mengubah pengaturan DNS Lucky Loser.')
        return
      }
      setEventMeta((prev) => (prev ? { ...prev, promote_next_best_on_dns: checked } : prev))
      await load()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal memperbarui pengaturan.')
    } finally {
      setUpdatingSettings(false)
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
    const rotatingBatches = eventMeta?.qualification_batch_mode === 'ROTATE_EACH_MOTO'
    for (const category of categories) {
      const rules = normalizeQualificationRuleBasis(rulesByCategory[category.id] ?? [], rotatingBatches)
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
                const targetLabel = rule.target_stage === 'FINAL'
                  ? rule.target_final_class
                  : rule.target_stage === 'FINISHER'
                    ? 'FINISHER'
                    : formatStageLabel(rule.target_stage)
                return rule.split_basis === 'CUSTOM_PER_BATCH'
                  ? `${formatStageLabel(rule.source_stage)} | Batch ${rule.batch_no ?? '?'} ${rankLabel} -> ${targetLabel}`
                  : `${formatStageLabel(rule.source_stage)} | ${rankLabel} -> ${targetLabel}`
              })
              .join(' | ')
    }
    return summary
  }, [categories, eventMeta?.qualification_batch_mode, rulesByCategory])

  const batchCountPerStage = useMemo(() => {
    const result: Record<string, BatchCountPerStage> = {}
    const rotatingBatches = eventMeta?.qualification_batch_mode === 'ROTATE_EACH_MOTO'
    for (const category of categories) {
      const rules = normalizeQualificationRuleBasis(rulesByCategory[category.id] ?? [], rotatingBatches)
      result[category.id] = calculateBatchCountPerStage(category, rules)
    }
    return result
  }, [categories, eventMeta?.qualification_batch_mode, rulesByCategory])

  const guideEntries = useMemo(() => {
    const rotatingBatches = eventMeta?.qualification_batch_mode === 'ROTATE_EACH_MOTO'
    return categories.map((category) => {
      const rules = normalizeQualificationRuleBasis(rulesByCategory[category.id] ?? [], rotatingBatches)
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
      const usesSingleBatchFinalOption = batchCount === 1 && (
        category.single_batch_final_enabled === true || category.single_batch_two_moto_final_enabled === true
      )
      const usesSingleBatchDirectResult = batchCount === 1 && !usesSingleBatchFinalOption
      const qualificationMotoCount = batchCount === 1
        ? (category.single_batch_two_moto_final_enabled === true ? 2 : 3)
        : Math.max(2, Number(category.qualification_moto_count ?? 2))
      const resolvedStageFlags = category.stages ?? {
        enableQualification: false,
        enableQuarterFinal: false,
        enableSemiFinal: false,
      }
      const stageFlags = {
        ...resolvedStageFlags,
        enableQualification: resolvedStageFlags.enableQualification || usesSingleBatchFinalOption,
      }
      const introParts = [
        `${category.label} diikuti ${totalRiders} rider`,
        batchCount > 0 ? `dibagi menjadi ${batchCount} batch` : 'belum punya batch',
      ]
      if (stageFlags.enableQualification || usesSingleBatchDirectResult) {
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
        if (rotatingBatches) systemText += ' Ranking Qualification memakai total poin global semua batch.'
        allocationText = buildCustomAutomationNotes(rules).join(' ')
      } else if (stageFlags.enableQuarterFinal) {
        systemText = 'Alurnya: qualification dulu, lalu rider terbaik lanjut ke Quarter Final, Semi Final, dan Final.'
      } else if (stageFlags.enableSemiFinal) {
        systemText = 'Alurnya: qualification dulu, lalu rider terbaik lanjut ke Semi Final dan Final.'
      } else if (stageFlags.enableQualification) {
        systemText = 'Alurnya: qualification dulu, lalu rider dibagi ke kelas final sesuai hasil.'
      } else if (usesSingleBatchDirectResult) {
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
              const targetLabel = rule.target_stage === 'FINAL'
                ? `Final ${rule.target_final_class}`
                : rule.target_stage === 'FINISHER'
                  ? 'Finisher (tanpa moto tambahan)'
                  : formatStageLabel(rule.target_stage)
              const riderCount = estimateRuleRiderCount(rule, stageBucketSizes)
              const countLabel = riderCount > 0 ? `, estimasi ${riderCount} rider` : ''
              if (rule.split_basis === 'CUSTOM_PER_BATCH') {
                return `${formatStageLabel(rule.source_stage)} Batch ${rule.batch_no ?? '?'}: posisi ${rule.rank_from}-${rule.rank_to} masuk ${targetLabel}${countLabel}.`
              }
              if (rule.split_basis === 'PER_BATCH') {
                return `${formatStageLabel(rule.source_stage)}: posisi ${rule.rank_from}-${rule.rank_to} dari setiap batch masuk ${targetLabel}${countLabel}.`
              }
              if (rule.split_basis === 'GLOBAL_ACTIVE_FIRST') {
                return rotatingBatches
                  ? `${formatStageLabel(rule.source_stage)}: FINISH/DNF didahulukan dari DNS; rentang rank global ${rule.rank_from}-${rule.rank_to} masuk ${targetLabel}${countLabel}.`
                  : `${formatStageLabel(rule.source_stage)}: kuota posisi ${rule.rank_from}-${rule.rank_to} per batch dialokasikan secara global; FINISH/DNF didahulukan dari DNS untuk masuk ${targetLabel}${countLabel}.`
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
                : usesSingleBatchDirectResult
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
  }, [batchCountPerStage, categories, eventMeta?.qualification_batch_mode, rulesByCategory])

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

  const loadPenaltyGuide = async () => {
    setPenaltyGuideLoading(true)
    try {
      const [rulesResponse, modulesResponse, safetyResponse] = await Promise.all([
        apiFetch(`/api/events/${eventId}/penalties`),
        apiFetch(`/api/events/${eventId}/modules`),
        apiFetch(`/api/events/${eventId}/safety-requirements`),
      ])
      setPenaltyGuideRules((rulesResponse.data ?? []) as PenaltyGuideRule[])
      setPenaltyGuideRequirements((safetyResponse.data ?? []) as PenaltyGuideRequirement[])
      const flags = modulesResponse.data ?? {}
      setPenaltyGuideFlags({
        penalty_enabled: Boolean(flags.penalty_enabled),
        absent_enabled: Boolean(flags.absent_enabled),
        dns_enabled: Boolean(flags.dns_enabled),
        finisher_dns_enabled: Boolean(flags.finisher_dns_enabled),
        dnf_enabled: Boolean(flags.dnf_enabled),
        dnf_progress_enabled: Boolean(flags.dnf_progress_enabled),
        dq_retains_final_classification: Boolean(flags.dq_retains_final_classification),
      })
      setShowPenaltyGuide(true)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal memuat panduan penalty event.')
    } finally {
      setPenaltyGuideLoading(false)
    }
  }

  const penaltyStageLabel = (stage: PenaltyGuideRule['applies_to_stage']) =>
    ({ MOTO: 'Qualification / Moto', QUARTER: 'Quarter Final', REPECHAGE: 'Repechage', SEMI: 'Semi Final', FINAL: 'Final', ALL: 'Semua stage' })[stage]

  const penaltyRulesFor = (audience: 'checker_enabled' | 'rd_enabled') =>
    penaltyGuideRules
      .filter((rule) => rule[audience])
      .map((rule) => {
        const safetyLabels = penaltyGuideRequirements
          .filter((requirement) => requirement.penalty_code === rule.code)
          .map((requirement) => `${requirement.label}${requirement.is_required ? ' (wajib)' : ''}`)
        return {
          ...rule,
          safetyLabels,
          scopeLabel: penaltyStageLabel(rule.applies_to_stage),
        }
      })

  const printPenaltyGuide = () => {
    const checkerRules = penaltyRulesFor('checker_enabled')
    const rdRules = penaltyRulesFor('rd_enabled')
    const printPrimary = /^#[0-9a-f]{3,8}$/i.test(themePrimary) ? themePrimary : '#2563eb'
    const printSecondary = /^#[0-9a-f]{3,8}$/i.test(themeSecondary) ? themeSecondary : '#0f172a'
    const printHeader = /^#[0-9a-f]{3,8}$/i.test(themeHeaderBg) ? themeHeaderBg : '#e0f2fe'
    const printCard = /^#[0-9a-f]{3,8}$/i.test(themeCardBg) ? themeCardBg : '#ffffff'
    const renderRules = (rows: ReturnType<typeof penaltyRulesFor>) => rows.length
      ? `<table><thead><tr><th>Penalty</th><th>Keterangan / safety item</th><th>Poin</th><th>Stage</th><th>Status</th></tr></thead><tbody>${rows.map((rule) => `<tr><td><b>${escapeGuideHtml(rule.code)}</b></td><td>${escapeGuideHtml(rule.description || rule.safetyLabels.join(', ') || '-')}<br/><small>${escapeGuideHtml(rule.safetyLabels.join(', '))}</small></td><td>+${escapeGuideHtml(rule.penalty_point)}</td><td>${escapeGuideHtml(rule.scopeLabel)}</td><td>${rule.is_active ? 'Aktif' : 'Nonaktif'}</td></tr>`).join('')}</tbody></table>`
      : '<p>Belum ada rule untuk peran ini.</p>'
    const moduleRows = [
      ['Modul penalty', penaltyGuideFlags?.penalty_enabled],
      ['Modul DNS', penaltyGuideFlags?.dns_enabled],
      ['Modul Absent', penaltyGuideFlags?.absent_enabled],
      ['Modul DNF', penaltyGuideFlags?.dnf_enabled],
      ['Progress DNF sebagai tie-break', penaltyGuideFlags?.dnf_progress_enabled],
      ['DNS di Finisher', penaltyGuideFlags?.finisher_dns_enabled],
      ['DQ mempertahankan klasifikasi final', penaltyGuideFlags?.dq_retains_final_classification],
    ]
    const categoryRows = categories.map((category) => {
      const dnfPoints = category.dnf_point_override ?? 8
      const dnsPoints = category.dns_point_override ?? 9
      return `<tr><td>${escapeGuideHtml(category.label)}</td><td>${dnfPoints} poin${category.dnf_point_override == null ? ' (default)' : ''}</td><td>${dnsPoints} poin${category.dns_point_override == null ? ' (default)' : ''}</td></tr>`
    }).join('')
    const logoHtml = themeLogoUrl
      ? `<img class="logo" src="${escapeGuideHtml(themeLogoUrl)}" alt="Logo event" />`
      : ''
    const subtitle = [eventMeta?.community_name, themeSlogan].filter(Boolean).map(escapeGuideHtml).join(' | ')
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
      frame.remove()
      alert('Gagal membuka dokumen cetak panduan penalty.')
      return
    }
    frameDocument.open()
    frameDocument.write(`<!doctype html><html><head><meta charset="utf-8"/><title>Panduan Penalty</title><style>
      :root{--primary:${printPrimary};--secondary:${printSecondary};--header:${printHeader};--card:${printCard}}
      *{box-sizing:border-box}body{font:14px Arial,sans-serif;color:#172033;margin:0;background:#f8fafc}.page{padding:28px}.hero{display:flex;gap:18px;align-items:center;background:linear-gradient(135deg,var(--secondary),var(--primary));color:#fff;padding:24px;border-radius:20px;margin-bottom:18px}.logo{width:72px;height:72px;object-fit:contain;background:#ffffff20;border-radius:14px;padding:6px}.kicker{font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.hero h1{margin:6px 0;font-size:28px}.hero p{margin:0;opacity:.9}.card{background:var(--card);border:2px solid var(--header);border-radius:15px;padding:16px;margin:12px 0;break-inside:avoid}.card h2{color:var(--secondary);font-size:18px;margin:0 0 10px}.card p{line-height:1.5;margin:6px 0}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{text-align:left;padding:8px;border:1px solid #cbd5e1;vertical-align:top}th{background:var(--header)}small{color:#475569}.modules{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.module{border:1px solid #cbd5e1;border-radius:9px;padding:8px} @media print{body{background:#fff}.page{padding:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
      </style></head><body><main class="page"><header class="hero">${logoHtml}<div><div class="kicker">Panduan Penalty Event</div><h1>${escapeGuideHtml(eventMeta?.name ?? 'Event')}</h1><p>${subtitle}</p></div></header>
      <section class="card"><h2>Penalty oleh Checker</h2><p>Checker memeriksa safety gear. Jika item safety yang dipetakan tidak terpenuhi, sistem menerapkan penalty sesuai rule aktif event.</p>${renderRules(checkerRules)}</section>
      <section class="card"><h2>Penalty oleh Race Director</h2><p>RD dapat memasukkan rule manual yang aktif untuk peran RD. Poin penalty yang disetujui ditambahkan ke poin race pada stage terkait.</p>${renderRules(rdRules)}</section>
      <section class="card"><h2>DNS, Absent, dan DNF</h2><p><b>DNS dan Absent:</b> perhitungan poinnya sama. Poin dasar memakai posisi terakhir berdasarkan jumlah rider pada moto, lalu ditambah penalti otomatis DNS/Absent kategori.</p><p><b>DNF:</b> bila ada posisi finish yang tercatat, posisi itu menjadi poin dasar; jika tidak, poin dasar memakai jumlah rider yang start (rider terdaftar dikurangi DNS). Setelah itu ditambah penalti otomatis DNF kategori.</p><p><b>Progress DNF:</b> tidak mengganti poin secara langsung. Jika modul progress aktif dan poin rider DNF seri, persentase progress track yang lebih tinggi menjadi tie-break.</p><table><thead><tr><th>Kategori</th><th>Tambahan otomatis DNF</th><th>Tambahan otomatis DNS / Absent</th></tr></thead><tbody>${categoryRows || '<tr><td colspan="3">Belum ada kategori.</td></tr>'}</tbody></table></section>
      <section class="card"><h2>Setting Modul Event</h2><div class="modules">${moduleRows.map(([label, enabled]) => `<div class="module"><b>${escapeGuideHtml(label)}</b>: ${enabled ? 'Aktif' : 'Nonaktif'}</div>`).join('')}</div></section>
      </main><script>window.onload=()=>window.print()</script></body></html>`)
    frameDocument.close()
    frameWindow.focus()
    const cleanup = () => window.setTimeout(() => frame.remove(), 1000)
    frameWindow.onafterprint = cleanup
    window.setTimeout(() => {
      try { frameWindow.print() } finally { cleanup() }
    }, 250)
  }

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

  const applyTwoFinalFinisherPreset = (category: CategoryRow) => {
    const totalRiders = Math.max(0, Number(category.total_riders ?? 0))
    const maxRidersPerFinal = Math.max(1, Number(category.max_riders_per_race ?? 8))
    const needsNovice = totalRiders > maxRidersPerFinal
    if (!finalClassOptions.includes('ELITE') || (needsNovice && !finalClassOptions.includes('NOVICE'))) {
      alert('Aktifkan Final Class ELITE dan NOVICE pada Event Settings sebelum memakai format ini.')
      return
    }
    if (totalRiders === 0) {
      alert('Kategori belum memiliki rider terdaftar.')
      return
    }

    const eliteEnd = Math.min(totalRiders, maxRidersPerFinal)
    const noviceStart = eliteEnd + 1
    const noviceEnd = Math.min(totalRiders, maxRidersPerFinal * 2)
    const finisherStart = noviceEnd + 1
    const nextRules: CustomSplitRule[] = [
      {
        ...createEmptyRule(category.id, 0, 'COMBINED', 'ELITE'),
        rank_from: 1,
        rank_to: eliteEnd,
        target_stage: 'FINAL',
      },
    ]
    if (noviceStart <= noviceEnd) {
      nextRules.push({
        ...createEmptyRule(category.id, 1, 'COMBINED', 'NOVICE'),
        rank_from: noviceStart,
        rank_to: noviceEnd,
        target_stage: 'FINAL',
      })
    }
    if (finisherStart <= totalRiders) {
      nextRules.push({
        ...createEmptyRule(category.id, nextRules.length, 'COMBINED'),
        rank_from: finisherStart,
        rank_to: totalRiders,
        target_stage: 'FINISHER',
        target_final_class: null,
        target_outcome: 'FINISHER',
      })
    }
    setRulesByCategory((previous) => ({ ...previous, [category.id]: nextRules }))
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
      target_outcome: rule.target_stage === 'FINISHER' ? 'FINISHER' : 'STAGE',
      split_basis:
        rule.split_basis === 'CUSTOM_PER_BATCH'
          ? 'CUSTOM_PER_BATCH'
          : rule.split_basis === 'GLOBAL_ACTIVE_FIRST'
            ? 'GLOBAL_ACTIVE_FIRST'
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
          <button
            type="button"
            onClick={() => void loadPenaltyGuide()}
            disabled={penaltyGuideLoading}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '2px solid #111',
              background: '#fef08a',
              fontWeight: 900,
            }}
          >
            {penaltyGuideLoading ? 'Memuat panduan...' : 'Panduan Penalty'}
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
          {eventMeta?.qualification_batch_mode === 'ROTATE_EACH_MOTO' ? (
            <>
              <br />Qualification memakai total poin global. Rule Qualification memakai rank global seluruh kategori.
              <br />Rule stage lain tetap mengikuti basis yang dipilih.
            </>
          ) : (
            <>
              <br /><b>Combined Rank</b> = rank gabungan seluruh batch.
              <br /><b>Top N Per Batch</b> = range rank dihitung ulang di tiap batch.
              <br /><b>Custom Per Batch</b> = tiap batch boleh punya rule sendiri.
            </>
          )}
        </div>
      </div>

      <div
        style={{
          border: '2px solid #111',
          borderRadius: 18,
          background: eventMeta?.promote_next_best_on_dns ? '#f0fdf4' : '#fff',
          padding: 18,
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 4, maxWidth: 820 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 950 }}>
                Promosikan Finisher Terbaik jika ada Rider DNS (Lucky Loser)
              </span>
              {eventMeta?.promote_next_best_on_dns ? (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: '#16a34a',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 900,
                  }}
                >
                  AKTIF
                </span>
              ) : (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: '#e2e8f0',
                    color: '#475569',
                    fontSize: 11,
                    fontWeight: 900,
                  }}
                >
                  STANDAR (NONAKTIF)
                </span>
              )}
            </div>
            <div style={{ color: '#475569', fontSize: 13, fontWeight: 650, lineHeight: 1.5 }}>
              Jika diaktifkan, rider yang murni DNS (tidak start dari moto kualifikasi) tidak akan mengambil kuota lolos ke Quarter/Semi/Final Elite. Slot kosong otomatis diberikan ke rider aktif terbaik berikutnya (Lucky Loser). Rider DNS tetap dialokasikan ke kelas Final terendah agar seluruh rider terdaftar tetap naik podium / dapat piala.
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: updatingSettings ? 'not-allowed' : 'pointer' }}>
            <input
              type="checkbox"
              checked={eventMeta?.promote_next_best_on_dns === true}
              disabled={updatingSettings || loading}
              onChange={(e) => void handleTogglePromoteNextBestOnDns(e.target.checked)}
              style={{ width: 22, height: 22, cursor: 'pointer', accentColor: '#16a34a' }}
            />
            <span style={{ fontWeight: 900, fontSize: 14 }}>
              {updatingSettings ? 'Menyimpan...' : eventMeta?.promote_next_best_on_dns ? 'Aktif' : 'Nonaktif'}
            </span>
          </label>
        </div>
      </div>

      {loading && (
        <div style={{ padding: 14, border: '2px dashed #111', borderRadius: 14, background: '#fff', fontWeight: 900 }}>
          Loading final class rules...
        </div>
      )}

      {!loading && eventMeta?.qualification_batch_mode === 'ROTATE_EACH_MOTO' && (
        <div style={{ padding: 14, border: '2px solid #075985', borderRadius: 14, background: '#e0f2fe', fontWeight: 850 }}>
          Batch kualifikasi berganti setiap moto. Rank Qualification memakai total poin seluruh rider kategori. Rule rank berlaku global.
        </div>
      )}

      {!loading &&
        categories.map((category) => {
          const rules = normalizeQualificationRuleBasis(
            rulesByCategory[category.id] ?? [],
            eventMeta?.qualification_batch_mode === 'ROTATE_EACH_MOTO'
          )
          const estimate = estimateRaceCounts(category, rules)
          const maxRidersPerRace = Math.max(1, Number(category.max_riders_per_race ?? 8))
          const estimatedBatchCount = Math.max(
            0,
            Number(category.qualification_batch_count ?? Math.ceil(Math.max(0, Number(category.total_riders ?? 0)) / maxRidersPerRace))
          )
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
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {(estimatedBatchCount > 1 || (estimatedBatchCount === 1 && (category.single_batch_final_enabled === true || category.single_batch_two_moto_final_enabled === true))) && (
                    <button
                      type="button"
                      onClick={() => applyTwoFinalFinisherPreset(category)}
                      style={{
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: '2px solid #111',
                        background: '#dbeafe',
                        fontWeight: 900,
                      }}
                    >
                      {estimatedBatchCount === 1 && Number(category.total_riders ?? 0) <= Number(category.max_riders_per_race ?? 8)
                        ? 'Atur semua rider ke Final ELITE'
                        : 'Pakai 2 Final + Finisher'}
                    </button>
                  )}
                </div>
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
                  {rule.split_basis === 'CUSTOM_PER_BATCH' &&
                    !(eventMeta?.qualification_batch_mode === 'ROTATE_EACH_MOTO' && rule.source_stage === 'QUALIFICATION') && (
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
                      value={
                        eventMeta?.qualification_batch_mode === 'ROTATE_EACH_MOTO' &&
                        rule.source_stage === 'QUALIFICATION' &&
                        rule.split_basis !== 'GLOBAL_ACTIVE_FIRST'
                          ? 'COMBINED'
                          : rule.split_basis
                      }
                      onChange={(e) =>
                        updateSplitBasis(category.id, rule.source_stage, e.target.value as CustomSplitRule['split_basis'])
                      }
                      style={{ padding: '10px 12px', borderRadius: 10, border: '2px solid #111', background: '#fff' }}
                    >
                      {SPLIT_BASIS_OPTIONS.filter((option) => {
                        if (rule.source_stage !== 'QUALIFICATION' && option === 'GLOBAL_ACTIVE_FIRST') return false
                        if (eventMeta?.qualification_batch_mode === 'ROTATE_EACH_MOTO' && rule.source_stage === 'QUALIFICATION') {
                          return option === 'COMBINED' || option === 'GLOBAL_ACTIVE_FIRST'
                        }
                        return true
                      }).map((option) => (
                        <option key={option} value={option}>
                          {splitBasisLabel(option)}
                        </option>
                      ))}
                    </select>
                    {rule.source_stage === 'QUALIFICATION' && rule.split_basis === 'GLOBAL_ACTIVE_FIRST' ? (
                      <small style={{ color: '#475569', maxWidth: 260, lineHeight: 1.35 }}>
                        {eventMeta?.qualification_batch_mode === 'ROTATE_EACH_MOTO'
                          ? 'FINISH/DNF mendapat prioritas di ranking global. Rentang rank di bawah berlaku untuk seluruh kategori.'
                          : 'Urut rider FINISH/DNF dari semua batch lebih dulu; kuota stage tetap mengikuti slot per batch.'}
                      </small>
                    ) : null}
                    {eventMeta?.qualification_batch_mode === 'ROTATE_EACH_MOTO' && rule.source_stage === 'QUALIFICATION' && rule.split_basis !== 'GLOBAL_ACTIVE_FIRST' ? (
                      <small style={{ color: '#475569', maxWidth: 260, lineHeight: 1.35 }}>
                        Ranking memakai total poin global. Rank berlaku untuk seluruh kategori, bukan tiap batch.
                      </small>
                    ) : null}
                  </label>

                  <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>
                    <span>
                      {eventMeta?.qualification_batch_mode === 'ROTATE_EACH_MOTO' && rule.source_stage === 'QUALIFICATION'
                        ? 'Rank From Global'
                        : rule.split_basis === 'COMBINED' ? 'Rank From' : 'Rank From Per Batch'}
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={rule.rank_from}
                      onChange={(e) => updateRule(category.id, index, { rank_from: Number(e.target.value) || 1 })}
                      style={{ padding: '10px 12px', borderRadius: 10, border: '2px solid #111', background: '#fff' }}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>
                    <span>
                      {eventMeta?.qualification_batch_mode === 'ROTATE_EACH_MOTO' && rule.source_stage === 'QUALIFICATION'
                        ? 'Rank To Global'
                        : rule.split_basis === 'COMBINED' ? 'Rank To' : 'Rank To Per Batch'}
                    </span>
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
                          target_outcome: e.target.value === 'FINISHER' ? 'FINISHER' : 'STAGE',
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
      {showPenaltyGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Panduan Penalty Event"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.62)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
            zIndex: 70,
          }}
        >
          <div style={{ width: 'min(980px, 100%)', maxHeight: '92vh', overflow: 'auto', borderRadius: 20, border: `2px solid ${themeSecondary}`, background: themeCardBg, padding: 18, display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 5 }}>
                <div style={{ fontSize: 26, fontWeight: 950, color: themeSecondary }}>Panduan Penalty Event</div>
                <div style={{ color: '#475569', fontWeight: 750 }}>{eventMeta?.name ?? 'Event'} · aturan sesuai pengaturan event saat ini</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={printPenaltyGuide} style={{ padding: '10px 14px', borderRadius: 10, border: `2px solid ${themeSecondary}`, background: '#d9f99d', fontWeight: 900 }}>
                  Cetak / Save PDF
                </button>
                <button type="button" onClick={() => setShowPenaltyGuide(false)} style={{ padding: '10px 14px', borderRadius: 10, border: `2px solid ${themeSecondary}`, background: '#ffd7d7', fontWeight: 900 }}>
                  Tutup
                </button>
              </div>
            </div>

            <section style={{ border: `2px solid ${themeHeaderBg}`, borderRadius: 14, background: themeCardBg, padding: 14 }}>
              <h2 style={{ margin: '0 0 10px', color: themeSecondary, fontSize: 18 }}>Penalty Checker</h2>
              <p style={{ margin: '0 0 10px', color: '#334155', lineHeight: 1.5 }}>Checker memeriksa item safety. Jika item yang terhubung ke rule penalty tidak terpenuhi, sistem menerapkan poin sesuai rule aktif dan stage-nya.</p>
              {penaltyRulesFor('checker_enabled').length ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {penaltyRulesFor('checker_enabled').map((rule) => (
                    <div key={`checker-${rule.code}`} style={{ border: '1px solid #cbd5e1', borderRadius: 10, background: '#fff', padding: 10, display: 'grid', gap: 4 }}>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <b>{rule.code}</b><b style={{ color: themePrimary }}>+{rule.penalty_point} poin</b>
                      </div>
                      <div>{rule.description || 'Penalty Checker'}</div>
                      {rule.safetyLabels.length > 0 && <div style={{ color: '#475569' }}>Safety checklist: {rule.safetyLabels.join(', ')}</div>}
                      <small style={{ color: '#475569' }}>Berlaku: {rule.scopeLabel} · {rule.is_active ? 'Aktif' : 'Rule nonaktif'}</small>
                    </div>
                  ))}
                </div>
              ) : <div style={{ color: '#64748b' }}>Belum ada rule Checker Auto.</div>}
            </section>

            <section style={{ border: `2px solid ${themeHeaderBg}`, borderRadius: 14, background: themeCardBg, padding: 14 }}>
              <h2 style={{ margin: '0 0 10px', color: themeSecondary, fontSize: 18 }}>Penalty Race Director</h2>
              <p style={{ margin: '0 0 10px', color: '#334155', lineHeight: 1.5 }}>RD memilih rule manual yang sesuai kejadian. Penalty yang sudah disetujui ditambahkan ke poin race rider pada stage terkait.</p>
              {penaltyRulesFor('rd_enabled').length ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  {penaltyRulesFor('rd_enabled').map((rule) => (
                    <div key={`rd-${rule.code}`} style={{ border: '1px solid #cbd5e1', borderRadius: 10, background: '#fff', padding: 10, display: 'grid', gap: 4 }}>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <b>{rule.code}</b><b style={{ color: themePrimary }}>+{rule.penalty_point} poin</b>
                      </div>
                      <div>{rule.description || 'Penalty manual RD'}</div>
                      <small style={{ color: '#475569' }}>Berlaku: {rule.scopeLabel} · {rule.is_active ? 'Aktif' : 'Rule nonaktif'}</small>
                    </div>
                  ))}
                </div>
              ) : <div style={{ color: '#64748b' }}>Belum ada rule RD Manual.</div>}
            </section>

            <section style={{ border: `2px solid ${themeHeaderBg}`, borderRadius: 14, background: themeCardBg, padding: 14, display: 'grid', gap: 9 }}>
              <h2 style={{ margin: 0, color: themeSecondary, fontSize: 18 }}>DNS, Absent, dan DNF</h2>
              <div><b>DNS dan Absent</b> memakai perhitungan poin yang sama: poin dasar posisi terakhir sesuai jumlah rider pada moto, ditambah penalti otomatis DNS kategori.</div>
              <div><b>DNF</b> memakai finish order jika posisi sudah tercatat; jika belum, poin dasarnya mengikuti jumlah rider yang start (jumlah rider dikurangi DNS). Lalu ditambah penalti otomatis DNF kategori.</div>
              <div><b>Progress track DNF</b> bukan tambahan/pengurang poin langsung. Jika opsi progress DNF aktif dan poin DNF seri, progress track lebih tinggi dipakai sebagai tie-break.</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 460 }}>
                  <thead><tr style={{ background: themeHeaderBg }}><th style={{ textAlign: 'left', padding: 9 }}>Kategori</th><th style={{ textAlign: 'left', padding: 9 }}>Poin otomatis DNF</th><th style={{ textAlign: 'left', padding: 9 }}>Poin otomatis DNS / Absent</th></tr></thead>
                  <tbody>{categories.map((category) => (
                    <tr key={`nonfinish-${category.id}`}>
                      <td style={{ padding: 9, borderTop: '1px solid #cbd5e1' }}>{category.label}</td>
                      <td style={{ padding: 9, borderTop: '1px solid #cbd5e1' }}>{category.dnf_point_override ?? 8} poin{category.dnf_point_override == null ? ' (default)' : ''}</td>
                      <td style={{ padding: 9, borderTop: '1px solid #cbd5e1' }}>{category.dns_point_override ?? 9} poin{category.dns_point_override == null ? ' (default)' : ''}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>

            <section style={{ border: `2px solid ${themeHeaderBg}`, borderRadius: 14, background: themeCardBg, padding: 14 }}>
              <h2 style={{ margin: '0 0 10px', color: themeSecondary, fontSize: 18 }}>Status Modul Event</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {([
                  ['Penalty', penaltyGuideFlags?.penalty_enabled],
                  ['DNS', penaltyGuideFlags?.dns_enabled],
                  ['Absent', penaltyGuideFlags?.absent_enabled],
                  ['DNF', penaltyGuideFlags?.dnf_enabled],
                  ['Progress DNF tie-break', penaltyGuideFlags?.dnf_progress_enabled],
                  ['DNS di Finisher', penaltyGuideFlags?.finisher_dns_enabled],
                  ['DQ mempertahankan klasifikasi final', penaltyGuideFlags?.dq_retains_final_classification],
                ] as Array<[string, boolean | undefined]>).map(([label, enabled]) => (
                  <span key={label} style={{ padding: '7px 10px', borderRadius: 999, background: enabled ? '#dcfce7' : '#f1f5f9', border: `1px solid ${enabled ? '#16a34a' : '#cbd5e1'}`, fontSize: 12, fontWeight: 850 }}>
                    {label}: {enabled ? 'Aktif' : 'Nonaktif'}
                  </span>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  )
}
