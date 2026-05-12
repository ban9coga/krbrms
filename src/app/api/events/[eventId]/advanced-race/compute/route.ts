import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'
import { resolveCategoryConfig } from '../../../../../../services/categoryResolver'
import {
  computeQualificationAndStore,
  generateStageMotos,
} from '../../../../../../services/advancedRaceAuto'

type MotoRow = {
  id: string
  moto_name: string
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

const isQualificationReady = (motoRows: MotoRow[], assignedRows: MotoRiderRow[], resultRows: ResultRow[]) => {
  const batchMap = new Map<number, { moto1?: string; moto2?: string; moto3?: string }>()

  for (const moto of motoRows) {
    const parsed = parseBatchKey(moto.moto_name)
    if (!parsed) continue
    const entry = batchMap.get(parsed.batchIndex) ?? {}
    if (parsed.motoIndex === 1) entry.moto1 = moto.id
    if (parsed.motoIndex === 2) entry.moto2 = moto.id
    if (parsed.motoIndex === 3) entry.moto3 = moto.id
    batchMap.set(parsed.batchIndex, entry)
  }

  const requiredMotoCount = batchMap.size === 1 && Array.from(batchMap.values()).some((entry) => entry.moto3) ? 3 : 2
  if (batchMap.size === 0) return false
  return Array.from(batchMap.values()).every((entry) => {
    if (!entry.moto1 || !entry.moto2) return false
    if (requiredMotoCount >= 3 && !entry.moto3) return false
    return (
      isMotoComplete(entry.moto1, assignedRows, resultRows) &&
      isMotoComplete(entry.moto2, assignedRows, resultRows) &&
      (requiredMotoCount < 3 || isMotoComplete(entry.moto3 as string, assignedRows, resultRows))
    )
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params
  const body = await req.json().catch(() => ({}))
  const categoryId = body?.category_id as string | undefined
  if (!categoryId) return NextResponse.json({ error: 'category_id required' }, { status: 400 })

  const { data: category, error: catError } = await adminClient
    .from('categories')
    .select('id, event_id')
    .eq('id', categoryId)
    .maybeSingle()
  if (catError || !category || category.event_id !== eventId) {
    return NextResponse.json({ error: 'Category not found in event' }, { status: 404 })
  }

  const resolved = await resolveCategoryConfig(categoryId)

  const { data: qualificationMotos, error: motoError } = await adminClient
    .from('motos')
    .select('id, moto_name')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })

  const qualificationMotoRows = ((qualificationMotos ?? []) as MotoRow[]).filter((moto) => parseBatchKey(moto.moto_name))
  const qualificationMotoIds = qualificationMotoRows.map((moto) => moto.id)
  const { data: assignedRows, error: assignedError } = qualificationMotoIds.length
    ? await adminClient.from('moto_riders').select('moto_id, rider_id').in('moto_id', qualificationMotoIds)
    : { data: [], error: null }
  if (assignedError) return NextResponse.json({ error: assignedError.message }, { status: 400 })
  const { data: resultRows, error: resultError } = qualificationMotoIds.length
    ? await adminClient.from('results').select('moto_id, rider_id').in('moto_id', qualificationMotoIds)
    : { data: [], error: null }
  if (resultError) return NextResponse.json({ error: resultError.message }, { status: 400 })

  if (!isQualificationReady(qualificationMotoRows, (assignedRows ?? []) as MotoRiderRow[], (resultRows ?? []) as ResultRow[])) {
    return NextResponse.json(
      { warning: 'Belum ada hasil qualification lengkap. Selesaikan Moto 1 dan Moto 2 semua batch dulu.' },
      { status: 200 }
    )
  }

  const qualificationResult = await computeQualificationAndStore(eventId, categoryId)
  if (!qualificationResult.ok) {
    return NextResponse.json(
      { warning: qualificationResult.warning ?? 'Qualification skipped.' },
      { status: 200 }
    )
  }

  const stageMotoResult = await generateStageMotos(eventId, categoryId)
  if (!stageMotoResult.ok) {
    return NextResponse.json(
      { warning: stageMotoResult.warning ?? 'Gagal membentuk moto advanced stage.' },
      { status: 200 }
    )
  }

  return NextResponse.json({
    data: {
      stages: resolved.stages,
      final_classes: resolved.finalClasses,
      total_riders: resolved.totalRiders,
      source: resolved.source,
    },
    warning: resolved.warning,
  })
}
