import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'
import {
  normalizeDrawCategoryConfig,
  normalizeQualificationBatchMode,
  QUALIFICATION_BATCH_MODES,
} from '../../../../../lib/drawConfig'

const parseRaceFormatSettings = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: categories, error: categoryError }, { data: configs, error: configError }, { data: settings, error: settingsError }] =
    await Promise.all([
      adminClient
        .from('categories')
        .select('id, label, enabled, sequence_order')
        .eq('event_id', eventId)
        .order('sequence_order', { ascending: true }),
      adminClient
        .from('race_stage_config')
        .select('category_id, qualification_moto_count, single_batch_final_enabled, draw_batch_mode, draw_batch_size, draw_batch_count, draw_custom_batch_sizes, draw_moto2_order, draw_moto3_order')
        .eq('event_id', eventId),
      adminClient
        .from('event_settings')
        .select('race_format_settings')
        .eq('event_id', eventId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  if (categoryError || configError || settingsError) {
    return NextResponse.json({ error: categoryError?.message || configError?.message || settingsError?.message }, { status: 400 })
  }

  const configByCategory = new Map(
    (configs ?? []).map((config) => [
      config.category_id,
      normalizeDrawCategoryConfig({
        batch_mode: config.draw_batch_mode,
        batch_size: config.draw_batch_size,
        batch_count: config.draw_batch_count,
        custom_batch_sizes: config.draw_custom_batch_sizes,
        moto2_order: config.draw_moto2_order,
        moto3_order: config.draw_moto3_order,
      }),
    ])
  )
  const raceFormat = parseRaceFormatSettings(settings?.race_format_settings)

  return NextResponse.json({
    data: {
      gate_positions: Math.max(1, Number(raceFormat.gate_positions ?? 8)),
      draw_mode: raceFormat.draw_mode === 'external_draw' ? 'external_draw' : 'internal_live_draw',
      qualification_batch_mode: normalizeQualificationBatchMode(raceFormat.qualification_batch_mode),
      categories: (categories ?? []).map((category) => ({
        ...category,
        qualification_moto_count: Math.max(2, Math.min(3, Number(configs?.find((config) => config.category_id === category.id)?.qualification_moto_count ?? 2))),
        single_batch_final_enabled: configs?.find((config) => config.category_id === category.id)?.single_batch_final_enabled === true,
        draw_config: configByCategory.get(category.id) ?? normalizeDrawCategoryConfig({}),
      })),
    },
  })
}

export async function PUT(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const categoryId = typeof body?.category_id === 'string' ? body.category_id : ''
  if (!categoryId) return NextResponse.json({ error: 'category_id required' }, { status: 400 })

  const config = normalizeDrawCategoryConfig(body?.draw_config)
  const qualificationMotoCount = body?.qualification_moto_count == null ? undefined : Number(body.qualification_moto_count)
  if (body?.single_batch_final_enabled != null && typeof body.single_batch_final_enabled !== 'boolean') {
    return NextResponse.json({ error: 'single_batch_final_enabled harus boolean.' }, { status: 400 })
  }
  const singleBatchFinalEnabled = body?.single_batch_final_enabled == null ? undefined : Boolean(body.single_batch_final_enabled)
  if (qualificationMotoCount != null && ![2, 3].includes(qualificationMotoCount)) {
    return NextResponse.json({ error: 'Jumlah moto kualifikasi harus 2 atau 3.' }, { status: 400 })
  }
  if (config.batch_mode === 'MANUAL_BATCH_COUNT' && !config.batch_count) {
    return NextResponse.json({ error: 'Jumlah batch wajib diisi untuk mode batch manual.' }, { status: 400 })
  }
  if (config.batch_mode === 'CUSTOM_BATCH_SIZES' && config.custom_batch_sizes.length === 0) {
    return NextResponse.json({ error: 'Pola jumlah rider per batch wajib diisi.' }, { status: 400 })
  }

  const { data: settings, error: settingsError } = await adminClient
    .from('event_settings')
    .select('race_format_settings')
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 400 })
  const gatePositions = Math.max(1, Number(parseRaceFormatSettings(settings?.race_format_settings).gate_positions ?? 8))
  if (config.batch_mode === 'AUTO_BY_GATE' && config.batch_size && config.batch_size > gatePositions) {
    return NextResponse.json({ error: `Maksimal rider per batch tidak boleh lebih dari ${gatePositions} gate.` }, { status: 400 })
  }
  if (config.batch_mode === 'CUSTOM_BATCH_SIZES' && config.custom_batch_sizes.some((size) => size > gatePositions)) {
    return NextResponse.json({ error: `Setiap batch tidak boleh lebih dari ${gatePositions} gate.` }, { status: 400 })
  }

  const { data: category, error: categoryError } = await adminClient
    .from('categories')
    .select('id')
    .eq('id', categoryId)
    .eq('event_id', eventId)
    .maybeSingle()
  if (categoryError || !category) return NextResponse.json({ error: 'Kategori tidak ditemukan pada event ini.' }, { status: 404 })

  const { data, error } = await adminClient
    .from('race_stage_config')
    .upsert(
      [
        {
          event_id: eventId,
          category_id: categoryId,
          ...(qualificationMotoCount != null ? { qualification_moto_count: qualificationMotoCount } : {}),
          ...(singleBatchFinalEnabled != null ? { single_batch_final_enabled: singleBatchFinalEnabled } : {}),
          ...(singleBatchFinalEnabled ? { enabled: true } : {}),
          draw_batch_mode: config.batch_mode,
          draw_batch_size: config.batch_size,
          draw_batch_count: config.batch_count,
          draw_custom_batch_sizes: config.custom_batch_sizes,
          draw_moto2_order: config.moto2_order,
          draw_moto3_order: config.moto3_order,
        },
      ],
      { onConflict: 'event_id,category_id' }
    )
    .select('category_id, qualification_moto_count, single_batch_final_enabled, draw_batch_mode, draw_batch_size, draw_batch_count, draw_custom_batch_sizes, draw_moto2_order, draw_moto3_order')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({
    data: {
      category_id: data.category_id,
      qualification_moto_count: Math.max(2, Math.min(3, Number(data.qualification_moto_count ?? 2))),
      single_batch_final_enabled: data.single_batch_final_enabled === true,
      draw_config: normalizeDrawCategoryConfig({
        batch_mode: data.draw_batch_mode,
        batch_size: data.draw_batch_size,
        batch_count: data.draw_batch_count,
        custom_batch_sizes: data.draw_custom_batch_sizes,
        moto2_order: data.draw_moto2_order,
        moto3_order: data.draw_moto3_order,
      }),
    },
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const drawMode = body?.draw_mode === 'external_draw' ? 'external_draw' : body?.draw_mode === 'internal_live_draw' ? 'internal_live_draw' : null
  const qualificationBatchMode = body?.qualification_batch_mode
  const hasBatchMode = typeof qualificationBatchMode === 'string'
  if (!drawMode && !hasBatchMode) return NextResponse.json({ error: 'Pengaturan drawing kosong.' }, { status: 400 })
  if (hasBatchMode && !QUALIFICATION_BATCH_MODES.includes(qualificationBatchMode as (typeof QUALIFICATION_BATCH_MODES)[number])) {
    return NextResponse.json({ error: 'qualification_batch_mode tidak valid.' }, { status: 400 })
  }

  const { data: current, error: currentError } = await adminClient
    .from('event_settings')
    .select('race_format_settings')
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 })

  const currentRaceFormat = parseRaceFormatSettings(current?.race_format_settings)
  if (
    hasBatchMode &&
    normalizeQualificationBatchMode(currentRaceFormat.qualification_batch_mode) !== qualificationBatchMode
  ) {
    const { count, error: motoError } = await adminClient
      .from('motos')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
    if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Mode batch tidak bisa diubah setelah moto dibuat. Reset moto semua kategori dulu.' },
        { status: 409 }
      )
    }
  }
  const raceFormat = {
    ...currentRaceFormat,
    ...(drawMode ? { draw_mode: drawMode } : {}),
    ...(hasBatchMode ? { qualification_batch_mode: qualificationBatchMode } : {}),
  }
  const { error } = await adminClient
    .from('event_settings')
    .upsert([{ event_id: eventId, race_format_settings: raceFormat }], { onConflict: 'event_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({
    data: {
      ...(drawMode ? { draw_mode: drawMode } : {}),
      ...(hasBatchMode ? { qualification_batch_mode: qualificationBatchMode } : {}),
    },
  })
}
