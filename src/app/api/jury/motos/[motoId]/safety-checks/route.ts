import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { assertMotoEditable, assertMotoNotUnderProtest } from '../../../../../../lib/motoLock'
import { requireJury } from '../../../../../../services/juryAuth'

const getMotoEvent = async (motoId: string) => {
  const { data, error } = await adminClient
    .from('motos')
    .select('id, event_id, status')
    .eq('id', motoId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Moto not found')
  return data
}

export async function GET(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const auth = await requireJury(req, ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { motoId } = await params
  const moto = await getMotoEvent(motoId)

  const { data: requirements, error: reqError } = await adminClient
    .from('event_safety_requirements')
    .select('id, label, is_required, sort_order')
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
  const auth = await requireJury(req, ['CHECKER', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { motoId } = await params
  const { rider_id, requirement_id, is_checked } = await req.json().catch(() => ({}))

  if (!rider_id || !requirement_id || typeof is_checked !== 'boolean') {
    return NextResponse.json({ error: 'rider_id, requirement_id, is_checked required' }, { status: 400 })
  }

  const moto = await getMotoEvent(motoId)
  try {
    assertMotoEditable(moto.status)
    assertMotoNotUnderProtest(moto.status)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Moto locked.' }, { status: 409 })
  }

  const { error } = await adminClient
    .from('rider_safety_checks')
    .upsert(
      [
        {
          event_id: moto.event_id,
          moto_id: motoId,
          rider_id,
          requirement_id,
          is_checked,
          updated_at: new Date().toISOString(),
          updated_by: auth.user.id,
        },
      ],
      { onConflict: 'event_id,moto_id,rider_id,requirement_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
