import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../lib/auth'

export async function PATCH(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { motoId } = await params
  const body = await req.json()
  const { moto_name, moto_order, status } = body ?? {}
  const { data, error } = await adminClient
    .from('motos')
    .update({ moto_name, moto_order, status })
    .eq('id', motoId)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
