import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../lib/auth'

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
  plate_number: number
  plate_suffix?: string | null
  birth_year: number
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
    .select('id, name, no_plate_display, plate_number, plate_suffix, birth_year, gender')
    .eq('event_id', eventId)
  const { data: extraRows } = await adminClient
    .from('rider_extra_categories')
    .select('rider_id')
    .eq('event_id', eventId)
    .eq('category_id', category.id)
  const extraIds = (extraRows ?? []).map((row) => row.rider_id)

  if (extraIds.length > 0) {
    const baseFilter =
      category.gender === 'MIX'
        ? `and(birth_year.gte.${minYear},birth_year.lte.${maxYear})`
        : `and(birth_year.gte.${minYear},birth_year.lte.${maxYear},gender.eq.${category.gender})`
    const orFilter = `${baseFilter},id.in.(${extraIds.join(',')})`
    query = query.or(orFilter)
  } else {
    query = query.gte('birth_year', minYear).lte('birth_year', maxYear)
    if (category.gender !== 'MIX') {
      query = query.eq('gender', category.gender)
    }
  }
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
  const batchSize = Math.max(4, Math.min(8, Number(body?.batch_size ?? 8)))

  if (!categoryId) return NextResponse.json({ error: 'category_id required' }, { status: 400 })
  if (!Array.isArray(riderIds) || riderIds.length === 0) {
    return NextResponse.json({ error: 'rider_ids required' }, { status: 400 })
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

  let nextOrder = (lastOrderRow?.moto_order ?? 0) + 1
  const batches = chunk(riderIds, batchSize)
  const motoCount = riderIds.length <= 8 ? 3 : 2
  const motoRecords = batches.flatMap((_, idx) => [
    {
      event_id: eventId,
      category_id: categoryId,
      moto_name: `Moto 1 - Batch ${idx + 1}`,
      moto_order: nextOrder++,
      status: 'UPCOMING',
    },
    {
      event_id: eventId,
      category_id: categoryId,
      moto_name: `Moto 2 - Batch ${idx + 1}`,
      moto_order: nextOrder++,
      status: 'UPCOMING',
    },
    ...(motoCount === 3
      ? [
          {
            event_id: eventId,
            category_id: categoryId,
            moto_name: `Moto 3 - Batch ${idx + 1}`,
            moto_order: nextOrder++,
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

  batches.forEach((batch, batchIndex) => {
    const base = batchIndex * motoCount
    const moto1 = motoRows[base]
    const moto2 = motoRows[base + 1]
    const moto3 = motoCount === 3 ? motoRows[base + 2] : null
    batch.forEach((riderId, idx) => {
      motoRiders.push({ moto_id: moto1.id, rider_id: riderId })
      motoRiders.push({ moto_id: moto2.id, rider_id: riderId })
      if (moto3) motoRiders.push({ moto_id: moto3.id, rider_id: riderId })
      if (hasGateTable) {
        gatePositions.push({ moto_id: moto1.id, rider_id: riderId, gate_position: idx + 1 })
      }
    })
    if (hasGateTable) {
      const reversed = [...batch].reverse()
      reversed.forEach((riderId, idx) => {
        gatePositions.push({ moto_id: moto2.id, rider_id: riderId, gate_position: idx + 1 })
      })
      if (moto3) {
        const randomized = shuffle(batch)
        randomized.forEach((riderId, idx) => {
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
