import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../lib/auth'

export async function PATCH(req: Request, { params }: { params: Promise<{ categoryId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { categoryId } = await params
  const body = await req.json()
  const { enabled } = body ?? {}
  const { data, error } = await adminClient
    .from('categories')
    .update({ enabled })
    .eq('id', categoryId)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
