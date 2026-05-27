import { compareMotoSequence } from './motoSequence'

type MotoLike = {
  moto_name: string
  moto_order: number
  category_id?: string | null
}

const FINAL_MOTO_DISPLAY_ORDER: Record<string, number> = {
  ACADEMY: 0,
  ROOKIE: 1,
  PRO: 2,
  NOVICE: 3,
  ELITE: 4,
  ADVANCED: 5,
  AMATEUR: 6,
  BEGINNER: 7,
}

const DISPLAY_STAGE_ORDER: Record<string, number> = {
  QUALIFICATION: 1,
  REPECHAGE: 2,
  QUARTER_FINAL: 3,
  SEMI_FINAL: 4,
  FINAL: 5,
}

type ParsedDisplayMoto = {
  stage: 'QUALIFICATION' | 'REPECHAGE' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'FINAL'
  motoIndex?: number
  batchIndex?: number
  heatIndex?: number
  finalClass?: string | null
}

export const parseFinalMotoClass = (motoName: string) => {
  const match = motoName.match(/^final\s+(.+)$/i)
  if (!match) return null
  return match[1]?.trim().toUpperCase() ?? null
}

export const formatMotoDisplayName = (motoName: string) =>
  motoName.replace(/quarter\s*final\s*-\s*heat\s*(\d+)/i, 'Quarter Final - Batch $1')

const parseDisplayMoto = (motoName: string): ParsedDisplayMoto | null => {
  const qualificationMatch = motoName.match(/moto\s*(\d+)\s*-\s*batch\s*(\d+)/i)
  if (qualificationMatch) {
    return {
      stage: 'QUALIFICATION',
      motoIndex: Number(qualificationMatch[1] ?? 0),
      batchIndex: Number(qualificationMatch[2] ?? 0),
    }
  }

  const repechageMatch = motoName.match(/repechage\s*-\s*heat\s*(\d+)/i)
  if (repechageMatch) {
    return {
      stage: 'REPECHAGE',
      heatIndex: Number(repechageMatch[1] ?? 0),
    }
  }

  const quarterMatch = motoName.match(/quarter\s*final\s*-\s*(?:heat|batch)\s*(\d+)/i)
  if (quarterMatch) {
    return {
      stage: 'QUARTER_FINAL',
      heatIndex: Number(quarterMatch[1] ?? 0),
    }
  }

  const semiMatch = motoName.match(/semi\s*final\s*-\s*heat\s*(\d+)/i)
  if (semiMatch) {
    return {
      stage: 'SEMI_FINAL',
      heatIndex: Number(semiMatch[1] ?? 0),
    }
  }

  const finalClass = parseFinalMotoClass(motoName)
  if (finalClass) {
    return {
      stage: 'FINAL',
      finalClass,
    }
  }

  return null
}

export const compareMotoDisplayOrder = <T extends MotoLike>(a: T, b: T) => {
  const aCategory = typeof a.category_id === 'string' ? a.category_id : null
  const bCategory = typeof b.category_id === 'string' ? b.category_id : null
  if (aCategory && bCategory && aCategory !== bCategory) {
    return compareMotoSequence(a, b)
  }

  const parsedA = parseDisplayMoto(a.moto_name)
  const parsedB = parseDisplayMoto(b.moto_name)

  if (parsedA && parsedB) {
    const stageDiff =
      (DISPLAY_STAGE_ORDER[parsedA.stage] ?? Number.MAX_SAFE_INTEGER) -
      (DISPLAY_STAGE_ORDER[parsedB.stage] ?? Number.MAX_SAFE_INTEGER)
    if (stageDiff !== 0) return stageDiff

    if (parsedA.stage === 'QUALIFICATION' && parsedB.stage === 'QUALIFICATION') {
      const motoDiff = (parsedA.motoIndex ?? 0) - (parsedB.motoIndex ?? 0)
      if (motoDiff !== 0) return motoDiff
      const batchDiff = (parsedA.batchIndex ?? 0) - (parsedB.batchIndex ?? 0)
      if (batchDiff !== 0) return batchDiff
    }

    if (
      (parsedA.stage === 'REPECHAGE' && parsedB.stage === 'REPECHAGE') ||
      (parsedA.stage === 'QUARTER_FINAL' && parsedB.stage === 'QUARTER_FINAL') ||
      (parsedA.stage === 'SEMI_FINAL' && parsedB.stage === 'SEMI_FINAL')
    ) {
      const heatDiff = (parsedA.heatIndex ?? 0) - (parsedB.heatIndex ?? 0)
      if (heatDiff !== 0) return heatDiff
    }

    if (parsedA.stage === 'FINAL' && parsedB.stage === 'FINAL') {
      const orderDiff =
        (FINAL_MOTO_DISPLAY_ORDER[parsedA.finalClass ?? ''] ?? Number.MAX_SAFE_INTEGER) -
        (FINAL_MOTO_DISPLAY_ORDER[parsedB.finalClass ?? ''] ?? Number.MAX_SAFE_INTEGER)
      if (orderDiff !== 0) return orderDiff
    }
  }

  return compareMotoSequence(a, b)
}
