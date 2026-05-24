import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'
import { isMissingPrimaryCategoryColumnError } from '../../../../../lib/categoryAssignment'

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

type MotoStatus = 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'

const resolveQualificationMotoCount = async (eventId: string, categoryId: string) => {
  const { data } = await adminClient
    .from('race_stage_config')
    .select('qualification_moto_count')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
    .maybeSingle()
  return Math.max(2, Number(data?.qualification_moto_count ?? 2))
}

const buildDeleteGuard = async (eventId: string, categoryId: string) => {
  const { data: motos, error: motoError } = await adminClient
    .from('motos')
    .select('id, status')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)

  if (motoError) {
    return { error: motoError.message }
  }

  const typedMotos = (motos ?? []) as Array<{ id: string; status?: MotoStatus | null }>
  const lockedCount = typedMotos.filter((moto) => String(moto.status ?? '').toUpperCase() === 'LOCKED').length

  const { data: stageRows, error: stageError } = await adminClient
    .from('race_stage_result')
    .select('stage, final_class')
    .eq('category_id', categoryId)

  if (stageError) {
    return { error: stageError.message }
  }

  const typedStageRows = (stageRows ?? []) as Array<{ stage?: string | null; final_class?: string | null }>
  const hasFinalState = typedStageRows.some((row) => {
    const stage = String(row.stage ?? '').toUpperCase()
    return stage === 'FINAL' || stage === 'SEMI_FINAL' || stage === 'REPECHAGE' || stage === 'QUARTER_FINAL'
  })

  const reason =
    lockedCount > 0
      ? `Kategori ini memiliki ${lockedCount} moto LOCKED. Reset draw diblokir agar hasil race yang sudah dikunci tidak terhapus.`
      : hasFinalState
        ? 'Kategori ini sudah memiliki hasil AMS sampai stage lanjutan/final. Bersihkan hasil race dan state AMS dulu sebelum reset draw.'
        : null

  return {
    error: null,
    canDelete: !reason,
    deleteBlockReason: reason,
    lockedCount,
    hasFinalState,
  }
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

