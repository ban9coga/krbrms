import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../lib/auth'
import { requireJury } from '../../../../../services/juryAuth'

const allowedTargets = ['PROTEST_REVIEW', 'LOCKED'] as const
type TargetStatus = (typeof allowedTargets)[number]

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const auth = await requireJury(req, ['RACE_DIRECTOR', 'super_admin', 'admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { motoId } = await params
  const body = await req.json().catch(() => ({}))
  const status = body?.status as TargetStatus | undefined
  if (!status || !allowedTargets.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { data: moto, error } = await adminClient
    .from('motos')
    .select('id, status')
    .eq('id', motoId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!moto) return NextResponse.json({ error: 'Moto not found' }, { status: 404 })

  const current = (moto.status as string | null)?.toUpperCase() ?? ''

  if (current === 'LOCKED') {
    return NextResponse.json({ error: 'Moto already locked. No modification allowed.' }, { status: 409 })
  }

  if (current === 'LIVE' && status === 'LOCKED') {
    return NextResponse.json({ error: 'Invalid transition: LIVE cannot go directly to LOCKED.' }, { status: 400 })
  }

  const validTransition =
    (current === 'PROVISIONAL' && (status === 'PROTEST_REVIEW' || status === 'LOCKED')) ||
    (current === 'PROTEST_REVIEW' && status === 'LOCKED')

  if (!validTransition) {
    return NextResponse.json({ error: 'Invalid status transition.' }, { status: 400 })
  }

  const { error: updateError } = await adminClient.from('motos').update({ status }).eq('id', motoId)
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
