import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { assertMotoEditable, assertMotoNotUnderProtest } from '../../../../../../lib/motoLock'
import { promoteNextMotoToLive } from '../../../../../../services/motoProgression'
import { requireJury } from '../../../../../../services/juryAuth'

const parseBatchKey = (name: string) => {
  const match = name.match(/moto\s*(\d+)\s*-\s*batch\s*(\d+)/i)
  if (!match) return null
  return { motoIndex: Number(match[1]), batchIndex: Number(match[2]) }
}

const dnsPointForMoto = (riderCount: number) => riderCount + 2

const pointForRaceResult = (
  row: { finish_order: number | null; result_status?: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | null } | null | undefined,
  riderCount: number
) => {
  if (!row) return null
  const status = row.result_status ?? 'FINISH'
  if (status === 'DQ') return null
  if (status === 'DNS') return dnsPointForMoto(riderCount)
  if (status === 'DNF') return riderCount
  return row.finish_order ?? null
}

const isLockedMoto = async (motoId: string) => {
  const { data } = await adminClient
    .from('moto_locks')
    .select('moto_id, is_locked')
    .eq('moto_id', motoId)
    .eq('is_locked', true)
    .maybeSingle()
  return !!data
}

const reseedSingleBatchMoto3 = async (submittedMotoId: string) => {
  const { data: currentMoto, error: currentMotoError } = await adminClient
    .from('motos')
    .select('id, event_id, category_id, moto_name')
    .eq('id', submittedMotoId)
    .maybeSingle()

  if (currentMotoError || !currentMoto?.event_id || !currentMoto?.category_id || !currentMoto?.moto_name) {
    return { ok: false, warning: currentMotoError?.message ?? 'Moto not found for Moto 3 reseed.' }
  }

  const parsedCurrent = parseBatchKey(currentMoto.moto_name)
  if (!parsedCurrent || parsedCurrent.batchIndex !== 1 || parsedCurrent.motoIndex !== 2) {
    return { ok: true }
  }

  const { data: categoryMotos, error: categoryMotoError } = await adminClient
    .from('motos')
    .select('id, moto_name, moto_order')
    .eq('event_id', currentMoto.event_id)
    .eq('category_id', currentMoto.category_id)
    .order('moto_order', { ascending: true })

  if (categoryMotoError) {
    return { ok: false, warning: categoryMotoError.message }
  }

  const qualificationMotos = (categoryMotos ?? []).filter((moto) => parseBatchKey(moto.moto_name))
  const parsedQualificationMotos = qualificationMotos
    .map((moto) => ({ moto, parsed: parseBatchKey(moto.moto_name) }))
    .filter((row): row is { moto: { id: string; moto_name: string; moto_order: number }; parsed: { motoIndex: number; batchIndex: number } } => Boolean(row.parsed))

  const batchIndices = new Set(parsedQualificationMotos.map((row) => row.parsed.batchIndex))
  if (batchIndices.size !== 1) return { ok: true }

  const moto1 = parsedQualificationMotos.find((row) => row.parsed.batchIndex === 1 && row.parsed.motoIndex === 1)?.moto
  const moto2 = parsedQualificationMotos.find((row) => row.parsed.batchIndex === 1 && row.parsed.motoIndex === 2)?.moto
  const moto3 = parsedQualificationMotos.find((row) => row.parsed.batchIndex === 1 && row.parsed.motoIndex === 3)?.moto

  if (!moto1 || !moto2 || !moto3) return { ok: true }

  const { data: assignedRows, error: assignedError } = await adminClient
    .from('moto_riders')
    .select('moto_id, rider_id')
    .in('moto_id', [moto1.id, moto2.id, moto3.id])

  if (assignedError) {
    return { ok: false, warning: assignedError.message }
  }

  const moto1Riders = (assignedRows ?? []).filter((row) => row.moto_id === moto1.id).map((row) => row.rider_id)
  if (moto1Riders.length === 0) return { ok: true }

  const { data: resultRows, error: resultError } = await adminClient
    .from('results')
    .select('moto_id, rider_id, finish_order, result_status')
    .in('moto_id', [moto1.id, moto2.id])

  if (resultError) {
    return { ok: false, warning: resultError.message }
  }

  const moto2RiderSet = new Set((assignedRows ?? []).filter((row) => row.moto_id === moto2.id).map((row) => row.rider_id))
  const resultsByKey = new Map(
    (resultRows ?? []).map((row) => [`${row.moto_id}:${row.rider_id}`, row] as const)
  )

  const riderCount = moto1Riders.length
  const moto2Complete = moto1Riders.every((riderId) => moto2RiderSet.has(riderId) && resultsByKey.has(`${moto2.id}:${riderId}`))
  if (!moto2Complete) return { ok: true }

  const orderedRiders = [...moto1Riders]
    .map((riderId) => {
      const moto1Result = resultsByKey.get(`${moto1.id}:${riderId}`)
      const moto2Result = resultsByKey.get(`${moto2.id}:${riderId}`)
      const moto1Points = pointForRaceResult(moto1Result, riderCount) ?? 9999
      const moto2Points = pointForRaceResult(moto2Result, riderCount) ?? 9999
      return {
        riderId,
        totalPoints: moto1Points + moto2Points,
        moto2Points,
        moto1Points,
      }
    })
    .sort((a, b) => {
      if (a.totalPoints !== b.totalPoints) return a.totalPoints - b.totalPoints
      if (a.moto2Points !== b.moto2Points) return a.moto2Points - b.moto2Points
      if (a.moto1Points !== b.moto1Points) return a.moto1Points - b.moto1Points
      return a.riderId.localeCompare(b.riderId)
    })

  const { error: deleteGateError } = await adminClient
    .from('moto_gate_positions')
    .delete()
    .eq('moto_id', moto3.id)

  if (deleteGateError) {
    return { ok: false, warning: deleteGateError.message }
  }

  const { error: insertGateError } = await adminClient
    .from('moto_gate_positions')
    .insert(
      orderedRiders.map((row, index) => ({
        moto_id: moto3.id,
        rider_id: row.riderId,
        gate_position: index + 1,
      }))
    )

  if (insertGateError) {
    return { ok: false, warning: insertGateError.message }
  }

  return { ok: true }
}

