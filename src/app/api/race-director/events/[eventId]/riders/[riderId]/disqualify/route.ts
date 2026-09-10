import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../../../lib/auth'
import { requireJury } from '../../../../../../../../services/juryAuth'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ eventId: string; riderId: string }> }
) {
  const auth = await requireJury(req, ['RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { eventId, riderId } = await params
  const body = await req.json()
  const { reason, categoryId } = body ?? {}

  const normalizedReason = String(reason ?? '').trim()
  if (!normalizedReason) {
    return NextResponse.json({ error: 'Alasan DQ wajib diisi.' }, { status: 400 })
  }

  // Verify event exists
  const { data: event } = await adminClient
    .from('events')
    .select('id')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) return NextResponse.json({ error: 'Event tidak ditemukan.' }, { status: 404 })

  // Verify rider exists
  const { data: rider } = await adminClient
    .from('riders')
    .select('id, name, no_plate_display')
    .eq('id', riderId)
    .maybeSingle()
  if (!rider) return NextResponse.json({ error: 'Rider tidak ditemukan.' }, { status: 404 })

  // Find all motos the rider is assigned to in this event
  let motoQuery = adminClient
    .from('moto_riders')
    .select('moto_id, motos!inner(id, event_id, category_id, moto_name)')
    .eq('rider_id', riderId)
    .eq('motos.event_id', eventId)

  if (categoryId) {
    motoQuery = motoQuery.eq('motos.category_id', categoryId)
  }

  const { data: motoRiderRows, error: motoRiderError } = await motoQuery
  if (motoRiderError) {
    return NextResponse.json({ error: motoRiderError.message }, { status: 400 })
  }

  if (!motoRiderRows || motoRiderRows.length === 0) {
    const scope = categoryId ? 'kategori ini' : 'event ini'
    return NextResponse.json(
      { error: `Rider tidak terdaftar di moto manapun pada ${scope}.` },
      { status: 404 }
    )
  }

  type MotoRow = { id: string; event_id: string; category_id: string; moto_name: string }
  const motos: MotoRow[] = motoRiderRows
    .map((row) => {
      const moto = Array.isArray(row.motos) ? row.motos[0] : row.motos
      return moto as MotoRow | null
    })
    .filter((m): m is MotoRow => m !== null)

  const affectedCategoryIds = [...new Set(motos.map((m) => m.category_id))]

  // Upsert DQ result for every moto
  const payload = motos.map((moto) => ({
    event_id: eventId,
    moto_id: moto.id,
    rider_id: riderId,
    finish_order: null,
    result_status: 'DQ',
    dq_reason: normalizedReason,
    is_auto_dq: false,
  }))

  const { error: upsertError } = await adminClient
    .from('results')
    .upsert(payload, { onConflict: 'moto_id,rider_id' })
  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 400 })
  }

  // Write audit log
  await adminClient.from('audit_log').insert([
    {
      action_type: 'EVENT_WIDE_DQ',
      performed_by: auth.user.id,
      event_id: eventId,
      reason: normalizedReason,
      moto_id: null,
      metadata: {
        rider_id: riderId,
        rider_name: rider.name,
        rider_plate: rider.no_plate_display,
        scope: categoryId ? 'CATEGORY' : 'ALL',
        category_id: categoryId ?? null,
        categories_affected: affectedCategoryIds,
        motos_affected: motos.map((m) => ({ id: m.id, name: m.moto_name })),
      },
    },
  ])

  return NextResponse.json({
    ok: true,
    motosAffected: motos.length,
    categoriesAffected: affectedCategoryIds,
  })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ eventId: string; riderId: string }> }
) {
  const auth = await requireJury(req, ['RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { eventId, riderId } = await params
  const { searchParams } = new URL(req.url)
  const categoryId = searchParams.get('categoryId') || null

  let dqResultsQuery = adminClient
    .from('results')
    .select('moto_id, motos!inner(id, event_id, category_id, moto_name)')
    .eq('event_id', eventId)
    .eq('rider_id', riderId)
    .eq('result_status', 'DQ')
    .eq('is_auto_dq', false)
    .eq('motos.event_id', eventId)

  if (categoryId) dqResultsQuery = dqResultsQuery.eq('motos.category_id', categoryId)

  const { data: dqResults, error: dqResultsError } = await dqResultsQuery
  if (dqResultsError) return NextResponse.json({ error: dqResultsError.message }, { status: 400 })

  const motoIds = (dqResults ?? []).map((row) => row.moto_id)
  if (motoIds.length === 0) {
    return NextResponse.json({ error: 'Tidak ada DQ manual untuk dibatalkan pada scope ini.' }, { status: 404 })
  }

  const { error: deleteError } = await adminClient
    .from('results')
    .delete()
    .eq('event_id', eventId)
    .eq('rider_id', riderId)
    .in('moto_id', motoIds)
    .eq('result_status', 'DQ')
    .eq('is_auto_dq', false)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 })

  await adminClient.from('audit_log').insert({
    action_type: 'EVENT_WIDE_DQ_CANCELLED',
    performed_by: auth.user.id,
    event_id: eventId,
    rider_id: riderId,
    reason: 'Manual DQ cancelled by Race Director',
    metadata: {
      scope: categoryId ? 'CATEGORY' : 'ALL',
      category_id: categoryId,
      motos_affected: motoIds,
    },
  })

  return NextResponse.json({ ok: true, motosAffected: motoIds.length })
}
