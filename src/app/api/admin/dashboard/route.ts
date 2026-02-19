import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../lib/auth'

export async function GET(req: Request) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { count: riderCount, error: riderError } = await adminClient
    .from('riders')
    .select('id', { count: 'exact', head: true })
  if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })

  const { count: regCount, error: regError } = await adminClient
    .from('registrations')
    .select('id', { count: 'exact', head: true })
  if (regError) return NextResponse.json({ error: regError.message }, { status: 400 })

  const { count: liveMotos, error: motoError } = await adminClient
    .from('motos')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'LIVE')
  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })

  const { data: lastEvent, error: lastError } = await adminClient
    .from('events')
    .select('updated_at, created_at')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastError) return NextResponse.json({ error: lastError.message }, { status: 400 })

  return NextResponse.json({
    data: {
      total_riders: riderCount ?? 0,
      total_registrations: regCount ?? 0,
      live_motos: liveMotos ?? 0,
      last_updated: lastEvent?.updated_at ?? lastEvent?.created_at ?? null,
    },
  })
}
