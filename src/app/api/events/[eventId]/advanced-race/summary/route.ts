import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'
import { resolveCategoryConfig } from '../../../../../../services/categoryResolver'

type StageRow = {
  category_id: string
  stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'REPECHAGE' | 'SEMI_FINAL' | 'FINAL'
}

type MotoRow = {
  id: string
  category_id: string
  moto_name: string
  status?: string | null
}

type MotoRiderRow = {
  moto_id: string
  rider_id: string
}

type ResultRow = {
  moto_id: string
  rider_id: string
}

const parseBatchKey = (name: string) => {
  const match = name.match(/moto\s*(\d+)\s*(?:-\s*)?batch\s*(\d+)/i)
  if (!match) return null
  return { motoIndex: Number(match[1]), batchIndex: Number(match[2]) }
}

const isMotoComplete = (motoId: string, assignedRows: MotoRiderRow[], resultRows: ResultRow[]) => {
  const assignedRiders = assignedRows.filter((row) => row.moto_id === motoId).map((row) => row.rider_id)
  if (assignedRiders.length === 0) return false
  const completedRiders = new Set(resultRows.filter((row) => row.moto_id === motoId).map((row) => row.rider_id))
  return assignedRiders.every((riderId) => completedRiders.has(riderId))
}

const buildQualificationProgress = (motoRows: MotoRow[], assignedRows: MotoRiderRow[], resultRows: ResultRow[]) => {
  const batchMap = new Map<number, { moto1?: string; moto2?: string }>()

  for (const moto of motoRows) {
    const parsed = parseBatchKey(moto.moto_name)
    if (!parsed) continue
    const entry = batchMap.get(parsed.batchIndex) ?? {}
    if (parsed.motoIndex === 1) entry.moto1 = moto.id
    if (parsed.motoIndex === 2) entry.moto2 = moto.id
    batchMap.set(parsed.batchIndex, entry)
  }

  const completeBatchIds = Array.from(batchMap.values()).filter((entry) => {
    if (!entry.moto1 || !entry.moto2) return false
    return isMotoComplete(entry.moto1, assignedRows, resultRows) && isMotoComplete(entry.moto2, assignedRows, resultRows)
  })

  return {
    total: batchMap.size,
    complete: completeBatchIds.length,
    ready: batchMap.size > 0 && completeBatchIds.length === batchMap.size,
  }
}

