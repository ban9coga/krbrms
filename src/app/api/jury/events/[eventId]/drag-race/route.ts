import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { resolveDragScoringFormat } from '../../../../../../lib/dragRaceScoring'
import { requireJury } from '../../../../../../services/juryAuth'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireJury(req, ['FINISHER', 'CHECKER', 'RACE_DIRECTOR', 'ADMIN', 'SUPER_ADMIN'], eventId)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const categoryId = new URL(req.url).searchParams.get('category_id')
  if (!categoryId) {
    const [{ data: categories, error: categoryListError }, { data: settings, error: settingsError }] = await Promise.all([
      adminClient.from('categories').select('id, label, enabled, scoring_format_override').eq('event_id', eventId).eq('enabled', true).order('sequence_order'),
      adminClient.from('event_settings').select('race_format_settings').eq('event_id', eventId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    if (categoryListError || settingsError) return NextResponse.json({ error: categoryListError?.message || settingsError?.message }, { status: 400 })
    const formatSettings = settings?.race_format_settings && typeof settings.race_format_settings === 'object' && !Array.isArray(settings.race_format_settings)
      ? settings.race_format_settings as Record<string, unknown> : {}
    const rows = (categories ?? []).map((category) => ({ ...category, scoring_format: resolveDragScoringFormat(formatSettings.scoring_format, category.scoring_format_override) }))
      .filter((category) => category.scoring_format !== 'MOTO_POINTS')
    return NextResponse.json({ data: { categories: rows } })
  }
  const [{ data: category, error: categoryError }, { data: heats, error: heatError }, { data: runs, error: runError }] = await Promise.all([
    adminClient.from('categories').select('id, label, event_id, scoring_format_override').eq('event_id', eventId).eq('id', categoryId).maybeSingle(),
    adminClient.from('drag_heats').select('id, scoring_format, round_number, round_label, heat_number, run_number, lane_a_rider_id, lane_b_rider_id, winner_rider_id, outcome, status').eq('event_id', eventId).eq('category_id', categoryId).order('round_number').order('heat_number'),
    adminClient.from('drag_run_results').select('heat_id, rider_id, run_number, lane, reaction_time_seconds, elapsed_time_seconds, jump_start, jump_penalty_seconds, total_seconds, result_status').eq('event_id', eventId).eq('category_id', categoryId).order('run_number'),
  ])
  if (categoryError || heatError || runError) return NextResponse.json({ error: categoryError?.message || heatError?.message || runError?.message }, { status: 400 })
  if (!category) return NextResponse.json({ error: 'Kategori tidak ditemukan.' }, { status: 404 })
  const riderIds = Array.from(new Set([...(heats ?? []).flatMap((heat) => [heat.lane_a_rider_id, heat.lane_b_rider_id, heat.winner_rider_id]), ...(runs ?? []).map((run) => run.rider_id)].filter((id): id is string => Boolean(id))))
  const [{ data: riders, error: riderError }, { data: eventSettings }] = await Promise.all([
    riderIds.length ? adminClient.from('riders').select('id, name, no_plate_display').in('id', riderIds) : Promise.resolve({ data: [], error: null }),
    adminClient.from('event_settings').select('race_format_settings').eq('event_id', eventId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })
  const formatSettings = eventSettings?.race_format_settings && typeof eventSettings.race_format_settings === 'object' && !Array.isArray(eventSettings.race_format_settings)
    ? eventSettings.race_format_settings as Record<string, unknown> : {}
  const scoringFormat = resolveDragScoringFormat(formatSettings.scoring_format, category.scoring_format_override)
  const bracketMode = scoringFormat === 'DRAG_MANUAL' || (scoringFormat === 'DRAG_TIMING' && (heats ?? []).length > 0 && (heats ?? []).every((heat) => heat.run_number === 1))
  return NextResponse.json({ data: { category, scoring_format: scoringFormat, bracket_mode: bracketMode, heats: heats ?? [], runs: runs ?? [], riders: riders ?? [] } })
}
