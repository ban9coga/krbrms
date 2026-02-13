import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

type MotoRow = {
  id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'LIVE' | 'FINISHED'
  category_id: string
}

type RiderRow = {
  id: string
  name: string
  no_plate_display: string
  club: string | null
}

type GateRow = {
  moto_id: string
  rider_id: string
  gate_position: number
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireJury(req, ['race_control', 'RACE_DIRECTOR'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { eventId } = await params
  const { data: motos, error: motoError } = await adminClient
    .from('motos')
    .select('id, moto_name, moto_order, status, category_id')
    .eq('event_id', eventId)
    .order('moto_order', { ascending: true })

  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })
  const motoRows = (motos ?? []) as MotoRow[]
  if (motoRows.length === 0) return NextResponse.json({ data: { motos: [] } })

  const categoryIds = Array.from(new Set(motoRows.map((m) => m.category_id)))
  const { data: categories } = await adminClient
    .from('categories')
    .select('id, label, year, gender')
    .in('id', categoryIds)
  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c.label as string]))
  const categoryYear = new Map((categories ?? []).map((c) => [c.id, c.year as number]))
  const categoryGender = new Map((categories ?? []).map((c) => [c.id, c.gender as string]))

  const motoIds = motoRows.map((m) => m.id)
  const { data: gates } = await adminClient
    .from('moto_gate_positions')
    .select('moto_id, rider_id, gate_position')
    .in('moto_id', motoIds)
  const gateRows = (gates ?? []) as GateRow[]

  const { data: motoRiders } = await adminClient
    .from('moto_riders')
    .select('moto_id, rider_id')
    .in('moto_id', motoIds)

  const riderIds = Array.from(
    new Set([...(gateRows ?? []).map((g) => g.rider_id), ...(motoRiders ?? []).map((r) => r.rider_id)])
  )
  const { data: riders } = await adminClient
    .from('riders')
    .select('id, name, no_plate_display, club')
    .in('id', riderIds)
  const riderMap = new Map((riders ?? []).map((r) => [r.id, r as RiderRow]))

  const gateMap = new Map<string, number>()
  for (const row of gateRows) {
    gateMap.set(`${row.moto_id}:${row.rider_id}`, row.gate_position)
  }

  const ridersByMoto = new Map<string, string[]>()
  for (const row of motoRiders ?? []) {
    const list = ridersByMoto.get(row.moto_id) ?? []
    list.push(row.rider_id)
    ridersByMoto.set(row.moto_id, list)
  }

  const sortedMotos = [...motoRows].sort((a, b) => {
    const ay = categoryYear.get(a.category_id) ?? 0
    const by = categoryYear.get(b.category_id) ?? 0
    if (by !== ay) return by - ay
    const genderOrder: Record<string, number> = { BOY: 0, GIRL: 1, MIX: 2 }
    const ag = genderOrder[categoryGender.get(a.category_id) ?? 'MIX'] ?? 9
    const bg = genderOrder[categoryGender.get(b.category_id) ?? 'MIX'] ?? 9
    if (ag !== bg) return ag - bg
    return a.moto_order - b.moto_order
  })

  const data = sortedMotos.map((moto) => {
    const riderIdsForMoto = ridersByMoto.get(moto.id) ?? []
    const rows = riderIdsForMoto
      .map((riderId) => {
        const rider = riderMap.get(riderId)
        return {
          rider_id: riderId,
          gate: gateMap.get(`${moto.id}:${riderId}`) ?? null,
          name: rider?.name ?? '-',
          no_plate: rider?.no_plate_display ?? '-',
          club: rider?.club ?? '-',
        }
      })
      .sort((a, b) => (a.gate ?? 9999) - (b.gate ?? 9999))

    return {
      moto_id: moto.id,
      moto_name: moto.moto_name,
      moto_order: moto.moto_order,
      status: moto.status,
      category_label: categoryMap.get(moto.category_id) ?? 'Category',
      rows,
    }
  })

  return NextResponse.json({ data: { motos: data } })
}
