import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { assertMotoEditable, assertMotoNotUnderProtest } from '../../../../../../lib/motoLock'
import { requireJury } from '../../../../../../services/juryAuth'
import { broadcastRaceState } from '../../../../../../lib/broadcastRaceState'
import { saveSafetyChecksAndSyncPenalties, type SafetyCheckRow } from '../../../../../../services/safetyChecks'

const getMotoEvent = async (motoId: string) => {
  const { data, error } = await adminClient
    .from('motos')
    .select('id, event_id, category_id, status')
    .eq('id', motoId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Moto not found')
  return data
}

const parseSafetyCheck = (input: Record<string, unknown>): SafetyCheckRow | null => {
  if (
    typeof input.rider_id !== 'string' ||
    typeof input.requirement_id !== 'string' ||
    typeof input.is_checked !== 'boolean'
  ) {
    return null
  }

  return {
    rider_id: input.rider_id,
    requirement_id: input.requirement_id,
    is_checked: input.is_checked,
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const moto = await getMotoEvent(motoId)
  const auth = await requireJury(req, ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'super_admin'], moto.event_id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: requirements, error: reqError } = await adminClient
    .from('event_safety_requirements')
    .select('id, label, is_required, sort_order, penalty_code, icon_key')
    .eq('event_id', moto.event_id)
    .order('sort_order', { ascending: true })
  if (reqError) return NextResponse.json({ error: reqError.message }, { status: 400 })

  const { data: checks, error: checkError } = await adminClient
    .from('rider_safety_checks')
    .select('rider_id, requirement_id, is_checked')
    .eq('moto_id', motoId)
  if (checkError) return NextResponse.json({ error: checkError.message }, { status: 400 })

  return NextResponse.json({ data: { requirements: requirements ?? [], checks: checks ?? [] } })
}

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const body = await req.json().catch(() => ({}))
  const rawChecks: Array<Record<string, unknown>> = Array.isArray(body?.checks) ? body.checks : [body]
  const checks: Array<SafetyCheckRow | null> = rawChecks.map(parseSafetyCheck)

  if (checks.some((check) => !check)) {
    return NextResponse.json({ error: 'rider_id, requirement_id, is_checked required' }, { status: 400 })
  }

  const moto = await getMotoEvent(motoId)
  const auth = await requireJury(req, ['CHECKER', 'super_admin'], moto.event_id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    assertMotoEditable(moto.status)
    assertMotoNotUnderProtest(moto.status)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Moto locked.' }, { status: 409 })
  }

  try {
    await saveSafetyChecksAndSyncPenalties({
      authUserId: auth.user?.id ?? null,
      eventId: moto.event_id,
      motoId,
      motoStatus: moto.status,
      checks: checks as SafetyCheckRow[],
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to save safety check' }, { status: 400 })
  }

  void broadcastRaceState(moto.event_id, motoId, moto.category_id)
  return NextResponse.json({ ok: true, count: checks.length })
}
