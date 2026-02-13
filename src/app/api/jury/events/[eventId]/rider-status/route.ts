import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
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
  const auth = await requireJury(req, ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { eventId } = await params

  const { data: approvedRows, error: approvedError } = await adminClient
    .from('rider_participation_status')
    .select('rider_id, participation_status')
    .eq('event_id', eventId)

  if (approvedError) return NextResponse.json({ error: approvedError.message }, { status: 400 })

  const { data: updates, error: updatesError } = await adminClient
    .from('rider_status_updates')
    .select('rider_id, proposed_status, approval_status, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })

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
  const auth = await requireJury(req, ['CHECKER', 'RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { eventId } = await params
  const body = await req.json()
  const { rider_id, participation_status, registration_order = 0, moto_id } = body ?? {}
  if (!rider_id || !participation_status) {
    return NextResponse.json({ error: 'rider_id and participation_status required' }, { status: 400 })
  }
  if (!['ACTIVE', 'DNS', 'ABSENT'].includes(participation_status)) {
    return NextResponse.json({ error: 'Invalid status for jury start' }, { status: 400 })
  }

  if (auth.role === 'RACE_DIRECTOR') {
    return NextResponse.json({ error: 'Read-only for RACE_DIRECTOR' }, { status: 403 })
  }

  if (await isLockedMoto(moto_id)) {
    return NextResponse.json({ error: 'Moto locked. Updates disabled.' }, { status: 409 })
  }

  const approvalMode = await getApprovalMode(eventId)

  const { data, error } = await adminClient
    .from('rider_status_updates')
    .insert([
      {
        event_id: eventId,
        rider_id,
        proposed_status: participation_status,
        created_by: auth.user.id,
        approval_status: approvalMode === 'AUTO' ? 'APPROVED' : 'PENDING',
        approved_by: approvalMode === 'AUTO' ? 'SYSTEM' : null,
        approved_at: approvalMode === 'AUTO' ? new Date().toISOString() : null,
      },
    ])
    .select('id, event_id, rider_id, proposed_status, approval_status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (approvalMode === 'AUTO') {
    await adminClient
      .from('rider_participation_status')
      .upsert(
        [
          {
            event_id: eventId,
            rider_id,
            participation_status,
            registration_order,
          },
        ],
        { onConflict: 'event_id,rider_id' }
      )
  }

  await adminClient.from('audit_log').insert([
    {
      action_type: 'STATUS_APPROVAL',
      performed_by: approvalMode === 'AUTO' ? 'SYSTEM' : auth.user.id,
      rider_id,
      event_id: eventId,
      reason: approvalMode === 'AUTO' ? 'AUTO mode: status applied' : 'Status update submitted',
    },
  ])

  return NextResponse.json({ data })
}
