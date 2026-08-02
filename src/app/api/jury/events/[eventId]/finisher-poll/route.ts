import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

const loadMotoStatuses = async (eventId: string, motoId: string) => {
  const [participationResult, updatesResult, resultsResult] = await Promise.all([
    adminClient
      .from('rider_participation_status')
      .select('rider_id, participation_status')
      .eq('event_id', eventId)
      .eq('moto_id', motoId),
    adminClient
      .from('rider_status_updates')
      .select('rider_id, proposed_status, approval_status, created_at')
      .eq('event_id', eventId)
      .eq('moto_id', motoId)
      .order('created_at', { ascending: false }),
    adminClient.from('results').select('rider_id, result_status').eq('moto_id', motoId),
  ])

  const error = participationResult.error ?? updatesResult.error ?? resultsResult.error
  if (error) throw new Error(error.message)

  const approved = new Map<string, string>()
  for (const row of participationResult.data ?? []) approved.set(row.rider_id, row.participation_status)
  for (const row of resultsResult.data ?? []) {
    if (row.result_status === 'FINISH' || row.result_status === 'DNF') approved.set(row.rider_id, 'ACTIVE')
    if (row.result_status === 'DNS') approved.set(row.rider_id, 'DNS')
  }

  const latestUpdates = new Map<string, { proposed_status: string | null; approval_status: string | null }>()
  for (const row of updatesResult.data ?? []) {
    if (!latestUpdates.has(row.rider_id)) {
      latestUpdates.set(row.rider_id, {
        proposed_status: row.proposed_status,
        approval_status: row.approval_status,
      })
    }
  }

  const riderIds = new Set([...approved.keys(), ...latestUpdates.keys()])
  return Array.from(riderIds).map((rider_id) => {
    const update = latestUpdates.get(rider_id)
    const participationStatus = approved.get(rider_id)
    return {
      rider_id,
      approval_status: update?.approval_status ?? (participationStatus ? 'APPROVED' : 'NONE'),
      proposed_status: update?.proposed_status ?? participationStatus ?? null,
      participation_status: participationStatus ?? null,
    }
  })
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireJury(req, ['FINISHER', 'CHECKER', 'RACE_DIRECTOR', 'ADMIN', 'super_admin'], eventId)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const motoId = new URL(req.url).searchParams.get('moto_id')
  if (!motoId) return NextResponse.json({ error: 'moto_id required' }, { status: 400 })

  const { data: moto, error: motoError } = await adminClient
    .from('motos')
    .select('id')
    .eq('id', motoId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })
  if (!moto) return NextResponse.json({ error: 'Moto not found in event.' }, { status: 404 })

  try {
    const [statuses, resultsResult, penaltiesResult, lockResult] = await Promise.all([
      loadMotoStatuses(eventId, motoId),
      adminClient
        .from('results')
        .select('rider_id, finish_order, result_status, dnf_progress_percent')
        .eq('moto_id', motoId)
        .order('finish_order', { ascending: true, nullsFirst: false }),
      adminClient
        .from('rider_penalties')
        .select('rider_id, rule_code, penalty_point, rider_penalty_approvals(approval_status)')
        .eq('event_id', eventId)
        .eq('moto_id', motoId)
        .eq('stage', 'MOTO')
        .order('created_at', { ascending: false }),
      adminClient
        .from('moto_locks')
        .select('moto_id')
        .eq('moto_id', motoId)
        .eq('is_locked', true)
        .maybeSingle(),
    ])

    const error = resultsResult.error ?? penaltiesResult.error ?? lockResult.error
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json(
      {
        data: {
          statuses,
          results: resultsResult.data ?? [],
          penalties: penaltiesResult.data ?? [],
          locked: Boolean(lockResult.data),
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    )
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Gagal memuat polling Finisher.' },
      { status: 400 }
    )
  }
}
