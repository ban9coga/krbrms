import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../lib/auth'
import { compareMotoDisplayOrder } from '../../../../../lib/motoDisplayOrder'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { searchParams } = new URL(req.url)
  const categoryId = searchParams.get('categoryId')

  let motoQuery = adminClient
    .from('motos')
    .select('id, category_id, moto_name, moto_order, status')
    .eq('event_id', eventId)
    .order('moto_order', { ascending: true })
  if (categoryId) motoQuery = motoQuery.eq('category_id', categoryId)
  const { data: motos, error: motoError } = await motoQuery

  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })
  if (!motos || motos.length === 0) return NextResponse.json({ data: categoryId ? [] : {} })

  const motoIds = motos.map((m) => m.id)
  const { data: gates, error: gateError } = await adminClient
    .from('moto_gate_positions')
    .select('moto_id, rider_id, gate_position')
    .in('moto_id', motoIds)
    .order('moto_id', { ascending: true })
    .order('gate_position', { ascending: true })

  if (gateError) return NextResponse.json({ error: gateError.message }, { status: 400 })

  const gateByMoto = new Map<
    string,
    Array<{ gate_position: number; rider_id: string; name: string; no_plate_display: string; club: string | null }>
  >()
  const motoNameById = new Map<string, string>()
  for (const m of motos) motoNameById.set(m.id, m.moto_name)

  const { data: assignments, error: assignError } = await adminClient
    .from('moto_riders')
    .select('moto_id, rider_id, created_at')
    .in('moto_id', motoIds)
    .order('created_at', { ascending: true })

  if (assignError) return NextResponse.json({ error: assignError.message }, { status: 400 })

  const riderIds = Array.from(
    new Set([...(gates ?? []).map((gate) => gate.rider_id), ...(assignments ?? []).map((assignment) => assignment.rider_id)])
  )
  const { data: riders, error: riderError } = riderIds.length > 0
    ? await adminClient.from('riders').select('id, name, no_plate_display, club').in('id', riderIds)
    : { data: [], error: null }

  if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })

  const riderMap = new Map<string, { name: string; no_plate_display: string; club: string | null }>()
  for (const rider of riders ?? []) riderMap.set(rider.id, rider)

  for (const gate of gates ?? []) {
    const rider = riderMap.get(gate.rider_id)
    if (!rider) continue
    const list = gateByMoto.get(gate.moto_id) ?? []
    list.push({
      gate_position: gate.gate_position,
      rider_id: gate.rider_id,
      name: rider.name,
      no_plate_display: rider.no_plate_display,
      club: rider.club ?? null,
    })
    gateByMoto.set(gate.moto_id, list)
  }

  for (const [motoId, list] of gateByMoto.entries()) {
    gateByMoto.set(
      motoId,
      [...list].sort((a, b) => {
        if (a.gate_position !== b.gate_position) return a.gate_position - b.gate_position
        return a.no_plate_display.localeCompare(b.no_plate_display, undefined, { numeric: true })
      })
    )
  }

  const temp = new Map<string, Array<{ rider_id: string; name: string; no_plate_display: string; club: string | null }>>()
  for (const assignment of assignments ?? []) {
    if (gateByMoto.has(assignment.moto_id)) continue
    const rider = riderMap.get(assignment.rider_id)
    if (!rider) continue
    const list = temp.get(assignment.moto_id) ?? []
    list.push({
      rider_id: assignment.rider_id,
      name: rider.name,
      no_plate_display: rider.no_plate_display,
      club: rider.club ?? null,
    })
    temp.set(assignment.moto_id, list)
  }

  for (const [motoId, list] of temp.entries()) {
    const ordered = [...list]
    gateByMoto.set(
      motoId,
      ordered.map((r, idx) => ({
        gate_position: idx + 1,
        rider_id: r.rider_id,
        name: r.name,
        no_plate_display: r.no_plate_display,
        club: r.club ?? null,
      }))
    )
  }

  const sortedMotos = [...motos].sort(compareMotoDisplayOrder)
  const data = sortedMotos.map((m) => ({
    ...m,
    gates: gateByMoto.get(m.id) ?? [],
  }))

  if (!categoryId) {
    const byCategory = data.reduce<Record<string, typeof data>>((acc, moto) => {
      const key = moto.category_id
      if (!acc[key]) acc[key] = []
      acc[key].push(moto)
      return acc
    }, {})
    return NextResponse.json({ data: byCategory })
  }

  return NextResponse.json({ data })
}
