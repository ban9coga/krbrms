import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { assertMotoEditable, assertMotoNotUnderProtest } from '../../../../../../lib/motoLock'
import { requireJury } from '../../../../../../services/juryAuth'

const isLockedMoto = async (motoId: string) => {
  const { data } = await adminClient
    .from('moto_locks')
    .select('moto_id, is_locked')
    .eq('moto_id', motoId)
    .eq('is_locked', true)
    .maybeSingle()
  return !!data
}

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const auth = await requireJury(req, ['FINISHER', 'CHECKER', 'RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { motoId } = await params
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

  return NextResponse.json({ ok: true })
}


export async function DELETE(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const auth = await requireJury(req, ['FINISHER', 'RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { motoId } = await params
  if (await isLockedMoto(motoId) && auth.role !== 'RACE_DIRECTOR' && auth.role !== 'super_admin') {
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
  return NextResponse.json({ ok: true })
}
