import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../lib/auth'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const auth = await requireAdmin(req.headers.get('authorization'))
  let query = adminClient
    .from('events')
    .select('id, name, location, event_date, status, is_public, created_at, updated_at')
    .order('event_date', { ascending: false })
  if (status) {
    query = query.eq('status', status)
  }
  if (!auth.ok) {
    query = query.eq('is_public', true)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { name, location, event_date, status = 'UPCOMING', is_public = true } = body ?? {}
  if (!name || !event_date) {
    return NextResponse.json({ error: 'name and event_date required' }, { status: 400 })
  }
  const { data, error } = await adminClient
    .from('events')
    .insert([{ name, location, event_date, status, is_public }])
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
