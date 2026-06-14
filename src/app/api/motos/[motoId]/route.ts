import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../lib/auth'

const getAllowedNextStatuses = (current?: string | null) => {
  const normalized = (current ?? '').toUpperCase()
  switch (normalized) {
    case 'UPCOMING':
      return ['READY', 'LIVE']
    case 'READY':
      return ['UPCOMING', 'LIVE']
    case 'LIVE':
      return ['UPCOMING', 'PROVISIONAL']
    case 'PROVISIONAL':
      return ['UPCOMING', 'PROTEST_REVIEW']
    case 'PROTEST_REVIEW':
      return []
    case 'LOCKED':
      return []
    case 'FINISHED':
      return []
    default:
      return []
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { motoId } = await params
  const body = await req.json()
  const { moto_name, moto_order, status } = body ?? {}
  const { data: existingMoto, error: existingError } = await adminClient
    .from('motos')
    .select('*')
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

    const currentStatus = String(existingMoto.status ?? '').toUpperCase()
    if (nextStatus !== currentStatus) {
      const allowed = getAllowedNextStatuses(currentStatus)
      if (!allowed.includes(nextStatus)) {
        return NextResponse.json(
          { error: `Invalid status transition: ${currentStatus || 'UNKNOWN'} -> ${nextStatus}` },
          { status: 400 }
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
    if (nextStatus === 'LIVE' || nextStatus === 'READY' || nextStatus === 'UPCOMING') payload.provisional_at = null
  }

  const { data, error } = await adminClient
    .from('motos')
    .update(payload)
    .eq('id', motoId)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
