import { NextResponse } from 'next/server'
import { adminClient, getAccessibleEventIds, requireScopedWorkspace } from '../../../../lib/auth'

export async function GET(req: Request) {
  const auth = await requireScopedWorkspace(req.headers.get('authorization'), ['DRAW_MANAGER'])
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let query = adminClient
    .from('events')
    .select('id, name, location, event_date, status')
    .order('event_date', { ascending: false })

  if (auth.role !== 'SUPER_ADMIN' && auth.role !== 'ADMIN') {
    const eventIds = await getAccessibleEventIds(auth.user.id, ['DRAW_MANAGER'])
    if (eventIds.length === 0) return NextResponse.json({ data: [] })
    query = query.in('id', eventIds)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: data ?? [] })
}
