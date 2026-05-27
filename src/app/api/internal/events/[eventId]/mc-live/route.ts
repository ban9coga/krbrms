import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { compareMotoSequence } from '../../../../../../lib/motoSequence'
import { requireJury } from '../../../../../../services/juryAuth'

type MotoRow = {
  id: string
  category_id: string
  moto_name: string
  moto_order: number
  status: string
  is_published: boolean | null
}

type RiderRow = {
  id: string
  name: string
  rider_nickname?: string | null
  no_plate_display: string
  club?: string | null
}

type McRankingRow = {
  rider_id: string
  finish_order: number | null
  total_point: number | null
  rider_name: string
  rider_nickname?: string | null
  plate: string
  club?: string | null
  gate_position?: number | null
  status: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING'
}

type NextMotoRiderRow = {
  rider_id: string
  rider_name: string
  rider_nickname?: string | null
  plate: string
  club?: string | null
  gate_position?: number | null
}

const pickCurrentMoto = (motos: MotoRow[]) => {
  const provisional = motos.filter((m) => m.status === 'PROVISIONAL')
  if (provisional.length > 0) return provisional[provisional.length - 1]
  const live = motos.filter((m) => m.status === 'LIVE')
  if (live.length > 0) return live[0]
  const locked = motos.filter((m) => m.status === 'LOCKED')
  if (locked.length > 0) return locked[locked.length - 1]
  const upcoming = motos.filter((m) => m.status === 'UPCOMING')
  if (upcoming.length > 0) return upcoming[0]
  return motos[0] ?? null
}

const parseBatch = (name: string) => {
  const match = name.match(/batch\s*(\d+)/i)
  return match ? `Batch ${match[1]}` : '-'
}

