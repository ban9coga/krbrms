import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { assertMotoEditable, assertMotoNotUnderProtest } from '../../../../../../lib/motoLock'
import { isMotoLive, isMotoReady, isMotoUpcoming } from '../../../../../../lib/motoStatus'
import { requireJury } from '../../../../../../services/juryAuth'
import { upsertRiderParticipationStatuses } from '../../../../../../services/riderParticipationStatus'

const getApprovalMode = async (eventId: string) => {
  const { data } = await adminClient
    .from('event_approval_modes')
    .select('approval_mode')
    .eq('event_id', eventId)
    .maybeSingle()
  return (data?.approval_mode as 'AUTO' | 'DIRECTOR') ?? 'AUTO'
}

const isLockedMoto = async (motoId?: string | null) => {
  if (!motoId) return false
  const { data } = await adminClient
    .from('moto_locks')
    .select('moto_id, is_locked')
    .eq('moto_id', motoId)
    .eq('is_locked', true)
    .maybeSingle()
  return !!data
}

const canCheckerSetStatus = (motoStatus?: string | null, participationStatus?: string | null) => {
  if (!participationStatus) return false
  if (isMotoLive(motoStatus)) {
    return ['ACTIVE', 'DNS', 'ABSENT'].includes(participationStatus)
  }
  if (isMotoUpcoming(motoStatus) || isMotoReady(motoStatus)) {
    return ['ACTIVE', 'ABSENT'].includes(participationStatus)
  }
  return false
}

const canCheckerUndoStatus = (motoStatus?: string | null) => {
  return isMotoLive(motoStatus) || isMotoUpcoming(motoStatus) || isMotoReady(motoStatus)
}

type RiderStatusChangeInput = {
  rider_id?: string
  participation_status?: string
  registration_order?: number
  moto_id?: string
}

