import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

export async function POST(req: Request, { params }: { params: Promise<{ protestId: string }> }) {
  const auth = await requireJury(req, ['RACE_DIRECTOR'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { protestId } = await params
  const body = await req.json().catch(() => ({}))
  const { decision, note } = body ?? {}
  if (!decision) return NextResponse.json({ error: 'decision required' }, { status: 400 })

  const { data: protest, error } = await adminClient
    .from('protests')
    .select('id, moto_id')
    .eq('id', protestId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (!protest) return NextResponse.json({ error: 'Protest not found' }, { status: 404 })

  const { error: updateError } = await adminClient
    .from('protests')
    .update({
      decision,
      resolved_at: new Date().toISOString(),
      resolved_by: auth.user.id,
      note: note ?? null,
    })
    .eq('id', protestId)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

  if (String(decision).toUpperCase() === 'ACCEPTED' && (protest as { moto_id?: string | null })?.moto_id) {
    await adminClient
      .from('motos')
      .update({ status: 'PROVISIONAL' })
      .eq('id', (protest as { moto_id?: string | null }).moto_id as string)
  }

  return NextResponse.json({ ok: true })
}
