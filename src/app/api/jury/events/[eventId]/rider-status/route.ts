import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { assertMotoEditable, assertMotoNotUnderProtest } from '../../../../../../lib/motoLock'
import { isMotoLive } from '../../../../../../lib/motoStatus'
import { requireJury } from '../../../../../../services/juryAuth'

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
  const { rider_id, participation_status, registration_order = 0, moto_id } = body ?? {}
  if (!rider_id || !participation_status || !moto_id) {
    return NextResponse.json({ error: 'rider_id, participation_status, and moto_id required' }, { status: 400 })
  }
  if (!['ACTIVE', 'DNS', 'ABSENT'].includes(participation_status)) {
    return NextResponse.json({ error: 'Invalid status for jury start' }, { status: 400 })
  }

  if (auth.role === 'RACE_DIRECTOR') {
    return NextResponse.json({ error: 'Read-only for RACE_DIRECTOR' }, { status: 403 })
  }

  if (await isLockedMoto(moto_id)) {
    try {
      assertMotoEditable('locked')
    } catch (err: unknown) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Moto locked.' }, { status: 409 })
    }
  }
  const { data: moto, error: motoError } = await adminClient
    .from('motos')
    .select('id, event_id, category_id, moto_name, status')
    .eq('id', moto_id)
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
  if (!isMotoLive(moto.status)) {
    return NextResponse.json({ error: 'Checker hanya bisa update status saat moto masih LIVE.' }, { status: 409 })
  }

  const approvalMode = await getApprovalMode(eventId)
  const shouldAutoApply = approvalMode === 'AUTO' || participation_status === 'ACTIVE'

  const { data, error } = await adminClient
    .from('rider_status_updates')
    .insert([
      {
        event_id: eventId,
        moto_id,
        rider_id,
        proposed_status: participation_status,
        created_by: auth.user.id,
        approval_status: shouldAutoApply ? 'APPROVED' : 'PENDING',
        approved_by: shouldAutoApply ? 'SYSTEM' : null,
        approved_at: shouldAutoApply ? new Date().toISOString() : null,
      },
    ])
    .select('id, event_id, rider_id, proposed_status, approval_status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (shouldAutoApply) {
    await adminClient
      .from('rider_participation_status')
      .upsert(
        [
          {
            event_id: eventId,
            moto_id,
            rider_id,
            participation_status,
            registration_order,
          },
        ],
        { onConflict: 'event_id,moto_id,rider_id' }
      )

    if (participation_status === 'DNS' || participation_status === 'ABSENT') {
      const { error: dnsResultError } = await adminClient
        .from('results')
        .upsert(
          [
            {
              event_id: eventId,
              moto_id,
              rider_id,
              finish_order: null,
              result_status: 'DNS',
            },
          ],
          { onConflict: 'moto_id,rider_id' }
        )
      if (dnsResultError) {
        return NextResponse.json({ error: dnsResultError.message }, { status: 400 })
      }
    } else {
      const { error: clearDnsResultError } = await adminClient
        .from('results')
        .delete()
        .eq('moto_id', moto_id)
        .eq('rider_id', rider_id)
        .eq('result_status', 'DNS')
      if (clearDnsResultError) {
        return NextResponse.json({ error: clearDnsResultError.message }, { status: 400 })
      }
    }
  }

  await adminClient.from('audit_log').insert([
    {
      action_type: 'STATUS_APPROVAL',
      performed_by: shouldAutoApply ? 'SYSTEM' : auth.user.id,
      rider_id,
      moto_id,
      event_id: eventId,
      reason: shouldAutoApply
        ? participation_status === 'ACTIVE'
          ? 'ACTIVE status auto-applied'
          : participation_status === 'ABSENT'
            ? 'ABSENT status applied with DNS scoring'
            : 'AUTO mode: status applied'
        : 'Status update submitted',
    },
  ])

  return NextResponse.json({ data })
}
