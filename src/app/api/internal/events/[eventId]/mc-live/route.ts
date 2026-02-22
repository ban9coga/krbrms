import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

type MotoRow = {
  id: string
  category_id: string
  moto_name: string
  moto_order: number
  status: string
  is_published: boolean | null
}

type ResultRow = {
  rider_id: string
  finish_order: number | null
  result_status: 'FINISH' | 'DNF' | 'DNS' | null
}

type RiderRow = {
  id: string
  name: string
  no_plate_display: string
}

const pickCurrentMoto = (motos: MotoRow[]) => {
  const live = motos.filter((m) => m.status === 'LIVE')
  if (live.length > 0) return live[0]
  const provisional = motos.filter((m) => m.status === 'PROVISIONAL')
  if (provisional.length > 0) return provisional[0]
  return motos[0] ?? null
}

const parseBatch = (name: string) => {
  const match = name.match(/batch\s*(\d+)/i)
  return match ? `Batch ${match[1]}` : '-'
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireJury(req, ['MC'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { eventId } = await params

  const { data: reviewMotos } = await adminClient
    .from('motos')
    .select('id, moto_name, moto_order, status, category_id, is_published')
    .eq('event_id', eventId)
    .eq('status', 'PROTEST_REVIEW')
    .order('moto_order', { ascending: true })

  const { data: motos, error: motoError } = await adminClient
    .from('motos')
    .select('id, moto_name, moto_order, status, category_id, is_published')
    .eq('event_id', eventId)
    .in('status', ['LIVE', 'PROVISIONAL', 'LOCKED'])
    .order('moto_order', { ascending: true })

  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })

  const underReview = (reviewMotos ?? []).length > 0
  if (underReview) {
    const reviewMoto = (reviewMotos ?? [])[0]
    return NextResponse.json({
      data: {
        under_review: true,
        review_moto: reviewMoto,
      },
    })
  }

  const list = (motos ?? []) as MotoRow[]
  const currentMoto = pickCurrentMoto(list)
  if (!currentMoto) {
    return NextResponse.json({
      data: {
        under_review: false,
        moto: null,
        category: null,
        batch: null,
        ranking: [],
      },
    })
  }

  const { data: category } = await adminClient
    .from('categories')
    .select('label')
    .eq('id', currentMoto.category_id)
    .maybeSingle()

  const { data: results, error: resultError } = await adminClient
    .from('results')
    .select('rider_id, finish_order, result_status')
    .eq('moto_id', currentMoto.id)
    .order('finish_order', { ascending: true, nullsFirst: false })
  if (resultError) return NextResponse.json({ error: resultError.message }, { status: 400 })

  const { data: motoRiders } = await adminClient
    .from('moto_riders')
    .select('rider_id')
    .eq('moto_id', currentMoto.id)
  const lastPosition = (motoRiders ?? []).length || null

  const riderIds = Array.from(new Set((results ?? []).map((r) => r.rider_id)))
  const { data: riders } = await adminClient
    .from('riders')
    .select('id, name, no_plate_display')
    .in('id', riderIds)
  const riderMap = new Map((riders ?? []).map((r: RiderRow) => [r.id, r]))

  const penaltyMap = new Map<string, number>()
  if (riderIds.length > 0) {
    const { data: penalties, error: penaltyError } = await adminClient
      .from('rider_penalties')
      .select('rider_id, penalty_point, rider_penalty_approvals!inner(approval_status)')
      .eq('event_id', eventId)
      .eq('stage', 'MOTO')
      .eq('rider_penalty_approvals.approval_status', 'APPROVED')
      .in('rider_id', riderIds)
    if (penaltyError) return NextResponse.json({ error: penaltyError.message }, { status: 400 })
    for (const row of penalties ?? []) {
      const current = penaltyMap.get(row.rider_id) ?? 0
      penaltyMap.set(row.rider_id, current + Number(row.penalty_point ?? 0))
    }
  }

  const ranking = (results ?? []).map((row) => {
    const rider = riderMap.get(row.rider_id)
    const status = row.result_status ?? 'FINISH'
    const basePoint =
      status === 'DNS'
        ? 9
        : status === 'DNF'
        ? lastPosition
        : row.finish_order ?? null
    const penalty = penaltyMap.get(row.rider_id) ?? 0
    const total = basePoint !== null ? basePoint + penalty : null
    return {
      rider_id: row.rider_id,
      finish_order: row.finish_order ?? null,
      total_point: total,
      rider_name: rider?.name ?? '-',
      plate: rider?.no_plate_display ?? '-',
    }
  })

  ranking.sort((a, b) => {
    const at = a.total_point ?? 9999
    const bt = b.total_point ?? 9999
    if (at !== bt) return at - bt
    return (a.finish_order ?? 9999) - (b.finish_order ?? 9999)
  })

  return NextResponse.json({
    data: {
      under_review: false,
      moto: currentMoto,
      category: category?.label ?? null,
      batch: parseBatch(currentMoto.moto_name),
      ranking,
    },
  })
}
