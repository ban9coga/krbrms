type MotoLike = {
  id?: string
  moto_name?: string | null
  moto_order?: number | null
  category_id?: string | null
  status?: string | null
  checker_prep_ready_at?: string | null
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
  EXPLORER: 1,
  ACADEMY: 2,
  BEGINNER: 3,
  AMATEUR: 4,
  INTERMEDIATE: 5,
  ADVANCED: 6,
  ROOKIE: 7,
  PRO: 8,
  NOVICE: 9,
  ELITE: 10,
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
    REPECHAGE: 2,
    QUARTER_FINAL: 3,
    SEMI_FINAL: 4,
    FINAL: 5,
  }
  return stageOrder[stage] ?? 99
}

const getAdvancedSubOrder = (parsed: ParsedAdvancedMoto | null): number => {
  if (!parsed) return 9999
  if (parsed.stage === 'QUALIFICATION') return (parsed.motoIndex ?? 0) * 100 + (parsed.batchIndex ?? 0)
  if (parsed.stage === 'FINAL') return FINAL_CLASS_ORDER_MAP[parsed.finalClass ?? ''] ?? 99
  return parsed.heatIndex ?? 99
}

export const buildCategoryBaseOrder = <T extends MotoLike>(motos: T[]) => {
  const categoryBaseOrder = new Map<string, number>()
  for (const moto of motos) {
    if (!moto.category_id) continue
    const order = typeof moto.moto_order === 'number' ? moto.moto_order : Number.MAX_SAFE_INTEGER
    const current = categoryBaseOrder.get(moto.category_id)
    if (current == null || order < current) categoryBaseOrder.set(moto.category_id, order)
  }
  return categoryBaseOrder
}

export const compareMotoWorkflowSequence = (
  a: MotoLike,
  b: MotoLike,
  categoryBaseOrder: Map<string, number> = new Map()
) => {
  const aCategory = typeof a.category_id === 'string' ? a.category_id : null
  const bCategory = typeof b.category_id === 'string' ? b.category_id : null
  const ao = typeof a.moto_order === 'number' ? a.moto_order : Number.MAX_SAFE_INTEGER
  const bo = typeof b.moto_order === 'number' ? b.moto_order : Number.MAX_SAFE_INTEGER
  const aCategoryOrder = aCategory ? categoryBaseOrder.get(aCategory) ?? ao : ao
  const bCategoryOrder = bCategory ? categoryBaseOrder.get(bCategory) ?? bo : bo

  if (aCategoryOrder !== bCategoryOrder) return aCategoryOrder - bCategoryOrder
  if (aCategory && bCategory && aCategory !== bCategory) return aCategory.localeCompare(bCategory)

  const advancedA = parseAdvancedMoto(a.moto_name)
  const advancedB = parseAdvancedMoto(b.moto_name)
  const stageOrderA = advancedA ? getAdvancedStageOrder(advancedA.stage) : 99
  const stageOrderB = advancedB ? getAdvancedStageOrder(advancedB.stage) : 99
  if (stageOrderA !== stageOrderB) return stageOrderA - stageOrderB

  const subOrderA = getAdvancedSubOrder(advancedA)
  const subOrderB = getAdvancedSubOrder(advancedB)
  if (subOrderA !== subOrderB) return subOrderA - subOrderB

  return ao - bo
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

const isStageFinalized = (status?: string | null) => ['LOCKED', 'FINISHED'].includes(String(status ?? '').toUpperCase())

const isQualificationMoto = (moto: MotoLike) => parseAdvancedMoto(moto.moto_name)?.stage === 'QUALIFICATION'
export const isAdvancementMoto = (moto: MotoLike) => {
  const parsed = parseAdvancedMoto(moto.moto_name)
  return parsed != null && parsed.stage !== 'QUALIFICATION'
}

// Hold advancement motos behind event-wide stage barriers. Qualification must
// finish across all categories before any advancement stage can run; then each
// advancement stage completes before the next stage becomes eligible.
export const getEligibleMotosInWorkflow = <T extends MotoLike>(rows: T[]) => {
  const candidates = rows.filter((row) => ['UPCOMING', 'READY'].includes(String(row.status ?? '').toUpperCase()))
  const qualificationMotos = rows.filter(isQualificationMoto)
  const qualificationsComplete = qualificationMotos.every((moto) => isStageFinalized(moto.status))

  // Keep event's qualification Moto Sequence intact, even when one category's
  // generated finals are already available.
  if (!qualificationsComplete) {
    return candidates.filter(isQualificationMoto)
  }

  const unfinishedAdvancement = rows.filter((moto) => isAdvancementMoto(moto) && !isStageFinalized(moto.status))
  const nextStageOrder = unfinishedAdvancement.reduce<number | null>((earliest, moto) => {
    const parsed = parseAdvancedMoto(moto.moto_name)
    if (!parsed) return earliest
    const order = getAdvancedStageOrder(parsed.stage)
    return earliest == null || order < earliest ? order : earliest
  }, null)
  const stageCandidates = candidates.filter((candidate) => {
    const parsed = parseAdvancedMoto(candidate.moto_name)
    return parsed != null && getAdvancedStageOrder(parsed.stage) === nextStageOrder
  })

  if (stageCandidates.length > 0) return stageCandidates

  // No advancement stage is currently pending. Preserve ordinary sequence for
  // events that contain motos outside the parsed stage naming convention.
  if (unfinishedAdvancement.length > 0) return []
  return candidates
}

export const pickNextMotoInWorkflow = <T extends MotoLike & { id: string }>(rows: T[], anchorMoto?: T | null) => {
  const eligible = getEligibleMotosInWorkflow(rows)
  if (eligible.length === 0) return null

  // A checker-prepared moto is an explicit manual choice within the active
  // stage. Prefer the most recently confirmed choice for auto-live as well.
  const preparedSelection = eligible
    .filter((moto) => String(moto.status ?? '').toUpperCase() === 'READY' && moto.checker_prep_ready_at)
    .sort((a, b) => String(b.checker_prep_ready_at).localeCompare(String(a.checker_prep_ready_at)))[0]
  if (preparedSelection) return preparedSelection

  const candidates = [...eligible]
  const anchorIndex = anchorMoto ? rows.findIndex((row) => row.id === anchorMoto.id) : -1
  if (anchorMoto && isAdvancementMoto(anchorMoto)) {
    const nextSameCategoryStage = candidates.find((candidate) => {
      const candidateIndex = rows.findIndex((row) => row.id === candidate.id)
      return candidate.category_id === anchorMoto.category_id && candidateIndex > anchorIndex
    })
    if (nextSameCategoryStage) return nextSameCategoryStage
  }

  if (!anchorMoto) return candidates[0] ?? null
  const afterAnchor = anchorIndex >= 0 ? rows.slice(anchorIndex + 1) : rows
  const nextInSequence = afterAnchor.find((row) => candidates.some((candidate) => candidate.id === row.id))
  if (nextInSequence) return nextInSequence as T & { id: string }

  const categoryBaseOrder = buildCategoryBaseOrder(rows)
  return [...candidates].sort((a, b) => compareMotoWorkflowSequence(a, b, categoryBaseOrder))[0] ?? null
}
