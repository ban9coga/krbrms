import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'
import { assertMotoEditable, assertMotoNotUnderProtest } from '../../../../../../lib/motoLock'
import { computeStageAdvances, generateStageMotos } from '../../../../../../services/advancedRaceAuto'

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId } = await params
  const body = await req.json().catch(() => ({}))
  const categoryId = body?.category_id as string | undefined
  if (!categoryId) return NextResponse.json({ error: 'category_id required' }, { status: 400 })

  const { data: category, error: catError } = await adminClient
    .from('categories')
    .select('id, event_id')
    .eq('id', categoryId)
    .maybeSingle()
  if (catError || !category || category.event_id !== eventId) {
    return NextResponse.json({ error: 'Category not found in event' }, { status: 404 })
  }

  const { data: motos, error: motoError } = await adminClient
    .from('motos')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })
  try {
    (motos ?? []).forEach((m) => {
      const status = (m as { status?: string | null }).status ?? null
      assertMotoEditable(status)
      assertMotoNotUnderProtest(status)
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Moto locked.' }, { status: 409 })
  }

  await generateStageMotos(eventId, categoryId)
  const result = await computeStageAdvances(eventId, categoryId)
  if (!result.ok) {
    return NextResponse.json({ warning: result.warning ?? 'Advance skipped.' })
  }
  return NextResponse.json({ ok: true })
}
