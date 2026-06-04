import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { assertMotoEditable, assertMotoNotUnderProtest } from '../../../../../../lib/motoLock'
import { isMotoLive, isMotoUpcoming } from '../../../../../../lib/motoStatus'
import { requireJury } from '../../../../../../services/juryAuth'

const getMoto = async (motoId: string) => {
  const { data, error } = await adminClient
    .from('motos')
    .select('id, event_id, status')
    .eq('id', motoId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
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

  if (!isMotoUpcoming(moto.status) && !isMotoLive(moto.status)) {
    return NextResponse.json({ error: 'Prep hanya bisa dikonfirmasi saat moto UPCOMING atau LIVE.' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const { data, error } = await adminClient
    .from('motos')
    .update({
      checker_prep_ready_at: now,
      checker_prep_ready_by: auth.user?.id ?? null,
    })
    .eq('id', motoId)
    .select('id, checker_prep_ready_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, data })
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

  const { error } = await adminClient
    .from('motos')
    .update({
      checker_prep_ready_at: null,
      checker_prep_ready_by: null,
    })
    .eq('id', motoId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
