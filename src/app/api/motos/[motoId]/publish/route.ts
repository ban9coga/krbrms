import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../lib/auth'
import { requireJury } from '../../../../../services/juryAuth'

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const auth = await requireJury(req, ['RACE_DIRECTOR', 'super_admin', 'admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { motoId } = await params

  const { data: moto, error } = await adminClient
    .from('motos')
    .select('id, status, is_published')
    .eq('id', motoId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!moto) return NextResponse.json({ error: 'Moto not found' }, { status: 404 })

  if (moto.status !== 'LOCKED') {
    return NextResponse.json({ error: 'Moto must be LOCKED before publication.' }, { status: 409 })
  }

  if (moto.is_published) {
    return NextResponse.json({ error: 'Moto already published.' }, { status: 409 })
  }

  const { error: updateError } = await adminClient
    .from('motos')
    .update({
      is_published: true,
      published_at: new Date().toISOString(),
    })
    .eq('id', motoId)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
