import { NextResponse } from 'next/server'
import { adminClient } from '../../../../lib/auth'
import { getAccessibleEventIds, requireJury } from '../../../../services/juryAuth'

export async function GET(req: Request) {
  const auth = await requireJury(req, ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(req.url)
  const statuses = searchParams.get('status')?.split(',') ?? ['LIVE', 'UPCOMING']

  const accessibleEventIds = await getAccessibleEventIds(auth.user.id, ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'super_admin'])
  if (Array.isArray(accessibleEventIds) && accessibleEventIds.length === 0) {
    return NextResponse.json({ data: [] })
  }

  let query = adminClient.from('events').select('id, name, location, event_date, status').in('status', statuses)
  if (Array.isArray(accessibleEventIds)) query = query.in('id', accessibleEventIds)
  const { data, error } = await query.order('event_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
