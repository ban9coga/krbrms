import { NextResponse } from 'next/server'
import { adminClient, getAccessibleEventIds, requireAdmin } from '../../../../lib/auth'

export async function GET(req: Request) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const accessibleEventIds =
    auth.role === 'SUPER_ADMIN' ? null : await getAccessibleEventIds(auth.user.id, ['ADMIN', 'SUPER_ADMIN'])

  if (accessibleEventIds && accessibleEventIds.length === 0) {
    return NextResponse.json({
      data: {
        total_riders: 0,
        total_registrations: 0,
        live_motos: 0,
        last_updated: null,
      },
    })
  }

  let riderQuery = adminClient
    .from('riders')
    .select('id', { count: 'exact', head: true })
  if (accessibleEventIds) riderQuery = riderQuery.in('event_id', accessibleEventIds)
  const { count: riderCount, error: riderError } = await riderQuery
  if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })

  let regQuery = adminClient
    .from('registrations')
    .select('id', { count: 'exact', head: true })
  if (accessibleEventIds) regQuery = regQuery.in('event_id', accessibleEventIds)
  const { count: regCount, error: regError } = await regQuery
  if (regError) return NextResponse.json({ error: regError.message }, { status: 400 })

  let motoQuery = adminClient
    .from('motos')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'LIVE')
  if (accessibleEventIds) motoQuery = motoQuery.in('event_id', accessibleEventIds)
  const { count: liveMotos, error: motoError } = await motoQuery
  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })

  let lastEventQuery = adminClient
    .from('events')
    .select('updated_at, created_at')
    .order('updated_at', { ascending: false })
    .limit(1)
  if (accessibleEventIds) lastEventQuery = lastEventQuery.in('id', accessibleEventIds)
  const { data: lastEvent, error: lastError } = await lastEventQuery
  const lastEventRow = (lastEvent ?? [])[0]
  if (lastError) return NextResponse.json({ error: lastError.message }, { status: 400 })

  return NextResponse.json({
    data: {
      total_riders: riderCount ?? 0,
      total_registrations: regCount ?? 0,
      live_motos: liveMotos ?? 0,
      last_updated: lastEventRow?.updated_at ?? lastEventRow?.created_at ?? null,
    },
  })
}