export async function GET(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const { data: moto } = await adminClient.from('motos').select('event_id').eq('id', motoId).maybeSingle()
  const auth = await requireJury(req, ['FINISHER', 'CHECKER', 'RACE_DIRECTOR', 'ADMIN', 'super_admin'], moto?.event_id ?? null)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { data, error } = await adminClient
    .from('results')
    .select('rider_id, finish_order, result_status')
    .eq('moto_id', motoId)
    .order('finish_order', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const { data: scopedMoto } = await adminClient.from('motos').select('event_id').eq('id', motoId).maybeSingle()
  const auth = await requireJury(req, ['FINISHER', 'CHECKER', 'RACE_DIRECTOR', 'ADMIN', 'super_admin'], scopedMoto?.event_id ?? null)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
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
  const { data: motoStatusRow, error: statusError } = await adminClient
    .from('motos')
    .select('status')
    .eq('id', motoId)
    .maybeSingle()
  if (statusError) return NextResponse.json({ error: statusError.message }, { status: 400 })
  try {
    assertMotoNotUnderProtest((motoStatusRow as { status?: string | null })?.status ?? null)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Moto under protest review.' }, { status: 409 })
  }

  const body = await req.json()
  const { results } = body ?? {}

  if (!Array.isArray(results) || results.length === 0) {
    return NextResponse.json({ error: 'results required' }, { status: 400 })
  }

  const { data: moto, error: motoError } = await adminClient
    .from('motos')
    .select('id, event_id')
    .eq('id', motoId)
    .maybeSingle()

  if (motoError || !moto?.event_id) {
    return NextResponse.json({ error: 'Moto not found' }, { status: 404 })
  }

  const payload = (results as Array<{ rider_id: string; finish_order?: number | null; result_status?: string }>).map((row) => ({
    event_id: moto.event_id,
    moto_id: motoId,
    rider_id: row.rider_id,
    finish_order: row.finish_order ?? null,
    result_status: row.result_status ?? 'FINISH',
  }))

  const { data: assigned, error: assignedError } = await adminClient
    .from('moto_riders')
    .select('rider_id')
    .eq('moto_id', motoId)

  if (assignedError) {
    return NextResponse.json({ error: assignedError.message }, { status: 400 })
  }

  if (!assigned || assigned.length === 0) {
    return NextResponse.json({ error: 'No riders assigned to moto' }, { status: 400 })
  }

  const assignedSet = new Set(assigned.map((r) => r.rider_id))
  if (payload.some((row) => !assignedSet.has(row.rider_id))) {
    return NextResponse.json({ error: 'Rider not assigned to moto' }, { status: 400 })
  }

  if (auth.role === 'CHECKER') {
    const invalid = payload.some(
      (row) => row.result_status !== 'DNS' || row.finish_order !== null
    )
    if (invalid) {
      return NextResponse.json({ error: 'CHECKER can only set DNS with no finish_order' }, { status: 403 })
    }
  }

  const finishRanks = payload
    .filter((row) => row.result_status === 'FINISH' && row.finish_order !== null && row.finish_order !== undefined)
    .map((row) => row.finish_order as number)

  const unique = new Set(finishRanks)
  if (unique.size !== finishRanks.length) {
    return NextResponse.json({ error: 'Duplicate finish_order in this moto' }, { status: 400 })
  }

  const { error } = await adminClient.from('results').upsert(payload, { onConflict: 'moto_id,rider_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const activeRows = payload
    .filter((row) => row.result_status === 'FINISH' || row.result_status === 'DNF')
    .map((row) => ({
      event_id: moto.event_id,
      moto_id: motoId,
      rider_id: row.rider_id,
      participation_status: 'ACTIVE',
      registration_order: row.finish_order ?? 0,
    }))
  if (activeRows.length > 0) {
    const { error: activeStatusError } = await adminClient
      .from('rider_participation_status')
      .upsert(activeRows, { onConflict: 'event_id,moto_id,rider_id' })
    if (activeStatusError) return NextResponse.json({ error: activeStatusError.message }, { status: 400 })
  }

  await adminClient
    .from('motos')
    .update({ status: 'PROVISIONAL', provisional_at: new Date().toISOString() })
    .eq('id', motoId)

  const moto3Reseed = await reseedSingleBatchMoto3(motoId)
  if (!moto3Reseed.ok) {
    return NextResponse.json({ error: moto3Reseed.warning ?? 'Failed to reseed Moto 3 gates.' }, { status: 400 })
  }

  await promoteNextMotoToLive(moto.event_id, motoId)

  return NextResponse.json({ ok: true })
}


export async function DELETE(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const { data: scopedMoto } = await adminClient.from('motos').select('event_id').eq('id', motoId).maybeSingle()
  const auth = await requireJury(req, ['FINISHER', 'RACE_DIRECTOR', 'ADMIN', 'super_admin'], scopedMoto?.event_id ?? null)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (await isLockedMoto(motoId) && auth.role !== 'RACE_DIRECTOR' && auth.role !== 'SUPER_ADMIN') {
    try {
      assertMotoEditable('locked')
    } catch (err: unknown) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Moto locked.' }, { status: 409 })
    }
  }
  const { data: statusRow, error: statusErr } = await adminClient
    .from('motos')
    .select('status')
    .eq('id', motoId)
    .maybeSingle()
  if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 400 })
  try {
    assertMotoNotUnderProtest((statusRow as { status?: string | null })?.status ?? null)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Moto under protest review.' }, { status: 409 })
  }

  const { error } = await adminClient.from('results').delete().eq('moto_id', motoId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await adminClient
    .from('motos')
    .update({ status: 'LIVE', provisional_at: null })
    .eq('id', motoId)

  return NextResponse.json({ ok: true })
}
