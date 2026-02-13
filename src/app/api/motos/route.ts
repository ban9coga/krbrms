import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../lib/auth'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const eventId = searchParams.get('event_id')
  const categoryId = searchParams.get('category_id')
  if (!eventId && !categoryId) {
    return NextResponse.json({ error: 'event_id or category_id required' }, { status: 400 })
  }
  let query = adminClient
    .from('motos')
    .select('id, event_id, category_id, moto_name, moto_order, status')
    .order('moto_order', { ascending: true })
  if (eventId) query = query.eq('event_id', eventId)
  if (categoryId) query = query.eq('category_id', categoryId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
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
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
