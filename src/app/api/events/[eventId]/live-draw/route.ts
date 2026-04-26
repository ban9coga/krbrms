import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'

type CategoryRow = {
  id: string
  year: number
  year_min?: number | null
  year_max?: number | null
  gender: 'BOY' | 'GIRL' | 'MIX'
  enabled: boolean
}

type RiderRow = {
  id: string
  name: string
  no_plate_display: string
  plate_number: string
  plate_suffix?: string | null
  birth_year: number
  primary_category_id?: string | null
  gender: 'BOY' | 'GIRL'
}

const chunk = <T,>(items: T[], size: number) => {
  const batches: T[][] = []
  let cursor = 0
  while (cursor < items.length) {
    batches.push(items.slice(cursor, cursor + size))
    cursor += size
  }
  return batches
}

const shuffle = <T,>(items: T[]) => {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

const sameOrder = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

const buildMoto3Order = (moto1Order: string[], moto2Order: string[]) => {
  const base = [...moto1Order]
  if (base.length <= 1) return base

  // Try several random permutations that differ from Moto 1 and Moto 2.
  const maxAttempts = Math.max(12, base.length * 4)
  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = shuffle(base)
    if (!sameOrder(candidate, moto1Order) && !sameOrder(candidate, moto2Order)) {
      return candidate
    }
  }

  // Deterministic fallback: rotate order until it differs from Moto 1 and Moto 2.
  for (let shift = 1; shift < base.length; shift += 1) {
    const rotated = [...base.slice(shift), ...base.slice(0, shift)]
    if (!sameOrder(rotated, moto1Order) && !sameOrder(rotated, moto2Order)) {
      return rotated
    }
  }

  // Edge case (typically 2 riders): only 2 permutations exist, so best effort.
  return shuffle(base)
}

const sameSet = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false
  const setA = new Set(a)
  const setB = new Set(b)
  if (setA.size !== setB.size) return false
  for (const item of setA) {
    if (!setB.has(item)) return false
  }
  return true
}

const loadCategory = async (eventId: string, categoryId: string) => {
  const { data, error } = await adminClient
    .from('categories')
    .select('id, year, year_min, year_max, gender, enabled')
    .eq('event_id', eventId)
    .eq('id', categoryId)
    .single()
  if (error || !data) return null
  return data as CategoryRow
}

const loadRidersForCategory = async (eventId: string, category: CategoryRow) => {
  const minYear = category.year_min ?? category.year
  const maxYear = category.year_max ?? category.year
  let query = adminClient
    .from('riders')
    .select('id, name, no_plate_display, plate_number, plate_suffix, birth_year, primary_category_id, gender')
    .eq('event_id', eventId)
  const { data: extraRows } = await adminClient
    .from('rider_extra_categories')
    .select('rider_id')
    .eq('event_id', eventId)
    .eq('category_id', category.id)
  const extraIds = (extraRows ?? []).map((row) => row.rider_id)

  const legacyFilter =
    category.gender === 'MIX'
      ? `and(primary_category_id.is.null,birth_year.gte.${minYear},birth_year.lte.${maxYear})`
      : `and(primary_category_id.is.null,birth_year.gte.${minYear},birth_year.lte.${maxYear},gender.eq.${category.gender})`
  const filters = [`primary_category_id.eq.${category.id}`, legacyFilter]
  if (extraIds.length > 0) {
    filters.push(`id.in.(${extraIds.join(',')})`)
  }
  query = query.or(filters.join(','))
  const { data, error } = await query
    .order('plate_number', { ascending: true })
    .order('plate_suffix', { ascending: true, nullsFirst: true })
  if (error) return { data: null, error }
  return { data: (data ?? []) as RiderRow[], error: null }
}

