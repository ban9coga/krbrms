import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'
import { parseRiderStatusSourceNote } from '../../../../../../lib/riderStatusSource'

type MotoStatusRow = {
  rider_id: string
  proposed_status: string | null
  approval_status: string | null
  created_at: string
  note?: string | null
}

const loadMotoStatuses = async (eventId: string, motoId?: string | null) => {
  if (!motoId) return []

  const [participationResult, updatesResult, resultsResult] = await Promise.all([
    adminClient
      .from('rider_participation_status')
      .select('rider_id, participation_status')
      .eq('event_id', eventId)
      .eq('moto_id', motoId),
    adminClient
      .from('rider_status_updates')
      .select('rider_id, proposed_status, approval_status, created_at, note')
      .eq('event_id', eventId)
      .eq('moto_id', motoId)
      .order('created_at', { ascending: false }),
    adminClient
      .from('results')
      .select('rider_id, result_status')
      .eq('moto_id', motoId),
  ])

  const error = participationResult.error ?? updatesResult.error ?? resultsResult.error
  if (error) throw new Error(error.message)

  const approved = new Map<string, string>()
  for (const row of participationResult.data ?? []) {
    approved.set(row.rider_id, row.participation_status)
  }

  for (const row of resultsResult.data ?? []) {
    if (row.result_status === 'FINISH' || row.result_status === 'DNF') approved.set(row.rider_id, 'ACTIVE')
    // ABSENT carries DNS scoring but stays ABSENT for the Checker's workflow.
    if (row.result_status === 'DNS' && approved.get(row.rider_id) !== 'ABSENT') {
      approved.set(row.rider_id, 'DNS')
    }
  }

  const latestUpdates = new Map<string, MotoStatusRow>()
  for (const row of (updatesResult.data ?? []) as MotoStatusRow[]) {
    if (!latestUpdates.has(row.rider_id)) latestUpdates.set(row.rider_id, row)
  }

  const riderIds = new Set([...approved.keys(), ...latestUpdates.keys()])
  return Array.from(riderIds).map((rider_id) => {
    const update = latestUpdates.get(rider_id)
    const participationStatus = approved.get(rider_id)
    const source = parseRiderStatusSourceNote(update?.note)
    return {
      rider_id,
      approval_status: update?.approval_status ?? (participationStatus ? 'APPROVED' : 'NONE'),
      proposed_status: update?.proposed_status ?? participationStatus ?? null,
      participation_status: participationStatus ?? null,
      status_source_role: source?.role ?? null,
      status_source_label: source?.label ?? null,
      status_updated_at: update?.created_at ?? null,
    }
  })
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireJury(req, ['CHECKER', 'super_admin'], eventId)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { searchParams } = new URL(req.url)
  const prepMotoId = searchParams.get('prep_moto_id')
  const incidentMotoId = searchParams.get('incident_moto_id')
  const requestedMotoIds = Array.from(new Set([prepMotoId, incidentMotoId].filter((id): id is string => Boolean(id))))

  const { data: scopedMotos, error: motoError } = requestedMotoIds.length
    ? await adminClient
        .from('motos')
        .select('id')
        .eq('event_id', eventId)
        .in('id', requestedMotoIds)
    : { data: [], error: null }

  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })
  const validMotoIds = new Set((scopedMotos ?? []).map((moto) => moto.id))
  const safePrepMotoId = prepMotoId && validMotoIds.has(prepMotoId) ? prepMotoId : null
  const safeIncidentMotoId = incidentMotoId && validMotoIds.has(incidentMotoId) ? incidentMotoId : null

  try {
    const [prepStatuses, incidentStatuses, safetyResult, lockResult] = await Promise.all([
      loadMotoStatuses(eventId, safePrepMotoId),
      safeIncidentMotoId === safePrepMotoId ? Promise.resolve(null) : loadMotoStatuses(eventId, safeIncidentMotoId),
      safePrepMotoId
        ? adminClient
            .from('rider_safety_checks')
            .select('rider_id, requirement_id, is_checked')
            .eq('moto_id', safePrepMotoId)
        : Promise.resolve({ data: [], error: null }),
      safeIncidentMotoId
        ? adminClient
            .from('moto_locks')
            .select('moto_id, is_locked, locked_at')
            .eq('moto_id', safeIncidentMotoId)
            .eq('is_locked', true)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])

    const detailError = safetyResult.error ?? lockResult.error
    if (detailError) return NextResponse.json({ error: detailError.message }, { status: 400 })

    return NextResponse.json(
      {
        prep: {
          moto_id: safePrepMotoId,
          statuses: prepStatuses,
          checks: safetyResult.data ?? [],
        },
        incident: {
          moto_id: safeIncidentMotoId,
          locked: Boolean(lockResult.data),
          statuses: incidentStatuses ?? prepStatuses,
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
      { error: error instanceof Error ? error.message : 'Gagal memuat polling Checker.' },
      { status: 400 }
    )
  }
}
