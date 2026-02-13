import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { motoId } = await params
  const body = await req.json()
  const { rider_ids } = body ?? {}
  if (!Array.isArray(rider_ids) || rider_ids.length === 0) {
    return NextResponse.json({ error: 'rider_ids required' }, { status: 400 })
  }

  const uniqueIds = Array.from(new Set(rider_ids)).filter(Boolean)

  const { data: moto, error: motoError } = await adminClient
    .from('motos')
    .select('id, event_id')
    .eq('id', motoId)
    .single()

  if (motoError || !moto?.event_id) {
    return NextResponse.json({ error: 'Moto not found' }, { status: 404 })
  }

  const { data: riderRows, error: riderError } = await adminClient
    .from('riders')
    .select('id, event_id')
    .in('id', uniqueIds)

  if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })

  const missing = uniqueIds.filter((id: string) => !(riderRows ?? []).some((r) => r.id === id))
  if (missing.length > 0) {
    return NextResponse.json({ error: 'Some riders not found' }, { status: 400 })
  }

  const crossEvent = (riderRows ?? []).find((r) => r.event_id !== moto.event_id)
  if (crossEvent) {
    return NextResponse.json({ error: 'Cross-event assignment is not allowed' }, { status: 400 })
  }

  const payload = uniqueIds.map((riderId: string) => ({
    moto_id: motoId,
    rider_id: riderId,
  }))
  const { error } = await adminClient
    .from('moto_riders')
    .upsert(payload, { onConflict: 'moto_id,rider_id', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
