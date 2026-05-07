import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'
import { resolveCategoryConfig } from '../../../../../../services/categoryResolver'
import {
  computeQualificationAndStore,
  generateStageMotos,
} from '../../../../../../services/advancedRaceAuto'

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
