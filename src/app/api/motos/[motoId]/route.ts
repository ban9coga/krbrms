import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../lib/auth'

const MOTO_RETURN_SELECT =
  'id, event_id, category_id, moto_name, moto_order, status, is_published, published_at, provisional_at, checker_prep_ready_at'

const MANUAL_MOTO_STATUSES = ['UPCOMING', 'READY', 'LIVE', 'PROVISIONAL'] as const

export async function PATCH(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { motoId } = await params
  const body = await req.json()
  const { moto_name, moto_order, status } = body ?? {}
  const { data: existingMoto, error: existingError } = await adminClient
    .from('motos')
    .select(MOTO_RETURN_SELECT)
    .eq('id', motoId)
    .single()
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 })

  if (status !== undefined) {
    const nextStatus = String(status).toUpperCase()
    if (nextStatus === 'LOCKED') {
      return NextResponse.json({ error: 'Gunakan workflow lock resmi untuk mengunci moto.' }, { status: 400 })
    }
    if (nextStatus === 'FINISHED') {
      return NextResponse.json({ error: 'Status FINISHED dipensiunkan dari workflow moto.' }, { status: 400 })
    }

    if (!(MANUAL_MOTO_STATUSES as readonly string[]).includes(nextStatus)) {
      return NextResponse.json({ error: `Invalid manual moto status: ${nextStatus}` }, { status: 400 })
    }
    const currentStatus = String(existingMoto.status ?? '').toUpperCase()
    if (['LOCKED', 'PROTEST_REVIEW', 'FINISHED'].includes(currentStatus) && nextStatus !== currentStatus) {
      return NextResponse.json({ error: `Moto ${currentStatus} tidak dapat diubah dari override manual.` }, { status: 400 })
    }
    if (nextStatus === 'LIVE') {
      const { data: otherLiveMotos, error: otherLiveError } = await adminClient
        .from('motos')
        .select('id, moto_name')
        .eq('event_id', existingMoto.event_id)
        .eq('status', 'LIVE')
        .neq('id', motoId)
        .limit(1)
      if (otherLiveError) return NextResponse.json({ error: otherLiveError.message }, { status: 400 })
      if (otherLiveMotos?.length) {
        return NextResponse.json(
          { error: `Tidak dapat membuat moto LIVE. ${otherLiveMotos[0].moto_name} masih LIVE.` },
          { status: 409 }
        )
      }
    }
  }

  const payload: Record<string, unknown> = {}
  if (moto_name !== undefined) payload.moto_name = moto_name
  if (moto_order !== undefined) payload.moto_order = moto_order
  if (status !== undefined) {
    payload.status = status
    const nextStatus = String(status).toUpperCase()
    if (nextStatus === 'PROVISIONAL') payload.provisional_at = new Date().toISOString()
    if (nextStatus === 'READY') payload.checker_prep_ready_at = new Date().toISOString()
    if (nextStatus === 'UPCOMING') payload.checker_prep_ready_at = null
    if (nextStatus === 'LIVE' || nextStatus === 'READY' || nextStatus === 'UPCOMING') payload.provisional_at = null
  }

  const { data, error } = await adminClient
    .from('motos')
    .update(payload)
    .eq('id', motoId)
    .select(MOTO_RETURN_SELECT)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
