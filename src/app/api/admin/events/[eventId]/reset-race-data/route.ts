import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'

const isAdvancedMoto = (motoName: string) => /^(REPECHAGE|QUARTER\s+FINAL|SEMI\s+FINAL|FINAL\s+)/i.test(motoName)

async function requireCentralAdmin(req: Request, eventId: string) {
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (auth.role !== 'SUPER_ADMIN') {
    return { ok: false as const, response: NextResponse.json({ error: 'Hanya Central Admin yang dapat reset data race.' }, { status: 403 }) }
  }
  return { ok: true as const, auth }
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const access = await requireCentralAdmin(req, eventId)
  if (!access.ok) return access.response

  const { data: categoryRows, error: categoryError } = await adminClient
    .from('categories')
    .select('id')
    .eq('event_id', eventId)
  if (categoryError) return NextResponse.json({ error: categoryError.message }, { status: 400 })
  const categoryIds = (categoryRows ?? []).map((row) => row.id)

  const [eventResult, motosResult, resultsResult, penaltiesResult, safetyResult, locksResult, stageResult] = await Promise.all([
    adminClient.from('events').select('id, name, status').eq('id', eventId).maybeSingle(),
    adminClient.from('motos').select('id, moto_name').eq('event_id', eventId),
    adminClient.from('results').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
    adminClient.from('rider_penalties').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
    adminClient.from('rider_safety_checks').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
    adminClient.from('moto_locks').select('moto_id', { count: 'exact', head: true }).eq('event_id', eventId),
    adminClient.from('race_stage_result').select('id', { count: 'exact', head: true }).in('category_id', categoryIds),
  ])
  if (eventResult.error || !eventResult.data) return NextResponse.json({ error: 'Event tidak ditemukan.' }, { status: 404 })

  return NextResponse.json({
    data: {
      event: eventResult.data,
      advancedMotos: (motosResult.data ?? []).filter((moto) => isAdvancedMoto(moto.moto_name)).length,
      results: resultsResult.count ?? 0,
      penalties: penaltiesResult.count ?? 0,
      safetyChecks: safetyResult.count ?? 0,
      locks: locksResult.count ?? 0,
      stageResults: stageResult.count ?? 0,
    },
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const access = await requireCentralAdmin(req, eventId)
  if (!access.ok) return access.response

  const body = await req.json().catch(() => ({}))
  if (body?.confirmation !== 'RESET RACE') {
    return NextResponse.json({ error: 'Ketik RESET RACE untuk mengonfirmasi.' }, { status: 400 })
  }

  const { data: event, error: eventError } = await adminClient.from('events').select('status').eq('id', eventId).maybeSingle()
  if (eventError || !event) return NextResponse.json({ error: 'Event tidak ditemukan.' }, { status: 404 })
  if (String(event.status).toUpperCase() !== 'UPCOMING') {
    return NextResponse.json({ error: 'Reset hanya dapat dijalankan pada event UPCOMING.' }, { status: 409 })
  }

  const { data, error } = await adminClient.rpc('reset_event_race_data', {
    p_event_id: eventId,
    p_performed_by: access.auth.user.id,
    p_reason: 'Reset data race untuk simulasi',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
