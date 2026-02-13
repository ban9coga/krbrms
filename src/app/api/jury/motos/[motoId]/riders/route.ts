import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

type RiderRow = {
  id: string
  name: string
  no_plate_display: string
}

export async function GET(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const auth = await requireJury(req, ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { motoId } = await params

  const { data: gates, error: gateError } = await adminClient
    .from('moto_gate_positions')
    .select('rider_id, gate_position')
    .eq('moto_id', motoId)
    .order('gate_position', { ascending: true })

  if (gateError) return NextResponse.json({ error: gateError.message }, { status: 400 })

  if (gates && gates.length > 0) {
    const riderIds = Array.from(new Set(gates.map((g) => g.rider_id)))
    const { data: riders, error: riderError } = await adminClient
      .from('riders')
      .select('id, name, no_plate_display')
      .in('id', riderIds)

    if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })

    const riderMap = new Map<string, RiderRow>()
    for (const r of riders ?? []) riderMap.set(r.id, r)

    const data = gates
      .map((g) => {
        const rider = riderMap.get(g.rider_id)
        if (!rider) return null
        return { ...rider, gate_position: g.gate_position }
      })
      .filter(Boolean)

    return NextResponse.json({ data })
  }

  const { data: assignments, error: assignError } = await adminClient
    .from('moto_riders')
    .select('rider_id, created_at')
    .eq('moto_id', motoId)
    .order('created_at', { ascending: true })

  if (assignError) return NextResponse.json({ error: assignError.message }, { status: 400 })

  const riderIds = Array.from(new Set((assignments ?? []).map((a) => a.rider_id)))
  const { data: riders, error: riderError } = await adminClient
    .from('riders')
    .select('id, name, no_plate_display')
    .in('id', riderIds)

  if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })

  const riderMap = new Map<string, RiderRow>()
  for (const r of riders ?? []) riderMap.set(r.id, r)

  const data = (assignments ?? [])
    .map((a, idx) => {
      const rider = riderMap.get(a.rider_id)
      if (!rider) return null
      return { ...rider, gate_position: idx + 1 }
    })
    .filter(Boolean)

  return NextResponse.json({ data })
}
