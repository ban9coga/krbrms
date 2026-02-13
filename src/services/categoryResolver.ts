'use server'

import { adminClient } from '../lib/auth'

export type StageFlags = {
  enableQualification: boolean
  enableQuarterFinal: boolean
  enableSemiFinal: boolean
}

export type CategoryResolveResult = {
  categoryId: string
  eventId: string
  totalRiders: number
  stages: StageFlags
  finalClasses: string[]
  source: 'override' | 'rule' | 'default'
  warning?: string
}

export type ResolverOverride = Partial<StageFlags> & {
  enabledFinalClasses?: string[]
}

const DEFAULT_RESULT = (categoryId: string, eventId: string, totalRiders: number, warning?: string): CategoryResolveResult => ({
  categoryId,
  eventId,
  totalRiders,
  stages: { enableQualification: false, enableQuarterFinal: false, enableSemiFinal: false },
  finalClasses: [],
  source: 'default',
  warning,
})

export async function resolveCategoryConfig(categoryId: string, override?: ResolverOverride): Promise<CategoryResolveResult> {
  try {
    const { data: category, error: catError } = await adminClient
      .from('categories')
      .select('id, event_id, year, gender')
      .eq('id', categoryId)
      .maybeSingle()

    if (catError || !category) {
      const warning = 'Category not found. Resolver skipped.'
      console.warn(warning)
      return DEFAULT_RESULT(categoryId, 'unknown', 0, warning)
    }

    const eventId = category.event_id as string
    const year = category.year as number
    const gender = category.gender as string

    let riderQuery = adminClient
      .from('riders')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('birth_year', year)

    if (gender !== 'MIX') {
      riderQuery = riderQuery.eq('gender', gender)
    }

    const { count: totalRiders, error: countError } = await riderQuery
    if (countError) {
      const warning = 'Failed to count riders. Resolver skipped.'
      console.warn(warning)
      return DEFAULT_RESULT(categoryId, eventId, 0, warning)
    }

    if (override) {
      return {
        categoryId,
        eventId,
        totalRiders: totalRiders ?? 0,
        stages: {
          enableQualification: override.enableQualification ?? false,
          enableQuarterFinal: override.enableQuarterFinal ?? false,
          enableSemiFinal: override.enableSemiFinal ?? false,
        },
        finalClasses: override.enabledFinalClasses ?? [],
        source: 'override',
      }
    }

    const { data: rule, error: ruleError } = await adminClient
      .from('race_category_rule')
      .select('min_riders, enable_qualification, enable_quarter_final, enable_semi_final, enabled_final_classes')
      .eq('category_id', categoryId)
      .lte('min_riders', totalRiders ?? 0)
      .order('min_riders', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (ruleError || !rule) {
      const warning = 'No rule matched. Using default (disabled).'
      console.warn(warning)
      return DEFAULT_RESULT(categoryId, eventId, totalRiders ?? 0, warning)
    }

    return {
      categoryId,
      eventId,
      totalRiders: totalRiders ?? 0,
      stages: {
        enableQualification: Boolean(rule.enable_qualification),
        enableQuarterFinal: Boolean(rule.enable_quarter_final),
        enableSemiFinal: Boolean(rule.enable_semi_final),
      },
      finalClasses: Array.isArray(rule.enabled_final_classes) ? rule.enabled_final_classes : [],
      source: 'rule',
    }
  } catch (err) {
    const warning = err instanceof Error ? err.message : 'Resolver failed unexpectedly.'
    console.warn(warning)
    return DEFAULT_RESULT(categoryId, 'unknown', 0, warning)
  }
}
