'use server'

import { adminClient } from '../lib/auth'
import { normalizeFinalClassList, resolveDefaultAdvancedRaceConfig } from '../lib/advancedRaceDefaults'
import { isMissingPrimaryCategoryColumnError, riderBelongsToPrimaryCategory } from '../lib/categoryAssignment'

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
  preloaded?: {
    riders?: Array<{ id: string; primary_category_id?: string | null; birth_year?: number | null; date_of_birth?: string | null; gender: 'BOY' | 'GIRL' }>
    extraCategories?: Array<{ rider_id: string; category_id: string }>
    qualificationMotos?: Array<{ id: string; category_id: string; moto_name: string }>
    qualificationMotoRiders?: Array<{ rider_id: string; moto_id: string }>
  }
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
      .select('id, event_id, year, year_min, year_max, gender')
      .eq('id', categoryId)
      .maybeSingle()

    if (catError || !category) {
      const warning = 'Category not found. Resolver skipped.'
      console.warn(warning)
      return DEFAULT_RESULT(categoryId, 'unknown', 0, warning)
    }

    const eventId = category.event_id as string
    let riders = override?.preloaded?.riders ?? null

    if (!riders) {
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
          id: string
          primary_category_id?: string | null
          birth_year?: number | null
          date_of_birth?: string | null
          gender: 'BOY' | 'GIRL'
        }>
      } else {
        riders = (withPrimary.data ?? []) as Array<{
          id: string
          primary_category_id?: string | null
          birth_year?: number | null
          date_of_birth?: string | null
          gender: 'BOY' | 'GIRL'
        }>
      }
    }

    const primaryCategoryRiderIds = new Set(
      (riders ?? [])
        .filter((rider) =>
        riderBelongsToPrimaryCategory(
          rider as { primary_category_id?: string | null; birth_year?: number | null; date_of_birth?: string | null; gender: 'BOY' | 'GIRL' },
          category as { id: string; year: number; year_min?: number | null; year_max?: number | null; gender: 'BOY' | 'GIRL' | 'MIX' }
        )
        )
        .map((rider) => rider.id)
    )

    let upclassCategoryRiderIds = new Set<string>()
    if (override?.preloaded?.extraCategories) {
      const filtered = override.preloaded.extraCategories.filter((row) => row.category_id === categoryId)
      upclassCategoryRiderIds = new Set(filtered.map((row) => row.rider_id))
    } else {
      const { data: extraCategoryRows, error: extraCategoryError } = await adminClient
        .from('rider_extra_categories')
        .select('rider_id')
        .eq('event_id', eventId)
        .eq('category_id', categoryId)

      if (!extraCategoryError) {
        upclassCategoryRiderIds = new Set((extraCategoryRows ?? []).map((row) => row.rider_id as string))
      }
    }

    const registeredCategoryRiderIds = new Set([
      ...primaryCategoryRiderIds,
      ...upclassCategoryRiderIds,
    ])

    let qualificationMotoRiderCount = 0

    let qualificationMotos = override?.preloaded?.qualificationMotos?.filter(m => 
      m.category_id === categoryId && /moto\s*\d+\s*(?:-\s*)?batch\s*\d+/i.test(m.moto_name)
    )
    if (!override?.preloaded?.qualificationMotos) {
      const { data, error } = await adminClient
        .from('motos')
        .select('id, category_id, moto_name')
        .eq('event_id', eventId)
        .eq('category_id', categoryId)
        .ilike('moto_name', 'Moto % - Batch %')
      if (!error) qualificationMotos = data ?? []
    }

    if (qualificationMotos && qualificationMotos.length > 0) {
      const qualificationMotoIds = qualificationMotos.map((moto) => moto.id)
      
      if (override?.preloaded?.qualificationMotoRiders) {
        const filtered = override.preloaded.qualificationMotoRiders.filter(row => qualificationMotoIds.includes(row.moto_id))
        qualificationMotoRiderCount = new Set(filtered.map((row) => row.rider_id)).size
      } else {
        const { data: motoRiders, error: motoRiderError } = await adminClient
          .from('moto_riders')
          .select('rider_id')
          .in('moto_id', qualificationMotoIds)

        if (!motoRiderError) {
          qualificationMotoRiderCount = new Set((motoRiders ?? []).map((row) => row.rider_id)).size
        }
      }
    }

    const totalRiders = Math.max(registeredCategoryRiderIds.size, qualificationMotoRiderCount)

    const { data: settingsRow } = await adminClient
      .from('event_settings')
      .select('race_format_settings')
      .eq('event_id', eventId)
      .maybeSingle()

    const raceFormatSettings =
      settingsRow?.race_format_settings && typeof settingsRow.race_format_settings === 'object'
        ? (settingsRow.race_format_settings as Record<string, unknown>)
        : {}
    const gateSize =
      typeof raceFormatSettings.gate_positions === 'number'
        ? Number(raceFormatSettings.gate_positions)
        : Number(raceFormatSettings.gate_positions ?? 8)

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
        finalClasses: normalizeFinalClassList(override.enabledFinalClasses),
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
      const defaults = resolveDefaultAdvancedRaceConfig(total, gateSize)

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
      finalClasses: normalizeFinalClassList(rule.enabled_final_classes),
      source: 'rule',
    }
  } catch (err) {
    const warning = err instanceof Error ? err.message : 'Resolver failed unexpectedly.'
    console.warn(warning)
    return DEFAULT_RESULT(categoryId, 'unknown', 0, warning)
  }
}
