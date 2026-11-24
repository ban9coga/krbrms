import { NextResponse } from 'next/server'
import { adminClient, requireAdmin, requireScopedEventWorkspace } from '../../../../lib/auth'

const CATEGORY_RETURN_SELECT = 'id, event_id, year, year_min, year_max, category_basis, age_min, age_max, capacity, gender, label, enabled, sequence_order'

export async function PATCH(req: Request, { params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params
  const { data: existingCategory, error: categoryError } = await adminClient
    .from('categories').select('event_id').eq('id', categoryId).maybeSingle()
  if (categoryError || !existingCategory) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  const auth = await requireAdmin(req.headers.get('authorization'), existingCategory.event_id)
  const rcAuth = auth.ok ? auth : await requireScopedEventWorkspace(req.headers.get('authorization'), existingCategory.event_id, ['RC_ADMIN'])
  if (!rcAuth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  const { enabled, year_min, year_max, category_basis, age_min, age_max, label, capacity, gender } = body ?? {}
  const categoryBasis = category_basis === 'AGE' ? 'AGE' : category_basis === 'BIRTH_YEAR' ? 'BIRTH_YEAR' : undefined
  if (categoryBasis === 'BIRTH_YEAR' && year_min != null && year_max != null && Number(year_min) > Number(year_max)) {
    return NextResponse.json({ error: 'year_min must be <= year_max' }, { status: 400 })
  }
  if (categoryBasis === 'AGE' && (!Number.isInteger(Number(age_min)) || !Number.isInteger(Number(age_max)) || Number(age_min) < 0 || Number(age_min) > Number(age_max))) {
    return NextResponse.json({ error: 'Rentang umur tidak valid.' }, { status: 400 })
  }
  if (capacity != null && Number(capacity) < 0) {
    return NextResponse.json({ error: 'capacity must be >= 0' }, { status: 400 })
  }
  if (gender && !['BOY', 'GIRL', 'MIX'].includes(String(gender))) {
    return NextResponse.json({ error: 'gender must be BOY, GIRL, or MIX' }, { status: 400 })
  }
  const updatePayload: Record<string, unknown> = {
    enabled,
    year_min: year_min != null ? Number(year_min) : undefined,
    year_max: year_max != null ? Number(year_max) : undefined,
    category_basis: categoryBasis,
    age_min: categoryBasis === 'AGE' ? Number(age_min) : categoryBasis === 'BIRTH_YEAR' ? null : undefined,
    age_max: categoryBasis === 'AGE' ? Number(age_max) : categoryBasis === 'BIRTH_YEAR' ? null : undefined,
    label: typeof label === 'string' ? label : undefined,
    capacity: capacity === null || capacity === '' ? null : capacity != null ? Number(capacity) : undefined,
    gender: gender != null ? gender : undefined,
  }
  if (categoryBasis === 'AGE') {
    const [{ data: current }, { data: event }] = await Promise.all([
      adminClient.from('categories').select('year').eq('id', categoryId).maybeSingle(),
      adminClient.from('events').select('event_date').eq('id', existingCategory.event_id).maybeSingle(),
    ])
    if (!event?.event_date) {
      return NextResponse.json({ error: 'Isi tanggal event sebelum mengubah kategori menjadi kategori umur.' }, { status: 400 })
    }
    const eventYear = Number(String(event?.event_date ?? '').slice(0, 4))
    const compatibilityYear = Number.isInteger(eventYear) && eventYear >= 1900 ? eventYear : current?.year
    updatePayload.year = compatibilityYear
    updatePayload.year_min = compatibilityYear
    updatePayload.year_max = compatibilityYear
  }
  const { data, error } = await adminClient
    .from('categories')
    .update(updatePayload)
    .eq('id', categoryId)
    .select(CATEGORY_RETURN_SELECT)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
