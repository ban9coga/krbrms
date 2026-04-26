'use server'

import { adminClient } from '../lib/auth'
import { isMissingPrimaryCategoryColumnError, riderBelongsToPrimaryCategory } from '../lib/categoryAssignment'
import { FINAL_CLASS_ORDER } from './raceStageEngine'

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

const resolveDefaultAdvancedRace = (totalRiders: number) => {
  if (totalRiders <= 8) {
    return {
      stages: { enableQualification: false, enableQuarterFinal: false, enableSemiFinal: false },
      finalClasses: ['ELITE'],
    }
  }

  if (totalRiders <= 16) {
    return {
      stages: { enableQualification: true, enableQuarterFinal: false, enableSemiFinal: false },
      finalClasses: ['ROOKIE', 'BEGINNER', 'NOVICE', 'AMATEUR', 'ELITE'],
    }
  }

  if (totalRiders <= 32) {
    return {
      stages: { enableQualification: true, enableQuarterFinal: false, enableSemiFinal: true },
      finalClasses: ['ROOKIE', 'BEGINNER', 'NOVICE', 'AMATEUR', 'PRO', 'ELITE'],
    }
  }

  return {
    stages: { enableQualification: true, enableQuarterFinal: true, enableSemiFinal: true },
    finalClasses: [...FINAL_CLASS_ORDER],
  }
}

export async function resolveCategoryConfig(categoryId: string, override?: ResolverOverride): Promise<CategoryResolveResult> {
  try {
    const { data: category, error: catError } = await adminClient
      .from('categories')
      .select('id, event_id, year, year_min, year_max, gender')
      .eq('id', categoryId)
      .maybeSingle()

    if (catError || !category) {
      const warning = 'Category not found. Resolver skipped.'
      console.warn(warning)
      return DEFAULT_RESULT(categoryId, 'unknown', 0, warning)
    }

    const eventId = category.event_id as string
    let riders:
      | Array<{ primary_category_id?: string | null; birth_year?: number | null; date_of_birth?: string | null; gender: 'BOY' | 'GIRL' }>
      | null = null
    {
      const withPrimary = await adminClient
        .from('riders')
        .select('id, primary_category_id, birth_year, date_of_birth, gender')
        .eq('event_id', eventId)

      if (withPrimary.error && !isMissingPrimaryCategoryColumnError(withPrimary.error.message)) {
        const warning = 'Failed to count riders. Resolver skipped.'
        console.warn(warning)
        return DEFAULT_RESULT(categoryId, eventId, 0, warning)
      }

      if (withPrimary.error) {
        const legacy = await adminClient
          .from('riders')
          .select('id, birth_year, date_of_birth, gender')
          .eq('event_id', eventId)
        if (legacy.error) {
          const warning = 'Failed to count riders. Resolver skipped.'
          console.warn(warning)
          return DEFAULT_RESULT(categoryId, eventId, 0, warning)
        }
        riders = (legacy.data ?? []) as Array<{
          birth_year?: number | null
          date_of_birth?: string | null
          gender: 'BOY' | 'GIRL'
        }>
      } else {
        riders = (withPrimary.data ?? []) as Array<{
          primary_category_id?: string | null
          birth_year?: number | null
          date_of_birth?: string | null
          gender: 'BOY' | 'GIRL'
        }>
      }
    }

    const totalRiders =
      (riders ?? []).filter((rider) =>
        riderBelongsToPrimaryCategory(
          rider as { primary_category_id?: string | null; birth_year?: number | null; date_of_birth?: string | null; gender: 'BOY' | 'GIRL' },
          category as { id: string; year: number; year_min?: number | null; year_max?: number | null; gender: 'BOY' | 'GIRL' | 'MIX' }
        )
      ).length ?? 0

    if (override) {
      return {
        categoryId,
        eventId,
        totalRiders,
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
      .lte('min_riders', totalRiders)
      .order('min_riders', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (ruleError || !rule) {
      const total = totalRiders
      const defaults = resolveDefaultAdvancedRace(total)

      return {
        categoryId,
        eventId,
        totalRiders: total,
        stages: defaults.stages,
        finalClasses: defaults.finalClasses,
        source: 'default',
        warning: 'No rule matched. Using default auto mapping.',
      }
    }

    return {
      categoryId,
      eventId,
      totalRiders,
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
