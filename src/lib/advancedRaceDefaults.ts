export type AdvancedRaceDefaultConfig = {
  stages: {
    enableQualification: boolean
    enableQuarterFinal: boolean
    enableSemiFinal: boolean
  }
  finalClasses: string[]
}

export const ADVANCED_RACE_FINAL_CLASS_ORDER = [
  'EXPLORER',
  'BEGINNER',
  'AMATEUR',
  'ACADEMY',
  'INTERMEDIATE',
  'ADVANCED',
  'ROOKIE',
  'PRO',
  'NOVICE',
  'ELITE',
] as const

export const FINAL_CLASS_ALLOWLIST = [...ADVANCED_RACE_FINAL_CLASS_ORDER] as const

export type FinalClassOption = (typeof FINAL_CLASS_ALLOWLIST)[number]

export const normalizeFinalClassValue = (value: unknown): FinalClassOption | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase()
  if (!FINAL_CLASS_ALLOWLIST.includes(normalized as FinalClassOption)) return null
  return normalized as FinalClassOption
}

export const normalizeFinalClassList = (value: unknown, fallback: string[] = [...FINAL_CLASS_ALLOWLIST]): string[] => {
  const source = typeof value === 'string' ? value.split(',') : Array.isArray(value) ? value : []
  const normalized = source
    .map((item) => normalizeFinalClassValue(item))
    .filter((item): item is FinalClassOption => item !== null)

  return normalized.length > 0 ? Array.from(new Set(normalized)) : [...fallback]
}

export const QUALIFICATION_QUARTER_LOWER_CLASS_STRENGTH_ORDER = [
  'ADVANCED',
  'INTERMEDIATE',
  'ACADEMY',
  'AMATEUR',
  'BEGINNER',
] as const

export const QUALIFICATION_SEMI_LOWER_CLASS_STRENGTH_ORDER = [
  'PRO',
  'ROOKIE',
] as const

export const resolveDefaultAdvancedRaceConfig = (
  totalRiders: number,
  gateSize = 8
): AdvancedRaceDefaultConfig => {
  const safeGateSize = Math.max(1, Number(gateSize) || 8)

  if (totalRiders <= safeGateSize) {
    return {
      stages: { enableQualification: false, enableQuarterFinal: false, enableSemiFinal: false },
      finalClasses: ['ELITE'],
    }
  }

  if (totalRiders <= safeGateSize * 2) {
    return {
      stages: { enableQualification: true, enableQuarterFinal: false, enableSemiFinal: false },
      finalClasses: ['NOVICE', 'ELITE'],
    }
  }

  if (totalRiders <= safeGateSize * 3) {
    return {
      stages: { enableQualification: true, enableQuarterFinal: false, enableSemiFinal: true },
      finalClasses: ['PRO', 'NOVICE', 'ELITE'],
    }
  }

  if (totalRiders <= safeGateSize * 4) {
    return {
      stages: { enableQualification: true, enableQuarterFinal: false, enableSemiFinal: true },
      finalClasses: ['ROOKIE', 'PRO', 'NOVICE', 'ELITE'],
    }
  }

  const totalFinalClassCount = Math.min(
    ADVANCED_RACE_FINAL_CLASS_ORDER.length,
    Math.max(5, Math.ceil(totalRiders / safeGateSize))
  )

  return {
    stages: { enableQualification: true, enableQuarterFinal: true, enableSemiFinal: false },
    finalClasses: ADVANCED_RACE_FINAL_CLASS_ORDER.slice(
      ADVANCED_RACE_FINAL_CLASS_ORDER.length - totalFinalClassCount
    ),
  }
}

export const resolveQuarterEnabledQualificationLowerClasses = (finalClasses: string[]) =>
  QUALIFICATION_QUARTER_LOWER_CLASS_STRENGTH_ORDER.filter((finalClass) => finalClasses.includes(finalClass))

export const resolveSemiEnabledQualificationLowerClasses = (finalClasses: string[]) =>
  QUALIFICATION_SEMI_LOWER_CLASS_STRENGTH_ORDER.filter((finalClass) => finalClasses.includes(finalClass))