const flatten = <T,>(items: T[][]) => items.flat()

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
  const buildQuery = (supportsPrimaryCategory: boolean) =>
    adminClient
      .from('riders')
      .select(
        supportsPrimaryCategory
          ? 'id, name, no_plate_display, plate_number, plate_suffix, birth_year, primary_category_id, gender'
          : 'id, name, no_plate_display, plate_number, plate_suffix, birth_year, gender'
      )
      .eq('event_id', eventId)
  let query = buildQuery(true)
  const { data: extraRows } = await adminClient
    .from('rider_extra_categories')
    .select('rider_id')
    .eq('event_id', eventId)
    .eq('category_id', category.id)
  const extraIds = (extraRows ?? []).map((row) => row.rider_id)

  const withPrimaryFilters = () => {
    const legacyFilter =
      category.gender === 'MIX'
        ? `and(primary_category_id.is.null,birth_year.gte.${minYear},birth_year.lte.${maxYear})`
        : `and(primary_category_id.is.null,birth_year.gte.${minYear},birth_year.lte.${maxYear},gender.eq.${category.gender})`
    const filters = [`primary_category_id.eq.${category.id}`, legacyFilter]
    if (extraIds.length > 0) {
      filters.push(`id.in.(${extraIds.join(',')})`)
    }
    return filters.join(',')
  }

  const legacyQuery = () => {
    let nextQuery = buildQuery(false)
    if (extraIds.length > 0) {
      const baseFilter =
        category.gender === 'MIX'
          ? `and(birth_year.gte.${minYear},birth_year.lte.${maxYear})`
          : `and(birth_year.gte.${minYear},birth_year.lte.${maxYear},gender.eq.${category.gender})`
      nextQuery = nextQuery.or(`${baseFilter},id.in.(${extraIds.join(',')})`)
    } else {
      nextQuery = nextQuery.gte('birth_year', minYear).lte('birth_year', maxYear)
      if (category.gender !== 'MIX') {
        nextQuery = nextQuery.eq('gender', category.gender)
      }
    }
    return nextQuery
  }

  query = query.or(withPrimaryFilters())
  let { data, error } = await query
  if (error && isMissingPrimaryCategoryColumnError(error.message)) {
    ;({ data, error } = await legacyQuery())
  }

  if (error) return { data: null, error }
  const rows = (data ?? []) as unknown as RiderRow[]
  return {
    data: rows.sort((a, b) => {
      const plateCompare = String(a.plate_number).localeCompare(String(b.plate_number), undefined, { numeric: true })
      if (plateCompare !== 0) return plateCompare
      return String(a.plate_suffix ?? '').localeCompare(String(b.plate_suffix ?? ''))
    }),
    error: null,
  }
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
  const deleteGuard = await buildDeleteGuard(eventId, categoryId)
  if (deleteGuard.error) {
    return NextResponse.json({ error: deleteGuard.error }, { status: 400 })
  }
  const qualificationMotoCount = await resolveQualificationMotoCount(eventId, categoryId)
  return NextResponse.json({
    data,
    has_motos: (existingMotos ?? []).length > 0,
    can_delete: deleteGuard.canDelete,
    delete_block_reason: deleteGuard.deleteBlockReason,
    locked_moto_count: deleteGuard.lockedCount,
    has_final_state: deleteGuard.hasFinalState,
    qualification_moto_count: qualificationMotoCount,
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const body = await req.json().catch(() => ({}))
  const categoryId = body?.category_id as string | undefined
  const riderIds = (body?.rider_ids ?? []) as string[]
  const riderIdsMoto2 = (body?.rider_ids_moto2 ?? []) as string[]
  const riderBatches = (body?.rider_batches ?? []) as string[][]
  const riderBatchesMoto2 = (body?.rider_batches_moto2 ?? []) as string[][]
  const batchSize = Math.max(4, Math.min(8, Number(body?.batch_size ?? 8)))
  const hasCustomMoto2 = Array.isArray(riderIdsMoto2) && riderIdsMoto2.length > 0
  const hasManualBatches = Array.isArray(riderBatches) && riderBatches.length > 0
  const hasManualMoto2Batches = Array.isArray(riderBatchesMoto2) && riderBatchesMoto2.length > 0

  if (!categoryId) return NextResponse.json({ error: 'category_id required' }, { status: 400 })
  if (!hasManualBatches && (!Array.isArray(riderIds) || riderIds.length === 0)) {
    return NextResponse.json({ error: 'rider_ids required' }, { status: 400 })
  }
  if (!hasManualBatches && hasCustomMoto2 && riderIdsMoto2.length !== riderIds.length) {
    return NextResponse.json({ error: 'rider_ids_moto2 length must match rider_ids' }, { status: 400 })
  }

  const category = await loadCategory(eventId, categoryId)
  if (!category) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  const { data: riders, error } = await loadRidersForCategory(eventId, category)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const allowedIds = new Set((riders ?? []).map((r) => r.id))
  const effectiveBatches = hasManualBatches ? riderBatches.filter((batch) => Array.isArray(batch) && batch.length > 0) : chunk(riderIds, batchSize)
  const effectiveRiderIds = hasManualBatches ? flatten(effectiveBatches) : riderIds
  const uniqueIds = new Set(effectiveRiderIds)
  if (uniqueIds.size !== effectiveRiderIds.length) {
    return NextResponse.json({ error: 'Duplicate rider_ids detected' }, { status: 400 })
  }
  for (const id of effectiveRiderIds) {
    if (!allowedIds.has(id)) {
      return NextResponse.json({ error: 'rider_ids contains invalid rider' }, { status: 400 })
    }
  }
  if (hasManualBatches && uniqueIds.size !== allowedIds.size) {
    return NextResponse.json({ error: 'Manual rider_batches must contain every rider in the category exactly once' }, { status: 400 })
  }
  if (hasCustomMoto2 || hasManualMoto2Batches) {
    const effectiveMoto2Ids = hasManualMoto2Batches ? flatten(riderBatchesMoto2) : riderIdsMoto2
    const uniqueMoto2Ids = new Set(effectiveMoto2Ids)
    if (uniqueMoto2Ids.size !== effectiveMoto2Ids.length) {
      return NextResponse.json({ error: 'Duplicate rider_ids_moto2 detected' }, { status: 400 })
    }
    for (const id of effectiveMoto2Ids) {
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
  const batches = hasManualBatches ? effectiveBatches : chunk(riderIds, batchSize)
  const moto2Batches = hasManualMoto2Batches ? riderBatchesMoto2.filter((batch) => Array.isArray(batch) && batch.length > 0) : hasCustomMoto2 ? chunk(riderIdsMoto2, batchSize) : []
  if (hasCustomMoto2 && moto2Batches.length !== batches.length) {
    return NextResponse.json({ error: 'rider_ids_moto2 batch shape invalid' }, { status: 400 })
  }
  if (hasCustomMoto2 || hasManualMoto2Batches) {
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
  // Moto 3 is no longer created during draw setup.
  // For single-batch categories, Moto 3 will be created after Moto 2 results are complete (via moto3Reseed service).
  const motoCount = 2
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
    const moto2Order = hasCustomMoto2 ? (moto2Batches[batchIndex] ?? []) : [...batch].reverse()
    batch.forEach((riderId, idx) => {
      motoRiders.push({ moto_id: moto1.id, rider_id: riderId })
      motoRiders.push({ moto_id: moto2.id, rider_id: riderId })
      if (hasGateTable) {
        gatePositions.push({ moto_id: moto1.id, rider_id: riderId, gate_position: idx + 1 })
      }
    })
    if (hasGateTable) {
      moto2Order.forEach((riderId, idx) => {
        gatePositions.push({ moto_id: moto2.id, rider_id: riderId, gate_position: idx + 1 })
      })
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

  const deleteGuard = await buildDeleteGuard(eventId, categoryId)
  if (deleteGuard.error) {
    return NextResponse.json({ error: deleteGuard.error }, { status: 400 })
  }
  if (!deleteGuard.canDelete) {
    return NextResponse.json(
      {
        error: deleteGuard.deleteBlockReason,
        can_delete: false,
        locked_moto_count: deleteGuard.lockedCount,
        has_final_state: deleteGuard.hasFinalState,
      },
      { status: 409 }
    )
  }

  const { error } = await adminClient
    .from('motos')
    .delete()
    .eq('event_id', eventId)
    .eq('category_id', categoryId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
