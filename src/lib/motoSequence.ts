type MotoLike = {
  moto_name?: string | null
  moto_order?: number | null
  category_id?: string | null
}

type ParsedMoto = {
  motoIndex: number
  batchIndex: number
}

type ParsedAdvancedMoto = {
  stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'REPECHAGE' | 'SEMI_FINAL' | 'FINAL'
  motoIndex?: number
  batchIndex?: number
  heatIndex?: number
  finalClass?: string
}

// Order untuk final class
const FINAL_CLASS_ORDER_MAP: Record<string, number> = {
  BEGINNER: 1,
  AMATEUR: 2,
  ACADEMY: 3,
  ADVANCED: 4,
  ROOKIE: 5,
  PRO: 6,
  NOVICE: 7,
  ELITE: 8,
}

export const parseMotoSequence = (name?: string | null): ParsedMoto | null => {
  if (!name) return null
  const match = name.match(/moto\s*(\d+)\s*-\s*batch\s*(\d+)/i)
  if (!match) return null
  const motoIndex = Number(match[1])
  const batchIndex = Number(match[2])
  if (!Number.isFinite(motoIndex) || !Number.isFinite(batchIndex)) return null
  return { motoIndex, batchIndex }
}

const parseAdvancedMoto = (name?: string | null): ParsedAdvancedMoto | null => {
  if (!name) return null
  
  // Format: "Moto X - Batch Y" (qualification)
  const qualMatch = name.match(/moto\s*(\d+)\s*-\s*batch\s*(\d+)/i)
  if (qualMatch) {
    return {
      stage: 'QUALIFICATION',
      motoIndex: Number(qualMatch[1]),
      batchIndex: Number(qualMatch[2]),
    }
  }

  // Format: "Quarter Final - Batch X" or legacy "Quarter Final - Heat X"
  const qfMatch = name.match(/quarter\s*final\s*-\s*(?:heat|batch)\s*(\d+)/i)
  if (qfMatch) {
    return {
      stage: 'QUARTER_FINAL',
      heatIndex: Number(qfMatch[1]),
    }
  }

  // Format: "Semi Final - Batch X" or legacy "Semi Final - Heat X"
  const sfMatch = name.match(/semi\s*final\s*-\s*(?:heat|batch)\s*(\d+)/i)
  if (sfMatch) {
    return {
      stage: 'SEMI_FINAL',
      heatIndex: Number(sfMatch[1]),
    }
  }

  // Format: "Repechage - Batch X" or legacy "Repechage - Heat X"
  const repMatch = name.match(/repechage\s*-\s*(?:heat|batch)\s*(\d+)/i)
  if (repMatch) {
    return {
      stage: 'REPECHAGE',
      heatIndex: Number(repMatch[1]),
    }
  }

  // Format: "Final CLASS_NAME" (e.g., "Final BEGINNER", "Final ELITE")
  const finalMatch = name.match(/^final\s+(\w+)$/i)
  if (finalMatch) {
    const finalClass = finalMatch[1].toUpperCase()
    return {
      stage: 'FINAL',
      finalClass,
    }
  }

  return null
}

const getAdvancedStageOrder = (stage: string): number => {
  const stageOrder: Record<string, number> = {
    QUALIFICATION: 1,
    QUARTER_FINAL: 2,
    REPECHAGE: 3,
    SEMI_FINAL: 4,
    FINAL: 5,
  }
  return stageOrder[stage] ?? 99
}

export const compareMotoSequence = (a: MotoLike, b: MotoLike) => {
  const ao = typeof a.moto_order === 'number' ? a.moto_order : null
  const bo = typeof b.moto_order === 'number' ? b.moto_order : null
  if (ao !== null || bo !== null) {
    const diff = (ao ?? Number.MAX_SAFE_INTEGER) - (bo ?? Number.MAX_SAFE_INTEGER)
    if (diff !== 0) return diff
  }

  const aCategory = typeof a.category_id === 'string' ? a.category_id : null
  const bCategory = typeof b.category_id === 'string' ? b.category_id : null
  if (aCategory && bCategory && aCategory !== bCategory) {
    return aCategory.localeCompare(bCategory)
  }

  // Try to parse as advanced moto (qualification, QF, SF, Final)
  const advancedA = parseAdvancedMoto(a.moto_name)
  const advancedB = parseAdvancedMoto(b.moto_name)

  if (advancedA && advancedB) {
    // Both are advanced/qualification motos
    const stageOrderA = getAdvancedStageOrder(advancedA.stage)
    const stageOrderB = getAdvancedStageOrder(advancedB.stage)

    if (stageOrderA !== stageOrderB) return stageOrderA - stageOrderB

    // Same stage, sort by sub-type
    if (advancedA.stage === 'QUALIFICATION' && advancedB.stage === 'QUALIFICATION') {
      // Sort by moto index, then batch index
      if (advancedA.motoIndex !== advancedB.motoIndex) {
        return (advancedA.motoIndex ?? 0) - (advancedB.motoIndex ?? 0)
      }
      return (advancedA.batchIndex ?? 0) - (advancedB.batchIndex ?? 0)
    }

    if (advancedA.stage === 'QUARTER_FINAL' && advancedB.stage === 'QUARTER_FINAL') {
      return (advancedA.heatIndex ?? 0) - (advancedB.heatIndex ?? 0)
    }

    if (advancedA.stage === 'REPECHAGE' && advancedB.stage === 'REPECHAGE') {
      return (advancedA.heatIndex ?? 0) - (advancedB.heatIndex ?? 0)
    }

    if (advancedA.stage === 'SEMI_FINAL' && advancedB.stage === 'SEMI_FINAL') {
      return (advancedA.heatIndex ?? 0) - (advancedB.heatIndex ?? 0)
    }

    if (advancedA.stage === 'FINAL' && advancedB.stage === 'FINAL') {
      const classOrderA = FINAL_CLASS_ORDER_MAP[advancedA.finalClass ?? ''] ?? 99
      const classOrderB = FINAL_CLASS_ORDER_MAP[advancedB.finalClass ?? ''] ?? 99
      return classOrderA - classOrderB
    }
  }

  // Fallback: compare by moto_order
  return (ao ?? 0) - (bo ?? 0)
}
