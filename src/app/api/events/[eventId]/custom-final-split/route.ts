import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'
import {
  syncAdvancedRaceProgress,
} from '../../../../../services/advancedRaceAuto'
import { resolveCategoryConfig } from '../../../../../services/categoryResolver'

type CustomRuleInput = {
  id?: string
  source_stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'REPECHAGE'
  rank_from: number
  rank_to: number
  target_stage: 'QUARTER_FINAL' | 'SEMI_FINAL' | 'REPECHAGE' | 'FINAL'
  target_final_class?: string | null
  sort_order: number
  split_basis?: 'COMBINED' | 'PER_BATCH' | 'CUSTOM_PER_BATCH'
  batch_no?: number | null
}

type NormalizedRule = {
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

type StageConfigRow = {
  category_id: string
  max_riders_per_race: number
  qualification_moto_count: number
  repechage_max_riders_per_race: number | null
  quarter_final_max_riders_per_race: number | null
  semi_final_max_riders_per_race: number | null
}

type EventSettingsRow = {
  event_logo_url?: string | null
  display_theme?: Record<string, unknown> | null
}

const targetKeyForRule = (rule: {
  source_stage?: 'QUALIFICATION' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'REPECHAGE'
  target_stage: 'QUARTER_FINAL' | 'SEMI_FINAL' | 'REPECHAGE' | 'FINAL'
  target_final_class?: string | null
  batch_no?: number | null
  split_basis?: 'COMBINED' | 'PER_BATCH' | 'CUSTOM_PER_BATCH'
}) =>
  `${rule.source_stage ?? 'QUALIFICATION'}:${rule.split_basis === 'CUSTOM_PER_BATCH' ? `BATCH:${rule.batch_no ?? 'NULL'}:` : ''}${rule.target_stage}:${
    rule.target_stage === 'FINAL' ? rule.target_final_class ?? 'NULL' : '-'
  }`

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { data: eventRow, error: eventError } = await adminClient
    .from('events')
    .select('id, name, community_name')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 400 })
  }

  const { data: settingsRow, error: settingsError } = await adminClient
    .from('event_settings')
    .select('event_logo_url, display_theme')
    .eq('event_id', eventId)
    .maybeSingle()

  if (settingsError) {
    return NextResponse.json({ error: settingsError.message }, { status: 400 })
  }

  const { data: categories, error: categoryError } = await adminClient
    .from('categories')
    .select('id, label, year, gender')
    .eq('event_id', eventId)
    .order('year', { ascending: false })

  if (categoryError) {
    return NextResponse.json({ error: categoryError.message }, { status: 400 })
  }

  const categoryIds = (categories ?? []).map((item) => item.id)
  const { data: stageConfigs, error: stageConfigError } = categoryIds.length
    ? await adminClient
        .from('race_stage_config')
        .select('category_id, max_riders_per_race, qualification_moto_count, repechage_max_riders_per_race, quarter_final_max_riders_per_race, semi_final_max_riders_per_race')
        .eq('event_id', eventId)
        .in('category_id', categoryIds)
    : { data: [], error: null }

  if (stageConfigError) {
    return NextResponse.json({ error: stageConfigError.message }, { status: 400 })
  }

  const { data: rules, error: ruleError } = categoryIds.length
    ? await adminClient
      .from('race_category_custom_split_rule')
        .select('id, category_id, source_stage, rank_from, rank_to, target_stage, target_final_class, sort_order, split_basis, batch_no')
        .in('category_id', categoryIds)
        .order('sort_order', { ascending: true })
        .order('rank_from', { ascending: true })
    : { data: [], error: null }

  if (ruleError) {
    return NextResponse.json({ error: ruleError.message }, { status: 400 })
  }

  const categoryTotals = Object.fromEntries(
    await Promise.all(
      (categories ?? []).map(async (category) => {
        const resolved = await resolveCategoryConfig(category.id as string)
        return [category.id as string, resolved] as const
      })
    )
  )
  const stageConfigByCategory = new Map<string, StageConfigRow>(
    ((stageConfigs ?? []) as StageConfigRow[]).map((row) => [row.category_id, row])
  )

  const enrichedCategories = (categories ?? []).map((category) => ({
    ...category,
    total_riders: categoryTotals[category.id as string]?.totalRiders ?? 0,
    resolver_source: categoryTotals[category.id as string]?.source ?? 'default',
    stages: categoryTotals[category.id as string]?.stages ?? {
      enableQualification: false,
      enableQuarterFinal: false,
      enableSemiFinal: false,
    },
    final_classes: categoryTotals[category.id as string]?.finalClasses ?? [],
    max_riders_per_race: stageConfigByCategory.get(category.id as string)?.max_riders_per_race ?? 8,
    qualification_moto_count: stageConfigByCategory.get(category.id as string)?.qualification_moto_count ?? 2,
    repechage_max_riders_per_race: stageConfigByCategory.get(category.id as string)?.repechage_max_riders_per_race ?? null,
    quarter_final_max_riders_per_race: stageConfigByCategory.get(category.id as string)?.quarter_final_max_riders_per_race ?? null,
    semi_final_max_riders_per_race: stageConfigByCategory.get(category.id as string)?.semi_final_max_riders_per_race ?? null,
  }))

  return NextResponse.json({
    data: {
      event: {
        id: eventRow?.id ?? eventId,
        name: eventRow?.name ?? 'Race System Guide',
        community_name: eventRow?.community_name ?? null,
        event_logo_url: ((settingsRow as EventSettingsRow | null)?.event_logo_url ?? null) as string | null,
        display_theme: (((settingsRow as EventSettingsRow | null)?.display_theme ?? {}) as Record<string, unknown>) ?? {},
      },
      categories: enrichedCategories,
      rules: rules ?? [],
    },
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const categoryId = body?.category_id as string | undefined
  const rules = (body?.rules ?? []) as CustomRuleInput[]

  if (!categoryId) return NextResponse.json({ error: 'category_id required' }, { status: 400 })
  if (!Array.isArray(rules)) return NextResponse.json({ error: 'rules must be array' }, { status: 400 })

  const { data: category, error: categoryError } = await adminClient
    .from('categories')
    .select('id, event_id')
    .eq('id', categoryId)
    .maybeSingle()

  if (categoryError || !category || category.event_id !== eventId) {
    return NextResponse.json({ error: 'Category not found in event' }, { status: 404 })
  }

  const normalizedRules: NormalizedRule[] = rules
    .map((rule, index): NormalizedRule => ({
      category_id: categoryId,
      source_stage: rule.source_stage ?? 'QUALIFICATION',
      rank_from: Math.max(1, Number(rule.rank_from) || 1),
      rank_to: Math.max(1, Number(rule.rank_to) || 1),
      target_stage: rule.target_stage,
      target_final_class: rule.target_stage === 'FINAL' ? rule.target_final_class ?? null : null,
      sort_order: Number(rule.sort_order ?? index),
      split_basis:
        rule.split_basis === 'CUSTOM_PER_BATCH'
          ? 'CUSTOM_PER_BATCH'
          : rule.split_basis === 'PER_BATCH'
            ? 'PER_BATCH'
            : 'COMBINED',
      batch_no:
        rule.split_basis === 'CUSTOM_PER_BATCH'
          ? Math.max(1, Number(rule.batch_no) || 1)
          : null,
    }))
    .sort((a, b) => {
      const batchDiff = (a.batch_no ?? 0) - (b.batch_no ?? 0)
      if (batchDiff !== 0) return batchDiff
      return a.sort_order - b.sort_order || a.rank_from - b.rank_from
    })

  if (normalizedRules.some((rule) => rule.rank_to < rule.rank_from)) {
    return NextResponse.json({ error: 'rank_to must be greater than or equal to rank_from' }, { status: 400 })
  }

  if (normalizedRules.some((rule) => rule.target_stage === 'FINAL' && !rule.target_final_class)) {
    return NextResponse.json({ error: 'Final rules must have a final class.' }, { status: 400 })
  }

  const splitBasisByStage = new Map<NormalizedRule['source_stage'], NormalizedRule['split_basis']>()
  for (const rule of normalizedRules) {
    const existing = splitBasisByStage.get(rule.source_stage)
    if (existing && existing !== rule.split_basis) {
      return NextResponse.json(
        { error: `Semua rule untuk ${rule.source_stage.replace(/_/g, ' ')} harus memakai Rule Basis yang sama.` },
        { status: 400 }
      )
    }
    splitBasisByStage.set(rule.source_stage, rule.split_basis)
  }

  if (normalizedRules.some((rule) => rule.split_basis === 'CUSTOM_PER_BATCH' && !rule.batch_no)) {
    return NextResponse.json({ error: 'Custom Per Batch wajib memilih batch untuk setiap rule.' }, { status: 400 })
  }

  const groupedRules = normalizedRules.reduce<Record<string, typeof normalizedRules>>((acc, rule) => {
    const key =
      rule.split_basis === 'CUSTOM_PER_BATCH'
        ? `${rule.source_stage}:BATCH:${rule.batch_no ?? 0}`
        : `${rule.source_stage}:ALL`
    if (!acc[key]) acc[key] = []
    acc[key].push(rule)
    return acc
  }, {})

  for (const groupKey of Object.keys(groupedRules)) {
    const scopedRules = [...groupedRules[groupKey]].sort((a, b) => a.rank_from - b.rank_from || a.rank_to - b.rank_to)
    for (let index = 1; index < scopedRules.length; index += 1) {
      const previous = scopedRules[index - 1]
      const current = scopedRules[index]
      if (current.rank_from <= previous.rank_to) {
        return NextResponse.json(
          {
            error:
              previous.split_basis === 'CUSTOM_PER_BATCH'
                ? `Rank range overlap detected di Batch ${previous.batch_no} antara ${previous.rank_from}-${previous.rank_to} dan ${current.rank_from}-${current.rank_to}.`
                : `Rank range overlap detected between ${previous.rank_from}-${previous.rank_to} and ${current.rank_from}-${current.rank_to}.`,
          },
          { status: 400 }
        )
      }
    }
  }

  const duplicateTarget = new Map<string, { rank_from: number; rank_to: number }>()
  for (const rule of normalizedRules) {
    const key = targetKeyForRule(rule)
    const existing = duplicateTarget.get(key)
    if (existing) {
      const label =
        rule.target_stage === 'FINAL'
          ? `FINAL ${rule.target_final_class}`
          : rule.target_stage.replace(/_/g, ' ')
      return NextResponse.json(
        {
          error:
            rule.split_basis === 'CUSTOM_PER_BATCH'
              ? `Duplicate target ${label} detected di Batch ${rule.batch_no}. Gabungkan jadi satu rule, misalnya ${existing.rank_from}-${rule.rank_to}.`
              : `Duplicate target ${label} detected. Gabungkan jadi satu rule, misalnya ${existing.rank_from}-${rule.rank_to}.`,
        },
        { status: 400 }
      )
    }
    duplicateTarget.set(key, { rank_from: rule.rank_from, rank_to: rule.rank_to })
  }

  const { error: deleteError } = await adminClient
    .from('race_category_custom_split_rule')
    .delete()
    .eq('category_id', categoryId)
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 })
  }

  let savedRules: unknown[] = []
  const hasCustomFinalClassRules = normalizedRules.length > 0
  if (normalizedRules.length > 0) {
    const { data, error } = await adminClient
      .from('race_category_custom_split_rule')
      .insert(normalizedRules)
      .select('id, category_id, source_stage, rank_from, rank_to, target_stage, target_final_class, sort_order, split_basis, batch_no')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    savedRules = data ?? []
  }

  const syncResult = await syncAdvancedRaceProgress(eventId, categoryId)
  const warning = syncResult.ok ? null : syncResult.warning ?? null

  return NextResponse.json({
    data: savedRules,
    warning:
      !warning && hasCustomFinalClassRules
        ? 'Qualification telah dijalankan dengan aturan Final Class Rules.'
        : warning,
  })
}
