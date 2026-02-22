import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const auth = await requireJury(req, ['RACE_DIRECTOR'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { motoId } = await params

  const { data: moto, error } = await adminClient
    .from('motos')
    .select('id, status')
    .eq('id', motoId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!moto) return NextResponse.json({ error: 'Moto not found' }, { status: 404 })

  if ((moto.status ?? '').toUpperCase() !== 'PROVISIONAL') {
    return NextResponse.json({ error: 'Moto must be PROVISIONAL to open review.' }, { status: 409 })
  }

  const { error: updateError } = await adminClient
    .from('motos')
    .update({ status: 'PROTEST_REVIEW' })
    .eq('id', motoId)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
