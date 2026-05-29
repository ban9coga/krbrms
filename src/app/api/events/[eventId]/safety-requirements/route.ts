import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await adminClient
    .from('event_safety_requirements')
    .select('id, event_id, label, is_required, sort_order, penalty_code, icon_key')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const label = String(body?.label ?? '').trim()
  const sortOrderRaw = Number(body?.sort_order ?? 0)
  const isRequired = body?.is_required !== false
  const penaltyCode =
    typeof body?.penalty_code === 'string' && body.penalty_code.trim().length > 0
      ? body.penalty_code.trim()
      : null
  const iconKey =
    typeof body?.icon_key === 'string' && body.icon_key.trim().length > 0
      ? body.icon_key.trim()
      : null

  if (!label) return NextResponse.json({ error: 'label required' }, { status: 400 })
  if (!Number.isFinite(sortOrderRaw)) {
    return NextResponse.json({ error: 'sort_order must be a number' }, { status: 400 })
  }
  const sortOrder = Math.trunc(sortOrderRaw)

  const { data, error } = await adminClient
    .from('event_safety_requirements')
    .insert([
      {
        event_id: eventId,
        label,
        is_required: isRequired,
        sort_order: sortOrder,
        penalty_code: penaltyCode,
        icon_key: iconKey,
      },
    ])
    .select('id, event_id, label, is_required, sort_order, penalty_code, icon_key')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { id, label, is_required, sort_order, penalty_code, icon_key } = body ?? {}

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const payload: Record<string, unknown> = {
    penalty_code: penalty_code || null,
    icon_key: icon_key || null,
  }

  if (typeof label === 'string') {
    const trimmedLabel = label.trim()
    if (!trimmedLabel) return NextResponse.json({ error: 'label required' }, { status: 400 })
    payload.label = trimmedLabel
  }
  if (typeof is_required === 'boolean') {
    payload.is_required = is_required
  }
  if (sort_order !== undefined) {
    const parsedSortOrder = Number(sort_order)
    if (!Number.isFinite(parsedSortOrder)) {
      return NextResponse.json({ error: 'sort_order must be a number' }, { status: 400 })
    }
    payload.sort_order = Math.trunc(parsedSortOrder)
  }

  const { data, error } = await adminClient
    .from('event_safety_requirements')
    .update(payload)
    .eq('id', id)
    .eq('event_id', eventId)
    .select('id, event_id, label, is_required, sort_order, penalty_code, icon_key')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const id = typeof body?.id === 'string' ? body.id : ''

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { error } = await adminClient
    .from('event_safety_requirements')
    .delete()
    .eq('id', id)
    .eq('event_id', eventId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
