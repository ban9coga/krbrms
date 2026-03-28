import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../lib/auth'
import { getAccessibleEventIds, requireJury } from '../../../../../services/juryAuth'

export async function GET(req: Request) {
  const auth = await requireJury(req, ['MC', 'admin', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const accessibleEventIds = await getAccessibleEventIds(auth.user.id, ['MC', 'admin', 'super_admin'])
  if (Array.isArray(accessibleEventIds) && accessibleEventIds.length === 0) {
    return NextResponse.json({ data: [] })
  }

  let query = adminClient.from('events').select('id, name, location, event_date, status').in('status', ['LIVE', 'UPCOMING'])
  if (Array.isArray(accessibleEventIds)) query = query.in('id', accessibleEventIds)
  const { data, error } = await query.order('status', { ascending: true }).order('event_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: data ?? [] })
}
