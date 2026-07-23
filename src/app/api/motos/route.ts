import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../lib/auth'

const MOTO_RETURN_SELECT =
  'id, event_id, category_id, moto_name, moto_order, status, is_published, published_at, provisional_at, checker_prep_ready_at'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('event_id')
  const categoryId = searchParams.get('category_id')
  const _ = searchParams.get('_') // Cache buster support

  if (!eventId && !categoryId) {
    return NextResponse.json({ error: 'event_id or category_id required' }, { status: 400 })
  }

  const selectQuery = adminClient
    .from('motos')
    .select(MOTO_RETURN_SELECT)
    .order('moto_order', { ascending: true })

  const finalQuery = eventId ? selectQuery.eq('event_id', eventId) : selectQuery.eq('category_id', categoryId)

  const { data, error } = await finalQuery
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const motoRows = data ?? []
  const motoIds = motoRows.map((row) => row.id)
  let lockMap = new Map<string, string | null>()

  if (motoIds.length > 0) {
    const { data: lockRows } = await adminClient
      .from('moto_locks')
      .select('moto_id, locked_at')
      .in('moto_id', motoIds)
    lockMap = new Map((lockRows ?? []).map((row) => [row.moto_id as string, (row.locked_at as string | null) ?? null]))
  }

  const enriched = motoRows.map((row) => ({
    ...row,
    locked_at: lockMap.get(row.id) ?? null,
  }))

  return NextResponse.json(
    { data: enriched },
    {
      headers: {
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=120',
        Pragma: 'cache',
        Expires: '30',
      },
    }
  )
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { event_id, category_id, moto_name, moto_order } = body ?? {}
  if (!event_id || !category_id || !moto_name || !moto_order) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  const { data, error } = await adminClient
    .from('motos')
    .insert([{ event_id, category_id, moto_name, moto_order }])
    .select(MOTO_RETURN_SELECT)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
