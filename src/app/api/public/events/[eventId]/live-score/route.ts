import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'

type MotoRow = {
  id: string
  moto_name: string
  moto_order: number
}

type GateRow = {
  moto_id: string
  rider_id: string
  gate_position: number
}

type ResultRow = {
  moto_id: string
  rider_id: string
  finish_order: number | null
  result_status?: 'FINISH' | 'DNF' | 'DNS' | null
}

type RiderRow = {
  id: string
  name: string
  no_plate_display: string
  club: string | null
}

type StageRow = {
  rider_id: string
  gate: number | null
  name: string
  no_plate: string
  club: string | null
  point: number | null
  status: 'FINISH' | 'DNF' | 'DNS' | 'PENDING'
}

type StageGroup = {
  title: string
  moto_id: string
  rows: StageRow[]
}

const shuffle = <T,>(items: T[]) => {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const parseBatchKey = (name: string) => {
  const match = name.match(/moto\s*(\d+)\s*-\s*batch\s*(\d+)/i)
  if (!match) return null
  return { motoIndex: Number(match[1]), batchIndex: Number(match[2]) }
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { searchParams } = new URL(req.url)
  const categoryId = searchParams.get('category_id')
  if (!categoryId) return NextResponse.json({ error: 'category_id required' }, { status: 400 })

  const { data: category, error: catError } = await adminClient
    .from('categories')
    .select('id, event_id, label')
    .eq('id', categoryId)
    .maybeSingle()
  if (catError || !category || category.event_id !== eventId) {
    return NextResponse.json({ error: 'Category not found in event' }, { status: 404 })
  }

  const { data: motos, error: motoError } = await adminClient
    .from('motos')
    .select('id, moto_name, moto_order')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
    .order('moto_order', { ascending: true })
  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })
  const motoRows = (motos ?? []) as MotoRow[]

  const motoIds = motoRows.map((m) => m.id)
  if (motoIds.length === 0) return NextResponse.json({ data: { batches: [], category: category.label } })

  const { data: gates, error: gateError } = await adminClient
    .from('moto_gate_positions')
    .select('moto_id, rider_id, gate_position')
    .in('moto_id', motoIds)
  if (gateError) return NextResponse.json({ error: gateError.message }, { status: 400 })
  const gateRows = (gates ?? []) as GateRow[]

  const gateCountByMoto = new Map<string, number>()
  for (const row of gateRows) {
    gateCountByMoto.set(row.moto_id, (gateCountByMoto.get(row.moto_id) ?? 0) + 1)
  }

  const motoById = new Map(motoRows.map((m) => [m.id, m]))
  const missingGateMotoIds = motoIds.filter((id) => !gateCountByMoto.get(id))

  if (missingGateMotoIds.length > 0) {
    const { data: motoRiders, error: mrError } = await adminClient
      .from('moto_riders')
      .select('moto_id, rider_id')
      .in('moto_id', missingGateMotoIds)
    if (mrError) return NextResponse.json({ error: mrError.message }, { status: 400 })

    const grouped = new Map<string, string[]>()
    for (const row of motoRiders ?? []) {
      const list = grouped.get(row.moto_id) ?? []
      list.push(row.rider_id)
      grouped.set(row.moto_id, list)
    }

    const insertRows: GateRow[] = []
    for (const [motoId, riders] of grouped.entries()) {
      const moto = motoById.get(motoId)
      const baseOrder = [...riders].sort()
      let ordered = baseOrder
      if (moto?.moto_name && /moto\s*2\s*-/i.test(moto.moto_name)) {
        ordered = [...baseOrder].reverse()
      } else if (moto?.moto_name && /moto\s*3\s*-/i.test(moto.moto_name)) {
        ordered = shuffle(baseOrder)
      }
      ordered.forEach((riderId, idx) => {
        insertRows.push({ moto_id: motoId, rider_id: riderId, gate_position: idx + 1 })
      })
    }

    if (insertRows.length > 0) {
      const { error: insertError } = await adminClient.from('moto_gate_positions').insert(insertRows)
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 })
      gateRows.push(...insertRows)
    }
  }

  const { data: results, error: resultError } = await adminClient
    .from('results')
    .select('moto_id, rider_id, finish_order, result_status')
    .in('moto_id', motoIds)
  if (resultError) return NextResponse.json({ error: resultError.message }, { status: 400 })
  const resultRows = (results ?? []) as ResultRow[]

  const riderIds = Array.from(new Set(gateRows.map((g) => g.rider_id)))
  const statusMap = new Map<string, 'ACTIVE' | 'DNS' | 'DNF' | 'ABSENT'>()
  if (riderIds.length > 0) {
    const { data: statuses, error: statusError } = await adminClient
      .from('rider_participation_status')
      .select('rider_id, participation_status')
      .eq('event_id', eventId)
      .in('rider_id', riderIds)
    if (statusError) return NextResponse.json({ error: statusError.message }, { status: 400 })
    for (const row of statuses ?? []) {
      statusMap.set(row.rider_id, row.participation_status)
    }
  }
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
  const { data: riders, error: riderError } = await adminClient
    .from('riders')
    .select('id, name, no_plate_display, club')
    .in('id', riderIds)
  if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })
  const riderRows = (riders ?? []) as RiderRow[]
  const riderMap = new Map(riderRows.map((r) => [r.id, r]))

  const batchMap = new Map<number, { moto1?: MotoRow; moto2?: MotoRow; moto3?: MotoRow }>()
  for (const moto of motoRows) {
    const parsed = parseBatchKey(moto.moto_name)
    if (!parsed) continue
    const entry = batchMap.get(parsed.batchIndex) ?? {}
    if (parsed.motoIndex === 1) entry.moto1 = moto
    if (parsed.motoIndex === 2) entry.moto2 = moto
    if (parsed.motoIndex === 3) entry.moto3 = moto
    batchMap.set(parsed.batchIndex, entry)
  }

  const batches = Array.from(batchMap.entries())
    .filter(([, entry]) => entry.moto1 && entry.moto2)
    .map(([batchIndex, entry]) => {
      const moto1 = entry.moto1 as MotoRow
      const moto2 = entry.moto2 as MotoRow
      const moto3 = entry.moto3 ?? null
      const gates1 = gateRows.filter((g) => g.moto_id === moto1.id)
      const gates2 = gateRows.filter((g) => g.moto_id === moto2.id)
      const gates3 = moto3 ? gateRows.filter((g) => g.moto_id === moto3.id) : []
      const gate1Map = new Map(gates1.map((g) => [g.rider_id, g.gate_position]))
      const gate2Map = new Map(gates2.map((g) => [g.rider_id, g.gate_position]))
      const gate3Map = new Map(gates3.map((g) => [g.rider_id, g.gate_position]))
      const riderIdsInBatch = Array.from(
        new Set([...gate1Map.keys(), ...gate2Map.keys(), ...gate3Map.keys()])
      )

      const rows = riderIdsInBatch.map((riderId) => {
        const rider = riderMap.get(riderId)
        const moto1Result = resultRows.find((r) => r.moto_id === moto1.id && r.rider_id === riderId)
        const moto2Result = resultRows.find((r) => r.moto_id === moto2.id && r.rider_id === riderId)
        const moto3Result = moto3
          ? resultRows.find((r) => r.moto_id === moto3.id && r.rider_id === riderId)
          : null
        const lastPos1 = gate1Map.size || null
        const lastPos2 = gate2Map.size || null
        const lastPos3 = gate3Map.size || null
        const riderStatus = statusMap.get(riderId) ?? 'ACTIVE'
        const pointForResult = (res: ResultRow | null, lastPos: number | null) => {
          const status = res?.result_status ?? 'FINISH'
          if (status === 'DNS') return 9
          if (status === 'DNF') return lastPos
          return res?.finish_order ?? null
        }
        const point1 = pointForResult(moto1Result ?? null, lastPos1)
        const point2 = pointForResult(moto2Result ?? null, lastPos2)
        const point3 = pointForResult(moto3Result ?? null, lastPos3)
        const basePoint = [point1, point2, point3].filter((v) => v !== null).length
          ? [point1, point2, point3].reduce<number>((acc, v) => acc + (v ?? 0), 0)
          : null
        const penaltyTotal = penaltyMap.get(riderId) ?? 0
        const penaltyTotalForDq = basePoint !== null ? penaltyTotal : 0
        const penaltyTotalDisplay = basePoint !== null ? penaltyTotal : null
        const totalPoint = basePoint !== null ? basePoint + penaltyTotal : null
        const lastMotoResult = moto3Result ?? moto2Result ?? moto1Result ?? null
        const tiebreakLastBest =
          lastMotoResult?.result_status === 'FINISH' ? lastMotoResult.finish_order ?? null : null

        const status =
          penaltyTotalForDq >= 7
            ? 'DQ'
            : riderStatus === 'ABSENT'
            ? 'DNS'
            : moto1Result?.result_status === 'DNS' || moto2Result?.result_status === 'DNS'
            ? 'DNS'
            : moto3Result?.result_status === 'DNF' || moto2Result?.result_status === 'DNF' || moto1Result?.result_status === 'DNF'
            ? 'DNF'
            : moto1Result?.result_status === 'FINISH' &&
              moto2Result?.result_status === 'FINISH' &&
              (!moto3 || moto3Result?.result_status === 'FINISH')
            ? 'FINISHED'
            : 'DNS'
        return {
          rider_id: riderId,
          gate_moto1: gate1Map.get(riderId) ?? null,
          gate_moto2: gate2Map.get(riderId) ?? null,
          gate_moto3: gate3Map.get(riderId) ?? null,
          name: rider?.name ?? '-',
          no_plate: rider?.no_plate_display ?? '-',
          club: rider?.club ?? '-',
          point_moto1: point1,
          point_moto2: point2,
          point_moto3: point3,
          penalty_total: penaltyTotalDisplay,
          total_point: totalPoint,
          status,
          tiebreak_last_best: tiebreakLastBest,
        }
      })

      const rankedRows = [...rows].sort((a, b) => {
        const aPoint = a.total_point ?? Number.MAX_SAFE_INTEGER
        const bPoint = b.total_point ?? Number.MAX_SAFE_INTEGER
        if (aPoint !== bPoint) return aPoint - bPoint
        const aTie = a.tiebreak_last_best ?? Number.MAX_SAFE_INTEGER
        const bTie = b.tiebreak_last_best ?? Number.MAX_SAFE_INTEGER
        return aTie - bTie
      })
      const rankMap = new Map(
        rankedRows
          .filter((r) => r.total_point !== null)
          .map((r, idx) => ({ rider_id: r.rider_id, rank: idx + 1 }))
          .map((r) => [r.rider_id, r.rank])
      )

      const classForRank = (rank: number | null | undefined) => {
        if (!rank) return null
        if (rank >= 1 && rank <= 4) return 'QUARTER FINAL'
        if (rank === 5) return 'FINAL ACADEMY'
        if (rank === 6) return 'FINAL AMATEUR'
        if (rank === 7 || rank === 8) return 'FINAL BEGINNER'
        return null
      }

      const ordered = rows
        .map((r) => {
          const rank = rankMap.get(r.rider_id) ?? null
          return {
            ...r,
            rank_point: rank,
            class_label: classForRank(rank),
          }
        })
        .sort((a, b) => (a.gate_moto1 ?? 9999) - (b.gate_moto1 ?? 9999))

      return {
        batch_index: batchIndex,
        moto1_id: moto1.id,
        moto2_id: moto2.id,
        moto3_id: moto3?.id ?? null,
        rows: ordered,
      }
    })
    .sort((a, b) => a.batch_index - b.batch_index)

  const stageMotos = motoRows.filter((m) => !parseBatchKey(m.moto_name))
  const stageGroups: StageGroup[] = stageMotos.map((moto) => {
    const gates = gateRows.filter((g) => g.moto_id === moto.id)
    const gateMap = new Map(gates.map((g) => [g.rider_id, g.gate_position]))
    const riderIdsInMoto = Array.from(new Set(gates.map((g) => g.rider_id)))
    const lastPos = gates.length || null
    const pointForResult = (res: ResultRow | null) => {
      const status = res?.result_status ?? 'FINISH'
      if (status === 'DNS') return 9
      if (status === 'DNF') return lastPos
      return res?.finish_order ?? null
    }

    const rows: StageRow[] = riderIdsInMoto.map((riderId) => {
      const rider = riderMap.get(riderId)
      const res = resultRows.find((r) => r.moto_id === moto.id && r.rider_id === riderId) ?? null
      const status = (res?.result_status ?? 'PENDING') as StageRow['status']
      return {
        rider_id: riderId,
        gate: gateMap.get(riderId) ?? null,
        name: rider?.name ?? '-',
        no_plate: rider?.no_plate_display ?? '-',
        club: rider?.club ?? '-',
        point: pointForResult(res),
        status,
      }
    })

    return {
      title: moto.moto_name,
      moto_id: moto.id,
      rows: rows.sort((a, b) => (a.gate ?? 9999) - (b.gate ?? 9999)),
    }
  })

  return NextResponse.json({
    data: {
      category: category.label,
      batches,
      stages: stageGroups,
    },
  })
}
