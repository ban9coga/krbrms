import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const categoryIds = Array.isArray(body?.category_ids)
    ? body.category_ids.filter((id: unknown): id is string => typeof id === 'string')
    : []

  if (categoryIds.length === 0) {
    return NextResponse.json({ error: 'category_ids is required' }, { status: 400 })
  }

  const { data: categories, error } = await adminClient
    .from('categories')
    .select('id')
    .eq('event_id', eventId)
    .in('id', categoryIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const validIds = new Set((categories ?? []).map((category) => category.id))
  if (validIds.size !== categoryIds.length) {
    return NextResponse.json({ error: 'Some categories do not belong to this event' }, { status: 400 })
  }

  for (let index = 0; index < categoryIds.length; index += 1) {
    const categoryId = categoryIds[index]
    const { error: updateError } = await adminClient
      .from('categories')
      .update({ sequence_order: index + 1 })
      .eq('id', categoryId)
      .eq('event_id', eventId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }
  }

  return NextResponse.json({ ok: true })
}
