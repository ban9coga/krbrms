import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

type AssignedRider = { id: string; name: string; no_plate_display: string }
type AssignedRiderRow = { rider_id: string; riders: AssignedRider | AssignedRider[] | null }

export async function GET(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const { data: moto, error: motoError } = await adminClient
    .from('motos')
    .select('id, event_id, category_id, moto_name, status')
    .eq('id', motoId)
    .maybeSingle()

  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })
  if (!moto?.event_id) return NextResponse.json({ error: 'Moto not found.' }, { status: 404 })

  const auth = await requireJury(req, ['RACE_DIRECTOR', 'SUPER_ADMIN'], moto.event_id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: assignedRows, error: assignedError } = await adminClient
    .from('moto_riders')
    .select('rider_id, riders!inner(id, name, no_plate_display)')
    .eq('moto_id', motoId)

  if (assignedError) return NextResponse.json({ error: assignedError.message }, { status: 400 })

  const riders = ((assignedRows ?? []) as unknown as AssignedRiderRow[])
    .map((row) => Array.isArray(row.riders) ? row.riders[0] : row.riders)
    .filter((rider): rider is AssignedRider => Boolean(rider))
    .sort((a, b) => a.no_plate_display.localeCompare(b.no_plate_display, undefined, { numeric: true }) || a.name.localeCompare(b.name))

  return NextResponse.json({
    moto: {
      id: moto.id,
      event_id: moto.event_id,
      category_id: moto.category_id,
      moto_name: moto.moto_name,
      status: moto.status,
    },
    data: riders,
  })
}
