import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'

export async function GET(_: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const { data: moto, error: motoError } = await adminClient
    .from('motos')
    .select('id, event_id')
    .eq('id', motoId)
    .maybeSingle()
  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })
  const { data, error } = await adminClient
    .from('results')
    .select(
      `
        id,
        finish_order,
        result_status,
        riders (
          id,
          name,
          no_plate_display
        )
      `
    )
    .eq('moto_id', motoId)
    .order('finish_order', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const { data: motoRiders, error: mrError } = await adminClient
    .from('moto_riders')
    .select('rider_id')
    .eq('moto_id', motoId)
  if (mrError) return NextResponse.json({ error: mrError.message }, { status: 400 })
  const lastPosition = (motoRiders ?? []).length || null

  const penaltyMap = new Map<string, number>()
  if (moto?.event_id) {
    const { data: penalties, error: penaltyError } = await adminClient
      .from('rider_penalties')
      .select('rider_id, penalty_point, rider_penalty_approvals!inner(approval_status)')
      .eq('event_id', moto.event_id)
      .eq('stage', 'MOTO')
      .eq('rider_penalty_approvals.approval_status', 'APPROVED')

    if (penaltyError) return NextResponse.json({ error: penaltyError.message }, { status: 400 })
    for (const row of penalties ?? []) {
      const current = penaltyMap.get(row.rider_id) ?? 0
      penaltyMap.set(row.rider_id, current + Number(row.penalty_point ?? 0))
    }
  }

  const enriched = (data ?? []).map((row) => {
    const rider =
      Array.isArray(row.riders) ? row.riders[0] : row.riders
    const riderId = rider?.id
    const penalty_total = riderId ? penaltyMap.get(riderId) ?? 0 : 0
    const status = (row.result_status ?? 'FINISH') as 'FINISH' | 'DNF' | 'DNS'
    const basePoint =
      status === 'DNS'
        ? 9
        : status === 'DNF'
        ? lastPosition
        : row.finish_order ?? null
    const total_point = basePoint !== null ? basePoint + penalty_total : null
    return {
      ...row,
      penalty_total,
      total_point,
    }
  })

  return NextResponse.json({ data: enriched })
}

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { motoId } = await params
  const body = await req.json()
  const { results } = body ?? {}
  if (!Array.isArray(results) || results.length === 0) {
    return NextResponse.json({ error: 'results required' }, { status: 400 })
  }

  const { data: moto, error: motoError } = await adminClient
    .from('motos')
    .select('id, event_id')
    .eq('id', motoId)
    .single()

  if (motoError || !moto?.event_id) {
    return NextResponse.json({ error: 'Moto not found' }, { status: 404 })
  }

  const payload = (results as Array<{ rider_id: string; finish_order?: number | null; result_status?: string }>).map((row) => ({
    event_id: moto.event_id,
    moto_id: motoId,
    rider_id: row.rider_id,
    finish_order: row.finish_order ?? null,
    result_status: row.result_status ?? 'FINISH',
  }))

  const { data: allowed } = await adminClient
    .from('moto_riders')
    .select('rider_id')
    .eq('moto_id', motoId)
  const allowedSet = new Set((allowed ?? []).map((row) => row.rider_id))
  if (allowedSet.size === 0) {
    return NextResponse.json({ error: 'No riders assigned to moto' }, { status: 400 })
  }

  const invalid = payload.find((row) => !allowedSet.has(row.rider_id))
  if (invalid) {
    return NextResponse.json({ error: 'Rider not assigned to moto' }, { status: 400 })
  }

  const finishOrders = payload
    .filter((row) => row.result_status === 'FINISH' && row.finish_order !== null && row.finish_order !== undefined)
    .map((row) => Number(row.finish_order))
  const duplicates = finishOrders.filter((v, i, arr) => arr.indexOf(v) !== i)
  if (duplicates.length > 0) {
    return NextResponse.json({ error: 'Duplicate finish_order in payload' }, { status: 400 })
  }

  const { error } = await adminClient
    .from('results')
    .upsert(payload, { onConflict: 'moto_id,rider_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