type RiderStatusChange = {
  rider_id: string
  participation_status: 'ACTIVE' | 'DNS' | 'ABSENT'
  registration_order: number
  moto_id: string
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireJury(req, ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'ADMIN', 'super_admin'], eventId)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { searchParams } = new URL(req.url)
  const motoId = searchParams.get('moto_id')

  let approvedQuery = adminClient
    .from('rider_participation_status')
    .select('rider_id, participation_status, moto_id')
    .eq('event_id', eventId)
  if (motoId) approvedQuery = approvedQuery.eq('moto_id', motoId)
  const { data: approvedRows, error: approvedError } = await approvedQuery

  if (approvedError) return NextResponse.json({ error: approvedError.message }, { status: 400 })

  let updatesQuery = adminClient
    .from('rider_status_updates')
    .select('rider_id, proposed_status, approval_status, created_at, moto_id')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
  if (motoId) updatesQuery = updatesQuery.eq('moto_id', motoId)
  const { data: updates, error: updatesError } = await updatesQuery

  if (updatesError) return NextResponse.json({ error: updatesError.message }, { status: 400 })

  const approvedMap = new Map<string, string>()
  for (const row of approvedRows ?? []) {
    approvedMap.set(row.rider_id, row.participation_status)
  }

  if (motoId) {
    const { data: resultRows, error: resultError } = await adminClient
      .from('results')
      .select('rider_id, result_status')
      .eq('moto_id', motoId)
    if (resultError) return NextResponse.json({ error: resultError.message }, { status: 400 })
    for (const row of resultRows ?? []) {
      if (row.result_status === 'FINISH' || row.result_status === 'DNF') {
        approvedMap.set(row.rider_id, 'ACTIVE')
      }
      if (row.result_status === 'DNS') {
        approvedMap.set(row.rider_id, 'DNS')
      }
    }
  }

  const latestUpdate = new Map<string, { proposed_status: string; approval_status: string }>()
  for (const row of updates ?? []) {
    if (!latestUpdate.has(row.rider_id)) {
      latestUpdate.set(row.rider_id, {
        proposed_status: row.proposed_status,
        approval_status: row.approval_status,
      })
    }
  }

  const riderIds = new Set<string>([
    ...Array.from(approvedMap.keys()),
    ...Array.from(latestUpdate.keys()),
  ])

  const data = Array.from(riderIds).map((rider_id) => {
    const update = latestUpdate.get(rider_id)
    const approved = approvedMap.get(rider_id)
    return {
      rider_id,
      approval_status: update?.approval_status ?? (approved ? 'APPROVED' : 'NONE'),
      proposed_status: update?.proposed_status ?? approved ?? null,
      participation_status: approved ?? null,
    }
  })

  return NextResponse.json({ data })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireJury(req, ['CHECKER', 'RACE_DIRECTOR', 'ADMIN', 'super_admin'], eventId)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const body = await req.json()
  const rows: RiderStatusChangeInput[] = Array.isArray(body?.changes)
    ? (body.changes as RiderStatusChangeInput[])
    : body?.rider_id
      ? [(body as RiderStatusChangeInput)]
      : []
  if (!rows.length) {
    return NextResponse.json({ error: 'rider_id, participation_status, and moto_id required' }, { status: 400 })
  }

  const normalizedRows = rows.map((row: {
    rider_id?: string
    participation_status?: string
    registration_order?: number
    moto_id?: string
  }) => ({
    rider_id: row.rider_id,
    participation_status: row.participation_status,
    registration_order: row.registration_order ?? 0,
    moto_id: row.moto_id,
  }))

  if (normalizedRows.some((row) => !row.rider_id || !row.participation_status || !row.moto_id)) {
    return NextResponse.json({ error: 'rider_id, participation_status, and moto_id required' }, { status: 400 })
  }
  if (normalizedRows.some((row) => !['ACTIVE', 'DNS', 'ABSENT'].includes(String(row.participation_status ?? '')))) {
    return NextResponse.json({ error: 'Invalid status for jury start' }, { status: 400 })
  }

  const typedRows = normalizedRows.map((row) => ({
    rider_id: row.rider_id as string,
    participation_status: row.participation_status as RiderStatusChange['participation_status'],
    registration_order: row.registration_order as number,
    moto_id: row.moto_id as string,
  })) satisfies RiderStatusChange[]

  const motoId = typedRows[0]!.moto_id

  if (auth.role === 'RACE_DIRECTOR') {
    return NextResponse.json({ error: 'Read-only for RACE_DIRECTOR' }, { status: 403 })
  }

  if (await isLockedMoto(motoId)) {
    try {
      assertMotoEditable('locked')
    } catch (err: unknown) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Moto locked.' }, { status: 409 })
    }
  }
  const { data: moto, error: motoError } = await adminClient
    .from('motos')
    .select('id, event_id, category_id, moto_name, status')
    .eq('id', motoId)
    .maybeSingle()
  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })
  if (!moto || moto.event_id !== eventId) {
    return NextResponse.json({ error: 'Moto not found in event.' }, { status: 404 })
  }
  try {
    assertMotoNotUnderProtest((moto as { status?: string | null })?.status ?? null)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Moto under protest review.' }, { status: 409 })
  }
  if (normalizedRows.some((row) => !canCheckerSetStatus(moto.status, row.participation_status))) {
    if (isMotoUpcoming(moto.status) && typedRows.some((row) => row.participation_status === 'DNS')) {
      return NextResponse.json({ error: 'DNS baru bisa dipakai saat moto sudah LIVE.' }, { status: 409 })
    }
    return NextResponse.json(
      { error: 'Checker hanya bisa set READY/ABSENT saat UPCOMING/READY, dan READY/ABSENT/DNS saat LIVE.' },
      { status: 409 }
    )
  }

  const approvalMode = await getApprovalMode(eventId)
  const shouldAutoApply = (participation_status: string) =>
    approvalMode === 'AUTO' || participation_status === 'ACTIVE' || participation_status === 'DNS' || participation_status === 'ABSENT'
  const insertRows = typedRows.map((row) => ({
    event_id: eventId,
    moto_id: row.moto_id,
    rider_id: row.rider_id,
    proposed_status: row.participation_status,
    created_by: auth.user.id,
    approval_status: shouldAutoApply(row.participation_status) ? 'APPROVED' : 'PENDING',
    approved_by: shouldAutoApply(row.participation_status) ? 'SYSTEM' : null,
    approved_at: shouldAutoApply(row.participation_status) ? new Date().toISOString() : null,
  }))

  const { data, error } = await adminClient
    .from('rider_status_updates')
    .insert(insertRows)
    .select('id, event_id, rider_id, proposed_status, approval_status')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const autoApplyRows = typedRows
    .filter((row) => shouldAutoApply(row.participation_status))
    .map((row) => ({
      event_id: eventId,
      moto_id: row.moto_id,
      rider_id: row.rider_id,
      participation_status: row.participation_status,
      registration_order: row.registration_order,
    }))

  if (autoApplyRows.length > 0) {
    const { error: participationError } = await upsertRiderParticipationStatuses(autoApplyRows)
    if (participationError) {
      return NextResponse.json({ error: participationError.message }, { status: 400 })
    }

    const dnsRows = autoApplyRows.filter((row) => row.participation_status === 'DNS' || row.participation_status === 'ABSENT')
    if (dnsRows.length > 0) {
      const { error: dnsResultError } = await adminClient.from('results').upsert(
        dnsRows.map((row) => ({
          event_id: eventId,
          moto_id: row.moto_id,
          rider_id: row.rider_id,
          finish_order: null,
          result_status: 'DNS',
        })),
        { onConflict: 'moto_id,rider_id' }
      )
      if (dnsResultError) return NextResponse.json({ error: dnsResultError.message }, { status: 400 })
    }
  }

    await adminClient.from('audit_log').insert(
    typedRows.map((row) => ({
      action_type: 'STATUS_APPROVAL',
      performed_by: shouldAutoApply(row.participation_status) ? 'SYSTEM' : auth.user.id,
      rider_id: row.rider_id,
      moto_id: row.moto_id,
      event_id: eventId,
      reason: shouldAutoApply(row.participation_status)
        ? row.participation_status === 'ACTIVE'
          ? 'ACTIVE status auto-applied'
          : row.participation_status === 'ABSENT'
            ? 'ABSENT status applied with DNS scoring'
            : 'AUTO mode: status applied'
        : 'Status update submitted',
    }))
  )

  return NextResponse.json({ data })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireJury(req, ['CHECKER', 'RACE_DIRECTOR', 'ADMIN', 'super_admin'], eventId)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (auth.role === 'RACE_DIRECTOR') {
    return NextResponse.json({ error: 'Read-only for RACE_DIRECTOR' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const riderId = searchParams.get('rider_id')
  const motoId = searchParams.get('moto_id')

  if (!riderId || !motoId) {
    return NextResponse.json({ error: 'rider_id and moto_id required' }, { status: 400 })
  }

  if (await isLockedMoto(motoId)) {
    try {
      assertMotoEditable('locked')
    } catch (err: unknown) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Moto locked.' }, { status: 409 })
    }
  }

  const { data: moto, error: motoError } = await adminClient
    .from('motos')
    .select('id, event_id, status')
    .eq('id', motoId)
    .maybeSingle()
  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })
  if (!moto || moto.event_id !== eventId) {
    return NextResponse.json({ error: 'Moto not found in event.' }, { status: 404 })
  }
  try {
    assertMotoNotUnderProtest((moto as { status?: string | null })?.status ?? null)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Moto under protest review.' }, { status: 409 })
  }
  if (!canCheckerUndoStatus(moto.status)) {
    return NextResponse.json({ error: 'Checker hanya bisa undo status saat moto masih UPCOMING, READY, atau LIVE.' }, { status: 409 })
  }

  const { error: updateDeleteError } = await adminClient
    .from('rider_status_updates')
    .delete()
    .eq('event_id', eventId)
    .eq('moto_id', motoId)
    .eq('rider_id', riderId)

  if (updateDeleteError) return NextResponse.json({ error: updateDeleteError.message }, { status: 400 })

  const { error: participationDeleteError } = await adminClient
    .from('rider_participation_status')
    .delete()
    .eq('event_id', eventId)
    .eq('moto_id', motoId)
    .eq('rider_id', riderId)

  if (participationDeleteError) return NextResponse.json({ error: participationDeleteError.message }, { status: 400 })

  const { error: resultDeleteError } = await adminClient
    .from('results')
    .delete()
    .eq('event_id', eventId)
    .eq('moto_id', motoId)
    .eq('rider_id', riderId)
    .eq('result_status', 'DNS')

  if (resultDeleteError) return NextResponse.json({ error: resultDeleteError.message }, { status: 400 })

  await adminClient.from('audit_log').insert([
    {
      action_type: 'STATUS_APPROVAL',
      performed_by: auth.user.id,
      rider_id: riderId,
      moto_id: motoId,
      event_id: eventId,
      reason: 'Undo checker status',
    },
  ])

  return NextResponse.json({ ok: true })
}
