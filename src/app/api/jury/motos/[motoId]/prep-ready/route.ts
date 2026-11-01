import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { assertMotoEditable, assertMotoNotUnderProtest } from '../../../../../../lib/motoLock'
import { isMotoReady, isMotoUpcoming } from '../../../../../../lib/motoStatus'
import { requireJury } from '../../../../../../services/juryAuth'
import { promoteReadyMotoAfterPreviousProvisional } from '../../../../../../services/motoProgression'
import { notifyRiderMotoConfirmed } from '../../../../../../services/riderNotificationService'
import { broadcastRaceState } from '../../../../../../lib/broadcastRaceState'
import { saveSafetyChecksAndSyncPenalties, type SafetyCheckRow } from '../../../../../../services/safetyChecks'

const getMoto = async (motoId: string) => {
  const { data, error } = await adminClient
    .from('motos')
    .select('id, event_id, category_id, status')
    .eq('id', motoId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const body = await req.json().catch(() => ({}))
  const rawChecks: unknown[] = Array.isArray(body?.checks) ? body.checks : []
  const checks: Array<SafetyCheckRow | null> = rawChecks.map((input) => {
    if (!input || typeof input !== 'object') return null
    const row = input as Record<string, unknown>
    if (
      typeof row.rider_id !== 'string' ||
      typeof row.requirement_id !== 'string' ||
      typeof row.is_checked !== 'boolean'
    ) return null
    return {
      rider_id: row.rider_id,
      requirement_id: row.requirement_id,
      is_checked: row.is_checked,
    }
  })
  if (checks.some((check) => !check)) {
    return NextResponse.json({ error: 'rider_id, requirement_id, is_checked required' }, { status: 400 })
  }

  const moto = await getMoto(motoId)
  if (!moto) return NextResponse.json({ error: 'Moto not found' }, { status: 404 })

  const auth = await requireJury(req, ['CHECKER', 'super_admin'], moto.event_id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    assertMotoEditable(moto.status)
    assertMotoNotUnderProtest(moto.status)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Moto locked.' }, { status: 409 })
  }

  if (!isMotoUpcoming(moto.status) && !isMotoReady(moto.status)) {
    return NextResponse.json({ error: 'Prep hanya bisa dikonfirmasi saat moto UPCOMING atau READY.' }, { status: 409 })
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Gagal menyimpan checklist safety gear dan penalty. Moto belum READY.' },
      { status: 400 }
    )
  }

  const now = new Date().toISOString()
  const { data, error } = await adminClient
    .from('motos')
    .update({
      status: 'READY',
      provisional_at: null,
      checker_prep_ready_at: now,
      checker_prep_ready_by: auth.user?.id ?? null,
    })
    .eq('id', motoId)
    .select('id, status, checker_prep_ready_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const promotionResult = await promoteReadyMotoAfterPreviousProvisional(moto.event_id, motoId)

  // Side effect only: Dispatch RIDER_MOTO_CONFIRMED push notification to subscribed guardians
  try {
    await notifyRiderMotoConfirmed(motoId)
  } catch (pushErr) {
    console.error('Non-blocking push notification error:', pushErr)
  }

  void broadcastRaceState(moto.event_id, motoId, moto.category_id)
  return NextResponse.json({ ok: true, data, next_moto: promotionResult })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const moto = await getMoto(motoId)
  if (!moto) return NextResponse.json({ error: 'Moto not found' }, { status: 404 })

  const auth = await requireJury(req, ['CHECKER', 'super_admin'], moto.event_id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    assertMotoEditable(moto.status)
    assertMotoNotUnderProtest(moto.status)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Moto locked.' }, { status: 409 })
  }

  if (!isMotoUpcoming(moto.status) && !isMotoReady(moto.status)) {
    return NextResponse.json({ error: 'Edit prep hanya bisa dibuka saat moto UPCOMING atau READY.' }, { status: 409 })
  }

  const { error } = await adminClient
    .from('motos')
    .update({
      status: 'UPCOMING',
      provisional_at: null,
      checker_prep_ready_at: null,
      checker_prep_ready_by: null,
    })
    .eq('id', motoId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  void broadcastRaceState(moto.event_id, motoId, moto.category_id)
  return NextResponse.json({ ok: true })
}
