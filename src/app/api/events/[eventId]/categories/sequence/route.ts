import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'
import { PUBLIC_FINISHED_EVENT_ARCHIVE_TAG } from '../../../../../../services/publicFinishedEventArchive'

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const categoryIds: string[] = Array.isArray(body?.category_ids)
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

  const updates = await Promise.all(
    categoryIds.map(async (categoryId, index) => {
      const { error: updateError } = await adminClient
        .from('categories')
        .update({ sequence_order: index + 1 })
        .eq('id', categoryId)
        .eq('event_id', eventId)
      return updateError
    })
  )

  const updateError = updates.find(Boolean)
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 })
  }

  // Finished public event pages read their immutable snapshot. Keep only the
  // category order in that snapshot in sync without rebuilding all race data.
  const { data: event } = await adminClient.from('events').select('status').eq('id', eventId).maybeSingle()
  if (event?.status === 'FINISHED') {
    const { data: snapshot, error: snapshotError } = await adminClient
      .from('event_public_snapshots')
      .select('payload')
      .eq('event_id', eventId)
      .maybeSingle()

    if (snapshotError) return NextResponse.json({ error: snapshotError.message }, { status: 400 })

    const payload = asRecord(snapshot?.payload)
    const snapshotCategories = Array.isArray(payload?.categories) ? payload.categories : null
    if (payload && snapshotCategories) {
      const orderById = new Map(categoryIds.map((categoryId, index) => [categoryId, index + 1]))
      const categoriesWithNewOrder = snapshotCategories.map((category) => {
        const record = asRecord(category)
        if (!record || typeof record.id !== 'string') return category
        return { ...record, sequence_order: orderById.get(record.id) ?? record.sequence_order ?? null }
      })
      const { error: archiveError } = await adminClient
        .from('event_public_snapshots')
        .update({ payload: { ...payload, categories: categoriesWithNewOrder } })
        .eq('event_id', eventId)
      if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 400 })
      revalidateTag(PUBLIC_FINISHED_EVENT_ARCHIVE_TAG, 'max')
    }
  }

  return NextResponse.json({ ok: true })
}
