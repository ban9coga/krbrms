import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'

type StageRow = {
  category_id: string
  stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'FINAL'
}

type MotoRow = {
  category_id: string
  moto_name: string
}

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
    .select('category_id, moto_name')
    .eq('event_id', eventId)
    .in('category_id', categoryIds)
  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })

  const summary: Record<
    string,
    {
      stageCounts: Record<string, number>
      motoCounts: { quarter: number; semi: number; final: number }
    }
  > = {}

  for (const id of categoryIds) {
    summary[id] = {
      stageCounts: { QUALIFICATION: 0, QUARTER_FINAL: 0, SEMI_FINAL: 0, FINAL: 0 },
      motoCounts: { quarter: 0, semi: 0, final: 0 },
    }
  }

  for (const row of (stageRows ?? []) as StageRow[]) {
    if (!summary[row.category_id]) continue
    summary[row.category_id].stageCounts[row.stage] =
      (summary[row.category_id].stageCounts[row.stage] ?? 0) + 1
  }

  for (const row of (motoRows ?? []) as MotoRow[]) {
    const name = row.moto_name.toLowerCase()
    if (!summary[row.category_id]) continue
    if (name.startsWith('quarter final')) summary[row.category_id].motoCounts.quarter += 1
    else if (name.startsWith('semi final')) summary[row.category_id].motoCounts.semi += 1
    else if (name.startsWith('final ')) summary[row.category_id].motoCounts.final += 1
  }

  return NextResponse.json({ data: summary })
}
