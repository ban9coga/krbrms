import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../lib/auth'

export async function PATCH(req: Request, { params }: { params: Promise<{ categoryId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { categoryId } = await params
  const body = await req.json()
  const { enabled, year_min, year_max, label, capacity, gender } = body ?? {}
  if (year_min != null && year_max != null && Number(year_min) > Number(year_max)) {
    return NextResponse.json({ error: 'year_min must be <= year_max' }, { status: 400 })
  }
  if (capacity != null && Number(capacity) < 0) {
    return NextResponse.json({ error: 'capacity must be >= 0' }, { status: 400 })
  }
  if (gender && !['BOY', 'GIRL', 'MIX'].includes(String(gender))) {
    return NextResponse.json({ error: 'gender must be BOY, GIRL, or MIX' }, { status: 400 })
  }
  const { data, error } = await adminClient
    .from('categories')
    .update({
      enabled,
      year_min: year_min != null ? Number(year_min) : undefined,
      year_max: year_max != null ? Number(year_max) : undefined,
      label: typeof label === 'string' ? label : undefined,
      capacity: capacity === null || capacity === '' ? null : capacity != null ? Number(capacity) : undefined,
      gender: gender != null ? gender : undefined,
    })
    .eq('id', categoryId)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