const areAllMotosComplete = (motos: MotoRow[], assignedRows: MotoRiderRow[], resultRows: ResultRow[]) =>
  motos.length > 0 && motos.every((moto) => isMotoComplete(moto.id, assignedRows, resultRows))

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId } = await params

  const { data: categories, error: catError } = await adminClient
    .from('categories')
    .select('id')
    .eq('event_id', eventId)
  if (catError) return NextResponse.json({ error: catError.message }, { status: 400 })

  const categoryIds = (categories ?? []).map((c) => c.id)
  if (categoryIds.length === 0) return NextResponse.json({ data: {} })

  const { data: stageRows, error: stageError } = await adminClient
    .from('race_stage_result')
    .select('category_id, stage')
    .in('category_id', categoryIds)
  if (stageError) return NextResponse.json({ error: stageError.message }, { status: 400 })

  const { data: motoRows, error: motoError } = await adminClient
    .from('motos')
    .select('id, category_id, moto_name, status')
    .eq('event_id', eventId)
    .in('category_id', categoryIds)
  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })

  const summary: Record<
    string,
    {
      stageCounts: Record<string, number>
      motoCounts: { quarter: number; repechage: number; semi: number; final: number }
      readiness: {
        totalRiders: number
        requiresQualification: boolean
        qualificationTotalBatches: number
        qualificationCompleteBatches: number
        qualificationReady: boolean
        qualificationRun: boolean
        quarterReady: boolean
        repechageReady: boolean
        semiReady: boolean
        canRunQualification: boolean
        canComputeAdvances: boolean
        allQualificationLocked: boolean
        allCategoryMotosLocked: boolean
      }
    }
  > = {}

  for (const id of categoryIds) {
    summary[id] = {
      stageCounts: { QUALIFICATION: 0, QUARTER_FINAL: 0, REPECHAGE: 0, SEMI_FINAL: 0, FINAL: 0 },
      motoCounts: { quarter: 0, repechage: 0, semi: 0, final: 0 },
        readiness: {
          totalRiders: 0,
          requiresQualification: false,
          qualificationTotalBatches: 0,
          qualificationCompleteBatches: 0,
          qualificationReady: false,
          qualificationRun: false,
          quarterReady: false,
          repechageReady: false,
          semiReady: false,
          canRunQualification: false,
          canComputeAdvances: false,
          allQualificationLocked: false,
          allCategoryMotosLocked: false,
        },
    }
  }

  for (const row of (stageRows ?? []) as StageRow[]) {
    if (!summary[row.category_id]) continue
    summary[row.category_id].stageCounts[row.stage] =
      (summary[row.category_id].stageCounts[row.stage] ?? 0) + 1
  }

  const typedMotoRows = (motoRows ?? []) as MotoRow[]

  for (const row of typedMotoRows) {
    const name = row.moto_name.toLowerCase()
    if (!summary[row.category_id]) continue
    if (name.startsWith('quarter final')) summary[row.category_id].motoCounts.quarter += 1
      else if (name.startsWith('repechage')) summary[row.category_id].motoCounts.repechage += 1
      else if (name.startsWith('semi final')) summary[row.category_id].motoCounts.semi += 1
    else if (name.startsWith('final ')) summary[row.category_id].motoCounts.final += 1
  }

  const motoIds = typedMotoRows.map((row) => row.id)
  const { data: assignedRows, error: assignedError } = motoIds.length
    ? await adminClient.from('moto_riders').select('moto_id, rider_id').in('moto_id', motoIds)
    : { data: [], error: null }
  if (assignedError) return NextResponse.json({ error: assignedError.message }, { status: 400 })

  const { data: resultRows, error: resultError } = motoIds.length
    ? await adminClient.from('results').select('moto_id, rider_id').in('moto_id', motoIds)
    : { data: [], error: null }
  if (resultError) return NextResponse.json({ error: resultError.message }, { status: 400 })

  const typedAssignedRows = (assignedRows ?? []) as MotoRiderRow[]
  const typedResultRows = (resultRows ?? []) as ResultRow[]
  const resolvedByCategory = new Map<string, Awaited<ReturnType<typeof resolveCategoryConfig>>>()

  for (const id of categoryIds) {
    resolvedByCategory.set(id, await resolveCategoryConfig(id))
  }

  for (const id of categoryIds) {
    const categoryMotos = typedMotoRows.filter((row) => row.category_id === id)
    const qualificationMotos = categoryMotos.filter((row) => parseBatchKey(row.moto_name))
    const quarterMotos = categoryMotos.filter((row) => /^Quarter Final/i.test(row.moto_name))
    const semiMotos = categoryMotos.filter((row) => /^Semi Final/i.test(row.moto_name))
    const repechageMotos = categoryMotos.filter((row) => /^Repechage/i.test(row.moto_name))
    const qualificationProgress = buildQualificationProgress(qualificationMotos, typedAssignedRows, typedResultRows)
    const qualificationRun = (summary[id]?.stageCounts?.QUALIFICATION ?? 0) > 0
    const allQualificationLocked =
      qualificationMotos.length > 0 &&
      qualificationMotos.every((moto) => (moto.status ?? '').toUpperCase() === 'LOCKED')
    const allCategoryMotosLocked =
      categoryMotos.length > 0 && categoryMotos.every((moto) => (moto.status ?? '').toUpperCase() === 'LOCKED')
    const resolved = resolvedByCategory.get(id)
    const requiresQualification = Boolean(resolved?.stages.enableQualification)

    const quarterExists = (summary[id]?.motoCounts?.quarter ?? 0) > 0
    const repechageExists = (summary[id]?.motoCounts?.repechage ?? 0) > 0
    const semiExists = (summary[id]?.motoCounts?.semi ?? 0) > 0
    const quarterReady = areAllMotosComplete(quarterMotos, typedAssignedRows, typedResultRows)
    const repechageReady = areAllMotosComplete(repechageMotos, typedAssignedRows, typedResultRows)
    const semiReady = areAllMotosComplete(semiMotos, typedAssignedRows, typedResultRows)
    const canComputeAdvances =
      requiresQualification &&
      qualificationRun &&
      (
        repechageExists
          ? repechageReady
          : quarterExists
          ? quarterReady
          : semiExists
          ? semiReady
          : qualificationProgress.ready
      )

    summary[id].readiness = {
      totalRiders: resolved?.totalRiders ?? 0,
      requiresQualification,
      qualificationTotalBatches: qualificationProgress.total,
      qualificationCompleteBatches: qualificationProgress.complete,
      qualificationReady: qualificationProgress.ready,
      qualificationRun,
      quarterReady,
      repechageReady,
      semiReady,
      canRunQualification: requiresQualification && qualificationProgress.ready,
      canComputeAdvances,
      allQualificationLocked,
      allCategoryMotosLocked,
    }
  }

  return NextResponse.json({ data: summary })
}