const tableExists = async (tableName: string) => {
  const { data, error } = await adminClient
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_name', tableName)
    .maybeSingle()
  if (error) return false
  return !!data?.table_name
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { searchParams } = new URL(req.url)
  const categoryId = searchParams.get('categoryId')
  if (!categoryId) return NextResponse.json({ error: 'categoryId required' }, { status: 400 })

  const category = await loadCategory(eventId, categoryId)
  if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

  const { data: existingMotos, error: existingError } = await adminClient
    .from('motos')
    .select('id')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
    .limit(1)
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 })

  const { data, error } = await loadRidersForCategory(eventId, category)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data, has_motos: (existingMotos ?? []).length > 0 })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const body = await req.json().catch(() => ({}))
  const categoryId = body?.category_id as string | undefined
  const riderIds = (body?.rider_ids ?? []) as string[]
  const riderIdsMoto2 = (body?.rider_ids_moto2 ?? []) as string[]
  const batchSize = Math.max(4, Math.min(8, Number(body?.batch_size ?? 8)))
  const hasCustomMoto2 = Array.isArray(riderIdsMoto2) && riderIdsMoto2.length > 0

  if (!categoryId) return NextResponse.json({ error: 'category_id required' }, { status: 400 })
  if (!Array.isArray(riderIds) || riderIds.length === 0) {
    return NextResponse.json({ error: 'rider_ids required' }, { status: 400 })
  }
  if (hasCustomMoto2 && riderIdsMoto2.length !== riderIds.length) {
    return NextResponse.json({ error: 'rider_ids_moto2 length must match rider_ids' }, { status: 400 })
  }

  const category = await loadCategory(eventId, categoryId)
  if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })

  const { data: riders, error } = await loadRidersForCategory(eventId, category)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const allowedIds = new Set((riders ?? []).map((r) => r.id))
  const uniqueIds = new Set(riderIds)
  if (uniqueIds.size !== riderIds.length) {
    return NextResponse.json({ error: 'Duplicate rider_ids detected' }, { status: 400 })
  }
  for (const id of riderIds) {
    if (!allowedIds.has(id)) {
      return NextResponse.json({ error: 'rider_ids contains invalid rider' }, { status: 400 })
    }
  }
  if (hasCustomMoto2) {
    const uniqueMoto2Ids = new Set(riderIdsMoto2)
    if (uniqueMoto2Ids.size !== riderIdsMoto2.length) {
      return NextResponse.json({ error: 'Duplicate rider_ids_moto2 detected' }, { status: 400 })
    }
    for (const id of riderIdsMoto2) {
      if (!allowedIds.has(id)) {
        return NextResponse.json({ error: 'rider_ids_moto2 contains invalid rider' }, { status: 400 })
      }
    }
  }

  const { data: existingMotos, error: existingError } = await adminClient
    .from('motos')
    .select('id')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
    .limit(1)
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 400 })
  if ((existingMotos ?? []).length > 0) {
    return NextResponse.json(
      { error: 'Motos already exist for this category. Live Draw skipped.' },
      { status: 409 }
    )
  }

  const { data: lastOrderRow } = await adminClient
    .from('motos')
    .select('moto_order')
    .eq('event_id', eventId)
    .order('moto_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const baseOrder = lastOrderRow?.moto_order ?? 0
  const batches = chunk(riderIds, batchSize)
  const moto2Batches = hasCustomMoto2 ? chunk(riderIdsMoto2, batchSize) : []
  if (hasCustomMoto2 && moto2Batches.length !== batches.length) {
    return NextResponse.json({ error: 'rider_ids_moto2 batch shape invalid' }, { status: 400 })
  }
  if (hasCustomMoto2) {
    for (let i = 0; i < batches.length; i += 1) {
      const moto1Batch = batches[i]
      const moto2Batch = moto2Batches[i] ?? []
      if (!sameSet(moto1Batch, moto2Batch)) {
        return NextResponse.json(
          { error: `rider_ids_moto2 batch ${i + 1} must contain same riders as moto1 batch ${i + 1}` },
          { status: 400 }
        )
      }
    }
  }
  const motoCount = riderIds.length <= 8 ? 3 : 2
  const orderFor = (motoIndex: number, batchIndex: number) =>
    baseOrder + (motoIndex - 1) * batches.length + batchIndex + 1
  const motoRecords = batches.flatMap((_, idx) => [
    {
      event_id: eventId,
      category_id: categoryId,
      moto_name: `Moto 1 - Batch ${idx + 1}`,
      moto_order: orderFor(1, idx),
      status: 'UPCOMING',
    },
    {
      event_id: eventId,
      category_id: categoryId,
      moto_name: `Moto 2 - Batch ${idx + 1}`,
      moto_order: orderFor(2, idx),
      status: 'UPCOMING',
    },
    ...(motoCount === 3
      ? [
          {
            event_id: eventId,
            category_id: categoryId,
            moto_name: `Moto 3 - Batch ${idx + 1}`,
            moto_order: orderFor(3, idx),
            status: 'UPCOMING',
          },
        ]
      : []),
  ])

  const { data: motoRows, error: motoError } = await adminClient
    .from('motos')
    .insert(motoRecords)
    .select('id, moto_name, moto_order')

  if (motoError || !motoRows) {
    return NextResponse.json({ error: motoError?.message || 'Failed to create motos' }, { status: 400 })
  }

  const motoRiders: Array<{ moto_id: string; rider_id: string }> = []
  const gatePositions: Array<{ moto_id: string; rider_id: string; gate_position: number }> = []

  const hasGateTable = await tableExists('moto_gate_positions')
  if (hasCustomMoto2 && !hasGateTable) {
    return NextResponse.json({ error: 'Custom Moto 2 order requires moto_gate_positions table' }, { status: 400 })
  }

  batches.forEach((batch, batchIndex) => {
    const base = batchIndex * motoCount
    const moto1 = motoRows[base]
    const moto2 = motoRows[base + 1]
    const moto3 = motoCount === 3 ? motoRows[base + 2] : null
    const moto2Order = hasCustomMoto2 ? (moto2Batches[batchIndex] ?? []) : [...batch].reverse()
    const moto3Order = moto3 ? buildMoto3Order(batch, moto2Order) : null
    batch.forEach((riderId, idx) => {
      motoRiders.push({ moto_id: moto1.id, rider_id: riderId })
      motoRiders.push({ moto_id: moto2.id, rider_id: riderId })
      if (moto3) motoRiders.push({ moto_id: moto3.id, rider_id: riderId })
      if (hasGateTable) {
        gatePositions.push({ moto_id: moto1.id, rider_id: riderId, gate_position: idx + 1 })
      }
    })
    if (hasGateTable) {
      moto2Order.forEach((riderId, idx) => {
        gatePositions.push({ moto_id: moto2.id, rider_id: riderId, gate_position: idx + 1 })
      })
      if (moto3 && moto3Order) {
        moto3Order.forEach((riderId, idx) => {
          gatePositions.push({ moto_id: moto3.id, rider_id: riderId, gate_position: idx + 1 })
        })
      }
    }
  })

  const { error: riderError } = await adminClient.from('moto_riders').insert(motoRiders)
  if (riderError) {
    return NextResponse.json({ error: riderError.message }, { status: 400 })
  }

  if (hasGateTable && gatePositions.length > 0) {
    const { error: gateError } = await adminClient.from('moto_gate_positions').insert(gatePositions)
    if (gateError) {
      return NextResponse.json({ error: gateError.message }, { status: 400 })
    }
  }

  return NextResponse.json({
    data: {
      batch_count: batches.length,
      moto_count: motoRows.length,
      gate_positions_saved: hasGateTable,
    },
  })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId } = await params
  const body = await req.json().catch(() => ({}))
  const categoryId = body?.category_id as string | undefined
  if (!categoryId) return NextResponse.json({ error: 'category_id required' }, { status: 400 })

  const { error } = await adminClient
    .from('motos')
    .delete()
    .eq('event_id', eventId)
    .eq('category_id', categoryId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
