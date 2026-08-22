import { NextResponse } from 'next/server'
import { adminClient, requireScopedEventWorkspace } from '../../../../../lib/auth'
import { isMissingPrimaryCategoryColumnError } from '../../../../../lib/categoryAssignment'
import { normalizeDrawCategoryConfig } from '../../../../../lib/drawConfig'

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

type MotoStatus = 'UPCOMING' | 'READY' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'

const resolveQualificationMotoCount = async (eventId: string, categoryId: string) => {
  const { data } = await adminClient
    .from('race_stage_config')
    .select('qualification_moto_count')
    .eq('event_id', eventId)
    .eq('category_id', categoryId)
    .maybeSingle()
  return Math.max(2, Number(data?.qualification_moto_count ?? 2))
}

const loadDrawConfiguration = async (eventId: string, categoryId: string) => {
  const [{ data: config, error: configError }, { data: settings, error: settingsError }] = await Promise.all([
    adminClient
      .from('race_stage_config')
      .select('draw_batch_mode, draw_batch_size, draw_batch_count, draw_custom_batch_sizes, draw_moto2_order')
      .eq('event_id', eventId)
      .eq('category_id', categoryId)
      .maybeSingle(),
    adminClient
      .from('event_settings')
      .select('race_format_settings')
      .eq('event_id', eventId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (configError || settingsError) return { error: configError?.message || settingsError?.message || 'Gagal memuat konfigurasi drawing.' }
  const format =
    settings?.race_format_settings && typeof settings.race_format_settings === 'object' && !Array.isArray(settings.race_format_settings)
      ? (settings.race_format_settings as Record<string, unknown>)
      : {}
  return {
    error: null,
    gatePositions: Math.max(1, Number(format.gate_positions ?? 8)),
    drawMode: format.draw_mode === 'external_draw' ? 'external_draw' : 'internal_live_draw',
    config: normalizeDrawCategoryConfig({
      batch_mode: config?.draw_batch_mode,
      batch_size: config?.draw_batch_size,
      batch_count: config?.draw_batch_count,
      custom_batch_sizes: config?.draw_custom_batch_sizes,
      moto2_order: config?.draw_moto2_order,
    }),
  }
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

const buildBatchesByCount = <T,>(items: T[], batchCount: number) => {
  const safeCount = Math.max(1, Math.min(items.length, batchCount))
  const baseSize = Math.floor(items.length / safeCount)
  const remainder = items.length % safeCount
  let cursor = 0
  return Array.from({ length: safeCount }, (_, index) => {
    const size = baseSize + (index < remainder ? 1 : 0)
    const batch = items.slice(cursor, cursor + size)
    cursor += size
    return batch
  })
}

const buildBatchesBySizes = <T,>(items: T[], sizes: number[]) => {
  if (sizes.reduce((total, size) => total + size, 0) !== items.length) return null
  let cursor = 0
  return sizes.map((size) => {
    const batch = items.slice(cursor, cursor + size)
    cursor += size
    return batch
  })
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

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireScopedEventWorkspace(req.headers.get('authorization'), eventId, ['DRAW_MANAGER'])
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
  const drawConfiguration = await loadDrawConfiguration(eventId, categoryId)
  if (drawConfiguration.error) return NextResponse.json({ error: drawConfiguration.error }, { status: 400 })
  return NextResponse.json({
    data,
    has_motos: (existingMotos ?? []).length > 0,
    can_delete: deleteGuard.canDelete,
    delete_block_reason: deleteGuard.deleteBlockReason,
    locked_moto_count: deleteGuard.lockedCount,
    has_final_state: deleteGuard.hasFinalState,
    qualification_moto_count: qualificationMotoCount,
    gate_positions: drawConfiguration.gatePositions,
    draw_config: drawConfiguration.config,
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireScopedEventWorkspace(req.headers.get('authorization'), eventId, ['DRAW_MANAGER'])
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
  const drawConfiguration = await loadDrawConfiguration(eventId, categoryId)
  if (drawConfiguration.error) return NextResponse.json({ error: drawConfiguration.error }, { status: 400 })

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

  // The error response above has already returned, but keep this value concrete
  // for TypeScript because loadDrawConfiguration has an error-result branch.
  const gateCapacity = Math.max(1, Number(drawConfiguration.gatePositions ?? 8))
  const configuredBatchSize = Math.max(
    1,
    Math.min(gateCapacity, drawConfiguration.config?.batch_size ?? gateCapacity)
  )
  const configuredBatches = (() => {
    const config = drawConfiguration.config
    if (!config || config.batch_mode === 'AUTO_BY_GATE') return chunk(riderIds, configuredBatchSize)
    if (config.batch_mode === 'MANUAL_BATCH_COUNT') return buildBatchesByCount(riderIds, config.batch_count ?? 1)
    return buildBatchesBySizes(riderIds, config.custom_batch_sizes)
  })()
  if (drawConfiguration.drawMode === 'internal_live_draw' && !configuredBatches) {
    return NextResponse.json({ error: 'Pola batch pada Draw Settings tidak sama dengan jumlah rider kategori ini.' }, { status: 400 })
  }
  const batches =
    drawConfiguration.drawMode === 'internal_live_draw'
      ? (configuredBatches ?? [])
      : hasManualBatches
        ? effectiveBatches
        : chunk(riderIds, batchSize)
  const capacityLimit = drawConfiguration.drawMode === 'internal_live_draw' ? gateCapacity : batchSize
  const moto2Batches = hasManualMoto2Batches ? riderBatchesMoto2.filter((batch) => Array.isArray(batch) && batch.length > 0) : hasCustomMoto2 ? chunk(riderIdsMoto2, batchSize) : []
  const overCapacityBatches = batches
    .map((batch, index) => (batch.length > capacityLimit ? index + 1 : null))
    .filter((value): value is number => value !== null)
  if (overCapacityBatches.length > 0) {
    return NextResponse.json(
      { error: `Batch ${overCapacityBatches.join(', ')} melebihi kapasitas maksimal ${capacityLimit} rider` },
      { status: 400 }
    )
  }
  if (hasCustomMoto2 && moto2Batches.length !== batches.length) {
    return NextResponse.json({ error: 'rider_ids_moto2 batch shape invalid' }, { status: 400 })
  }
  if (hasCustomMoto2 || hasManualMoto2Batches) {
    for (let i = 0; i < batches.length; i += 1) {
      const moto1Batch = batches[i]
      const moto2Batch = moto2Batches[i] ?? []
      if (moto2Batch.length > capacityLimit) {
        return NextResponse.json(
          { error: `rider_ids_moto2 batch ${i + 1} melebihi kapasitas maksimal ${capacityLimit} rider` },
          { status: 400 }
        )
      }
      if (!sameSet(moto1Batch, moto2Batch)) {
        return NextResponse.json(
          { error: `rider_ids_moto2 batch ${i + 1} must contain same riders as moto1 batch ${i + 1}` },
          { status: 400 }
        )
      }
    }
  }
  const finalizedMoto2Batches = batches.map((batch, batchIndex) => {
    if (hasManualMoto2Batches || hasCustomMoto2) return moto2Batches[batchIndex] ?? []
    return drawConfiguration.config?.moto2_order === 'SAME' ? [...batch] : [...batch].reverse()
  })

  // The RPC uses one database transaction plus an event advisory lock. This
  // avoids partially created motos and prevents simultaneous saves from two
  // drawing devices from reusing the same moto order.
  const { data: savedDraw, error: saveError } = await adminClient.rpc('save_live_draw_motos', {
    p_event_id: eventId,
    p_category_id: categoryId,
    p_batches: batches,
    p_moto2_batches: finalizedMoto2Batches,
  })

  if (saveError) {
    const status = saveError.code === '23505' ? 409 : 400
    return NextResponse.json({ error: saveError.message }, { status })
  }

  const summary = Array.isArray(savedDraw) ? savedDraw[0] : savedDraw

  return NextResponse.json({
    data: {
      batch_count: Number(summary?.batch_count ?? batches.length),
      moto_count: Number(summary?.moto_count ?? batches.length * 2),
      gate_positions_saved: Number(summary?.gate_positions_saved ?? 0) > 0,
    },
  })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireScopedEventWorkspace(req.headers.get('authorization'), eventId, ['DRAW_MANAGER'])
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
