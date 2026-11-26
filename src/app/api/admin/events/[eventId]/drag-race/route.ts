import { randomInt } from 'node:crypto'
import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'
import { riderBelongsToPrimaryCategory, type CategoryAssignmentItem } from '../../../../../../lib/categoryAssignment'
import { buildDragManualBracket, resolveDragScoringFormat } from '../../../../../../lib/dragRaceScoring'
import { broadcastRaceState } from '../../../../../../lib/broadcastRaceState'

type Rider = { id: string; name: string; no_plate_display: string; birth_year: number; date_of_birth: string | null; gender: 'BOY' | 'GIRL'; primary_category_id?: string | null }

const shuffle = <T,>(items: T[]) => {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

async function getFormat(eventId: string, categoryId: string) {
  const [{ data: category, error: categoryError }, { data: settings, error: settingsError }] = await Promise.all([
    adminClient.from('categories').select('id, event_id, label, enabled, year, year_min, year_max, category_basis, age_min, age_max, gender, scoring_format_override').eq('id', categoryId).eq('event_id', eventId).maybeSingle(),
    adminClient.from('event_settings').select('race_format_settings').eq('event_id', eventId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (categoryError || settingsError) throw new Error(categoryError?.message || settingsError?.message || 'Gagal memuat kategori.')
  if (!category) throw new Error('Kategori tidak ditemukan.')
  const settingsRecord = settings?.race_format_settings && typeof settings.race_format_settings === 'object' && !Array.isArray(settings.race_format_settings)
    ? settings.race_format_settings as Record<string, unknown>
    : {}
  const format = resolveDragScoringFormat(settingsRecord.scoring_format, category.scoring_format_override)
  return { category, format }
}

async function getCategoryRiders(eventId: string, category: CategoryAssignmentItem & { id: string }) {
  const [{ data: event, error: eventError }, { data: extras, error: extraError }] = await Promise.all([
    adminClient.from('events').select('event_date').eq('id', eventId).maybeSingle(),
    adminClient.from('rider_extra_categories').select('rider_id').eq('event_id', eventId).eq('category_id', String(category.id)),
  ])
  if (eventError || extraError) throw new Error(eventError?.message || extraError?.message || 'Gagal memuat rider.')
  const { data, error } = await adminClient.from('riders')
    .select('id, name, no_plate_display, birth_year, date_of_birth, gender, primary_category_id')
    .eq('event_id', eventId)
  if (error) throw new Error(error.message)
  const extraIds = new Set((extras ?? []).map((row) => row.rider_id))
  const selected = ((data ?? []) as Rider[]).filter((rider) => extraIds.has(rider.id) || riderBelongsToPrimaryCategory(rider, category, event?.event_date ?? null))
  return selected.sort((a, b) => a.name.localeCompare(b.name))
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const categoryId = new URL(req.url).searchParams.get('category_id')
  try {
    if (!categoryId) {
      const [{ data: rows, error: categoryError }, { data: settings, error: settingsError }] = await Promise.all([
        adminClient.from('categories').select('id, label, scoring_format_override').eq('event_id', eventId).eq('enabled', true).order('sequence_order'),
        adminClient.from('event_settings').select('race_format_settings').eq('event_id', eventId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (categoryError || settingsError) throw new Error(categoryError?.message || settingsError?.message || 'Gagal memuat kategori.')
      const eventSettings = settings?.race_format_settings && typeof settings.race_format_settings === 'object' && !Array.isArray(settings.race_format_settings) ? settings.race_format_settings as Record<string, unknown> : {}
      const defaultFormat = resolveDragScoringFormat(eventSettings.scoring_format)
      return NextResponse.json({ data: { default_format: defaultFormat, categories: (rows ?? []).map((category) => ({ ...category, scoring_format: resolveDragScoringFormat(defaultFormat, category.scoring_format_override) })) } })
    }
    const { category, format } = await getFormat(eventId, categoryId)
    if (format === 'MOTO_POINTS') return NextResponse.json({ error: 'Kategori ini masih memakai format Moto.' }, { status: 409 })
    const [{ data: heats, error: heatError }, { data: runs, error: runError }, { data: finalResults, error: finalError }] = await Promise.all([
      adminClient.from('drag_heats').select('id, scoring_format, round_number, round_label, heat_number, run_number, lane_a_rider_id, lane_b_rider_id, winner_rider_id, outcome, status, next_heat_id, next_slot').eq('event_id', eventId).eq('category_id', categoryId).order('round_number').order('heat_number'),
      adminClient.from('drag_run_results').select('id, heat_id, rider_id, run_number, lane, reaction_time_seconds, elapsed_time_seconds, jump_start, jump_penalty_seconds, total_seconds, result_status, recorded_at').eq('event_id', eventId).eq('category_id', categoryId).order('run_number'),
      adminClient.from('drag_final_results').select('rider_id, position, final_class, total_seconds, finalized_at').eq('event_id', eventId).eq('category_id', categoryId).order('position'),
    ])
    if (heatError || runError || finalError) throw new Error(heatError?.message || runError?.message || finalError?.message || 'Gagal memuat hasil Drag Race.')
    const riderIds = Array.from(new Set([...(heats ?? []).flatMap((heat) => [heat.lane_a_rider_id, heat.lane_b_rider_id, heat.winner_rider_id]), ...(runs ?? []).map((run) => run.rider_id)].filter((id): id is string => Boolean(id))))
    const { data: riders, error: ridersError } = riderIds.length
      ? await adminClient.from('riders').select('id, name, no_plate_display').in('id', riderIds)
      : { data: [], error: null }
    if (ridersError) throw new Error(ridersError.message)
    const bracketMode = format === 'DRAG_MANUAL' || (format === 'DRAG_TIMING' && (heats ?? []).length > 0 && (heats ?? []).every((heat) => heat.run_number === 1))
    return NextResponse.json({ data: { category: { id: category.id, label: category.label }, scoring_format: format, bracket_mode: bracketMode, heats: heats ?? [], runs: runs ?? [], riders: riders ?? [], final_results: finalResults ?? [] } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Gagal memuat Drag Race.' }, { status: 400 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const categoryId = typeof body?.category_id === 'string' ? body.category_id : ''
  if (!categoryId) return NextResponse.json({ error: 'Pilih kategori.' }, { status: 400 })
  try {
    const { category, format } = await getFormat(eventId, categoryId)
    if (format === 'MOTO_POINTS') return NextResponse.json({ error: 'Atur format kategori ke Drag Race sebelum membuat drawing.' }, { status: 409 })
    const [{ data: existingHeats, error: existingHeatError }, { data: existingMotos, error: existingMotoError }, riders] = await Promise.all([
      adminClient.from('drag_heats').select('id').eq('event_id', eventId).eq('category_id', categoryId).limit(1),
      adminClient.from('motos').select('id').eq('event_id', eventId).eq('category_id', categoryId).limit(1),
      getCategoryRiders(eventId, category as unknown as CategoryAssignmentItem & { id: string }),
    ])
    if (existingHeatError || existingMotoError) throw new Error(existingHeatError?.message || existingMotoError?.message || 'Gagal memeriksa drawing lama.')
    if ((existingHeats ?? []).length || (existingMotos ?? []).length) return NextResponse.json({ error: 'Drawing sudah ada untuk kategori ini.' }, { status: 409 })
    if (riders.length < 2) return NextResponse.json({ error: 'Minimal dua rider terdaftar diperlukan.' }, { status: 400 })
    const shuffled = shuffle(riders.map((rider) => rider.id))
    const rows = buildDragManualBracket(shuffled).map((heat) => ({
          id: heat.id, event_id: eventId, category_id: categoryId, scoring_format: format,
          round_number: heat.roundNumber, round_label: heat.roundLabel, heat_number: heat.heatNumber,
          run_number: format === 'DRAG_TIMING' ? 1 : null,
          lane_a_rider_id: heat.riderLaneAId, lane_b_rider_id: heat.riderLaneBId,
          winner_rider_id: heat.winnerRiderId, outcome: heat.outcome, status: heat.status,
          next_heat_id: heat.nextHeatId, next_slot: heat.nextSlot, created_by: auth.user.id,
        }))
    const { error } = await adminClient.from('drag_heats').insert(rows)
    if (error) throw new Error(error.message)
    await broadcastRaceState(eventId, null, categoryId)
    return NextResponse.json({ data: { created: rows.length, rider_count: riders.length, scoring_format: format, bracket_mode: true } }, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Gagal membuat drawing Drag Race.' }, { status: 400 })
  }
}
