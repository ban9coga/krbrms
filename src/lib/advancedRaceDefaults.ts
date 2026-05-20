export type AdvancedRaceDefaultConfig = {
  stages: {
    enableQualification: boolean
    enableQuarterFinal: boolean
    enableSemiFinal: boolean
  }
  finalClasses: string[]
}

export const ADVANCED_RACE_FINAL_CLASS_ORDER = [
  'BEGINNER',
  'AMATEUR',
  'ACADEMY',
  'ADVANCED',
  'ROOKIE',
  'PRO',
  'NOVICE',
  'ELITE',
] as const

export const QUALIFICATION_QUARTER_LOWER_CLASS_STRENGTH_ORDER = [
  'ADVANCED',
  'ACADEMY',
  'AMATEUR',
  'BEGINNER',
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
    stages: { enableQualification: true, enableQuarterFinal: true, enableSemiFinal: true },
    finalClasses: ADVANCED_RACE_FINAL_CLASS_ORDER.slice(
      ADVANCED_RACE_FINAL_CLASS_ORDER.length - totalFinalClassCount
    ),
  }
}

export const resolveQuarterEnabledQualificationLowerClasses = (finalClasses: string[]) =>
  QUALIFICATION_QUARTER_LOWER_CLASS_STRENGTH_ORDER.filter((finalClass) => finalClasses.includes(finalClass))
