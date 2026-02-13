import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../../lib/auth'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { searchParams } = new URL(req.url)
  const categoryId = searchParams.get('category_id')
  if (!categoryId) return NextResponse.json({ error: 'category_id required' }, { status: 400 })

  const { data: category, error: catError } = await adminClient
    .from('categories')
    .select('id, event_id')
    .eq('id', categoryId)
    .maybeSingle()
  if (catError || !category || category.event_id !== eventId) {
    return NextResponse.json({ error: 'Category not found in event' }, { status: 404 })
  }

  const { data, error } = await adminClient
    .from('race_stage_result')
    .select(
      `
        id,
        rider_id,
        category_id,
        stage,
        batch_id,
        final_class,
        position,
        points,
        riders ( name, no_plate_display )
      `
    )
    .eq('category_id', categoryId)
    .order('stage', { ascending: true })
    .order('position', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: data ?? [] })
}
