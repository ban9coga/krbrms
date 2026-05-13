import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'
import {
  computeQualificationAndStore,
  generateStageMotos,
} from '../../../../../services/advancedRaceAuto'
import { resolveCategoryConfig } from '../../../../../services/categoryResolver'

type CustomRuleInput = {
  id?: string
  source_stage: 'QUALIFICATION'
  rank_from: number
  rank_to: number
  target_stage: 'QUARTER_FINAL' | 'SEMI_FINAL' | 'FINAL'
  target_final_class?: string | null
  sort_order: number
  split_basis?: 'COMBINED' | 'PER_BATCH'
}

const targetKeyForRule = (rule: {
  target_stage: 'QUARTER_FINAL' | 'SEMI_FINAL' | 'FINAL'
  target_final_class?: string | null
}) => `${rule.target_stage}:${rule.target_stage === 'FINAL' ? rule.target_final_class ?? 'NULL' : '-'}`

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params

  const { data: categories, error: categoryError } = await adminClient
    .from('categories')
    .select('id, label, year, gender')
    .eq('event_id', eventId)
    .order('year', { ascending: false })

  if (categoryError) {
    return NextResponse.json({ error: categoryError.message }, { status: 400 })
  }

  const categoryIds = (categories ?? []).map((item) => item.id)
  const { data: rules, error: ruleError } = categoryIds.length
    ? await adminClient
        .from('race_category_custom_split_rule')
        .select('id, category_id, source_stage, rank_from, rank_to, target_stage, target_final_class, sort_order, split_basis')
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
        return [category.id as string, resolved.totalRiders] as const
      })
    )
  )

  const enrichedCategories = (categories ?? []).map((category) => ({
    ...category,
    total_riders: categoryTotals[category.id as string] ?? 0,
  }))

  return NextResponse.json({
    data: {
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

  const normalizedRules = rules
    .map((rule, index) => ({
      category_id: categoryId,
      source_stage: 'QUALIFICATION' as const,
      rank_from: Math.max(1, Number(rule.rank_from) || 1),
      rank_to: Math.max(1, Number(rule.rank_to) || 1),
      target_stage: rule.target_stage,
      target_final_class: rule.target_stage === 'FINAL' ? rule.target_final_class ?? null : null,
      sort_order: Number(rule.sort_order ?? index),
      split_basis: rule.split_basis === 'PER_BATCH' ? 'PER_BATCH' : 'COMBINED',
    }))
    .sort((a, b) => a.sort_order - b.sort_order || a.rank_from - b.rank_from)

  if (normalizedRules.some((rule) => rule.rank_to < rule.rank_from)) {
    return NextResponse.json({ error: 'rank_to must be greater than or equal to rank_from' }, { status: 400 })
  }

  if (normalizedRules.some((rule) => rule.target_stage === 'FINAL' && !rule.target_final_class)) {
    return NextResponse.json({ error: 'Final rules must have a final class.' }, { status: 400 })
  }

  const splitBasisSet = new Set(normalizedRules.map((rule) => rule.split_basis))
  if (splitBasisSet.size > 1) {
    return NextResponse.json({ error: 'Semua rule dalam satu kategori harus memakai Rule Basis yang sama.' }, { status: 400 })
  }

  for (let index = 1; index < normalizedRules.length; index += 1) {
    const previous = normalizedRules[index - 1]
    const current = normalizedRules[index]
    if (current.rank_from <= previous.rank_to) {
      return NextResponse.json(
        {
          error: `Rank range overlap detected between ${previous.rank_from}-${previous.rank_to} and ${current.rank_from}-${current.rank_to}.`,
        },
        { status: 400 }
      )
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
          error: `Duplicate target ${label} detected. Gabungkan jadi satu rule, misalnya ${existing.rank_from}-${rule.rank_to}.`,
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
  if (normalizedRules.length > 0) {
    const { data, error } = await adminClient
      .from('race_category_custom_split_rule')
      .insert(normalizedRules)
      .select('id, category_id, source_stage, rank_from, rank_to, target_stage, target_final_class, sort_order, split_basis')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    savedRules = data ?? []
  }

  const qualificationResult = await computeQualificationAndStore(eventId, categoryId)
  let warning = qualificationResult.ok ? null : qualificationResult.warning ?? null

  if (qualificationResult.ok && qualificationResult.warning !== 'Qualification not required for single batch.') {
    const stageMotoResult = await generateStageMotos(eventId, categoryId)
    if (!stageMotoResult.ok) {
      warning = stageMotoResult.warning ?? warning
    }
  }

  return NextResponse.json({
    data: savedRules,
    warning,
  })
}
