import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../lib/auth'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { searchParams } = new URL(req.url)
  const categoryId = searchParams.get('categoryId')
  if (!categoryId) return NextResponse.json({ error: 'categoryId required' }, { status: 400 })

  const { data: motos, error: motoError } = await adminClient
    .from('motos')
    .select('id, moto_name, moto_order, status')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
    .order('moto_order', { ascending: true })

  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })
  if (!motos || motos.length === 0) return NextResponse.json({ data: [] })

  const motoIds = motos.map((m) => m.id)
  const { data: gates, error: gateError } = await adminClient
    .from('moto_gate_positions')
    .select('moto_id, rider_id, gate_position')
    .in('moto_id', motoIds)
    .order('gate_position', { ascending: true })

  if (gateError) return NextResponse.json({ error: gateError.message }, { status: 400 })

  let gateByMoto = new Map<
    string,
    Array<{ gate_position: number; rider_id: string; name: string; no_plate_display: string }>
  >()
  const motoNameById = new Map<string, string>()
  for (const m of motos) motoNameById.set(m.id, m.moto_name)

  if ((gates ?? []).length > 0) {
    const riderIds = Array.from(new Set((gates ?? []).map((g) => g.rider_id)))
    const { data: riders, error: riderError } = await adminClient
      .from('riders')
      .select('id, name, no_plate_display')
      .in('id', riderIds)

    if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })

    const riderMap = new Map<string, { name: string; no_plate_display: string }>()
    for (const r of riders ?? []) riderMap.set(r.id, r)

    for (const g of gates ?? []) {
      const rider = riderMap.get(g.rider_id)
      if (!rider) continue
      const list = gateByMoto.get(g.moto_id) ?? []
      list.push({
        gate_position: g.gate_position,
        rider_id: g.rider_id,
        name: rider.name,
        no_plate_display: rider.no_plate_display,
      })
      gateByMoto.set(g.moto_id, list)
    }
  } else {
    const { data: assignments, error: assignError } = await adminClient
      .from('moto_riders')
      .select('moto_id, rider_id, created_at')
      .in('moto_id', motoIds)
      .order('created_at', { ascending: true })

    if (assignError) return NextResponse.json({ error: assignError.message }, { status: 400 })

    const riderIds = Array.from(new Set((assignments ?? []).map((a) => a.rider_id)))
    const { data: riders, error: riderError } = await adminClient
      .from('riders')
      .select('id, name, no_plate_display')
      .in('id', riderIds)

    if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })

    const riderMap = new Map<string, { name: string; no_plate_display: string }>()
    for (const r of riders ?? []) riderMap.set(r.id, r)

    const temp = new Map<string, Array<{ rider_id: string; name: string; no_plate_display: string }>>()
    for (const a of assignments ?? []) {
      const rider = riderMap.get(a.rider_id)
      if (!rider) continue
      const list = temp.get(a.moto_id) ?? []
      list.push({ rider_id: a.rider_id, name: rider.name, no_plate_display: rider.no_plate_display })
      temp.set(a.moto_id, list)
    }

    for (const [motoId, list] of temp.entries()) {
      const motoName = motoNameById.get(motoId) ?? ''
      const shouldReverse = motoName.toLowerCase().includes('moto 2')
      const ordered = shouldReverse ? [...list].reverse() : list
      gateByMoto.set(
        motoId,
        ordered.map((r, idx) => ({
          gate_position: idx + 1,
          rider_id: r.rider_id,
          name: r.name,
          no_plate_display: r.no_plate_display,
        }))
      )
    }
  }

  const data = motos.map((m) => ({
    ...m,
    gates: gateByMoto.get(m.id) ?? [],
  }))

  return NextResponse.json({ data })
}