const parseMotoLabel = (name: string) => {
  const match = name.match(/moto\s*(\d+)/i)
  return match ? `Moto ${match[1]}` : name
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireJury(req, ['MC'], eventId)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: eventRow, error: eventError } = await adminClient
    .from('events')
    .select('id, name')
    .eq('id', eventId)
    .maybeSingle()
  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 400 })

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
    .in('status', ['UPCOMING', 'LIVE', 'PROVISIONAL', 'LOCKED', 'FINISHED'])
    .order('moto_order', { ascending: true })

  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })

  const { data: categories, error: categoryError } = await adminClient
    .from('categories')
    .select('id, label')
    .eq('event_id', eventId)
  if (categoryError) return NextResponse.json({ error: categoryError.message }, { status: 400 })
  const categoryMap = new Map((categories ?? []).map((row) => [row.id, row.label]))

  const sortedReviewMotos = [...(reviewMotos ?? [])].sort(compareMotoSequence)
  const underReview = sortedReviewMotos.length > 0
  if (underReview) {
    const reviewMoto = sortedReviewMotos[0]
    return NextResponse.json({
      data: {
        under_review: true,
        event_name: eventRow?.name ?? 'Event',
        review_moto: reviewMoto,
      },
    })
  }

  const list = [...((motos ?? []) as MotoRow[])].sort(compareMotoSequence)
  const currentMoto = pickCurrentMoto(list)
  if (!currentMoto) {
    return NextResponse.json({
      data: {
        under_review: false,
        event_name: eventRow?.name ?? 'Event',
        moto: null,
        category: null,
        batch: null,
        ranking: [],
        next_moto_riders: [],
        next_moto: null,
      },
    })
  }

  const currentCategoryLabel = categoryMap.get(currentMoto.category_id) ?? null
  const listForNext = [...((motos ?? []) as MotoRow[])].sort(compareMotoSequence)
  const currentIndex = listForNext.findIndex((row) => row.id === currentMoto.id)
  const nextMoto =
    currentIndex >= 0
      ? listForNext
          .slice(currentIndex + 1)
          .find((row) => ['UPCOMING', 'LIVE', 'PROVISIONAL'].includes((row.status ?? '').toUpperCase())) ??
        listForNext.find((row) => ['UPCOMING', 'LIVE', 'PROVISIONAL'].includes((row.status ?? '').toUpperCase())) ??
        listForNext.slice(currentIndex + 1)[0] ??
        null
      : listForNext.find((row) => ['UPCOMING', 'LIVE', 'PROVISIONAL'].includes((row.status ?? '').toUpperCase())) ?? null

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
  const { data: gatePositions } = await adminClient
    .from('moto_gate_positions')
    .select('rider_id, gate_position')
    .eq('moto_id', currentMoto.id)

  const gateMap = new Map((gatePositions ?? []).map((row) => [row.rider_id, Number(row.gate_position ?? 0) || null]))

  const riderIds = Array.from(new Set([...(results ?? []).map((r) => r.rider_id), ...((motoRiders ?? []).map((r) => r.rider_id))]))
  const { data: riders } = await adminClient
    .from('riders')
    .select('id, name, rider_nickname, no_plate_display, club')
    .in('id', riderIds)
  const riderMap = new Map((riders ?? []).map((r: RiderRow) => [r.id, r]))
  const resultMap = new Map((results ?? []).map((row) => [row.rider_id, row]))

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

  const { data: pointOverrideConfig } = await adminClient
    .from('race_stage_config')
    .select('dnf_point_override, dns_point_override')
    .eq('event_id', eventId)
    .eq('category_id', currentMoto.category_id)
    .maybeSingle()

  const ranking: McRankingRow[] = riderIds.map((riderId) => {
    const row = resultMap.get(riderId)
    const rider = riderMap.get(riderId)
    const status = ((row?.result_status ?? 'PENDING') as 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING')
    const basePoint =
      status === 'DQ'
        ? null
        : status === 'DNS'
          ? ((lastPosition ?? 0) > 0 ? Number(pointOverrideConfig?.dns_point_override ?? (lastPosition as number) + 2) : null)
        : status === 'DNF'
          ? ((lastPosition ?? 0) > 0 ? Number(pointOverrideConfig?.dnf_point_override ?? lastPosition) : null)
        : status === 'FINISH'
          ? row?.finish_order ?? null
        : null
    const penalty = penaltyMap.get(riderId) ?? 0
    const total = basePoint !== null ? basePoint + penalty : null
    return {
      rider_id: riderId,
      finish_order: row?.finish_order ?? null,
      total_point: total,
      rider_name: rider?.name ?? '-',
      rider_nickname: rider?.rider_nickname ?? null,
      plate: rider?.no_plate_display ?? '-',
      club: rider?.club ?? null,
      gate_position: gateMap.get(riderId) ?? null,
      status,
    }
  })

  ranking.sort((a, b) => {
    const aStatusWeight = a.status === 'FINISH' ? 0 : a.status === 'DNF' ? 1 : a.status === 'DNS' ? 2 : a.status === 'DQ' ? 3 : 4
    const bStatusWeight = b.status === 'FINISH' ? 0 : b.status === 'DNF' ? 1 : b.status === 'DNS' ? 2 : b.status === 'DQ' ? 3 : 4
    if (aStatusWeight !== bStatusWeight) return aStatusWeight - bStatusWeight
    const at = a.total_point ?? 9999
    const bt = b.total_point ?? 9999
    if (at !== bt) return at - bt
    const aGate = a.gate_position ?? 9999
    const bGate = b.gate_position ?? 9999
    if (aGate !== bGate) return aGate - bGate
    return a.plate.localeCompare(b.plate)
  })

  let nextMotoRiders: NextMotoRiderRow[] = []
  if (nextMoto) {
    const [{ data: nextMotoAssignments }, { data: nextMotoGates }] = await Promise.all([
      adminClient.from('moto_riders').select('rider_id').eq('moto_id', nextMoto.id),
      adminClient.from('moto_gate_positions').select('rider_id, gate_position').eq('moto_id', nextMoto.id),
    ])
    const nextGateMap = new Map((nextMotoGates ?? []).map((row) => [row.rider_id, Number(row.gate_position ?? 0) || null]))
    const nextRiderIds = Array.from(new Set((nextMotoAssignments ?? []).map((row) => row.rider_id)))
    if (nextRiderIds.length > 0) {
      const { data: nextRiders } = await adminClient
        .from('riders')
        .select('id, name, rider_nickname, no_plate_display, club')
        .in('id', nextRiderIds)
      const nextRiderMap = new Map((nextRiders ?? []).map((row: RiderRow) => [row.id, row]))
      nextMotoRiders = nextRiderIds
        .map((riderId) => {
          const rider = nextRiderMap.get(riderId)
          return {
            rider_id: riderId,
            rider_name: rider?.name ?? '-',
            rider_nickname: rider?.rider_nickname ?? null,
            plate: rider?.no_plate_display ?? '-',
            club: rider?.club ?? null,
            gate_position: nextGateMap.get(riderId) ?? null,
          }
        })
        .sort((a, b) => {
          const aGate = a.gate_position ?? 9999
          const bGate = b.gate_position ?? 9999
          if (aGate !== bGate) return aGate - bGate
          return a.plate.localeCompare(b.plate)
        })
    }
  }

  return NextResponse.json({
    data: {
      under_review: false,
      event_name: eventRow?.name ?? 'Event',
      moto: currentMoto,
      category: currentCategoryLabel,
      batch: parseBatch(currentMoto.moto_name),
      ranking,
      next_moto_riders: nextMotoRiders,
      next_moto: nextMoto
        ? {
            id: nextMoto.id,
            moto_name: nextMoto.moto_name,
            moto_label: parseMotoLabel(nextMoto.moto_name),
            moto_order: nextMoto.moto_order,
            status: nextMoto.status,
            category: categoryMap.get(nextMoto.category_id) ?? null,
            batch: parseBatch(nextMoto.moto_name),
          }
        : null,
    },
  })
}
