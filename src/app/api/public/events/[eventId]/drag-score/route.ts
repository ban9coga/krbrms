import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { rankTimedDragRiders, type DragTimedRider } from '../../../../../../lib/dragRaceScoring'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const categoryId = new URL(req.url).searchParams.get('category_id')
  if (!categoryId) return NextResponse.json({ error: 'category_id required' }, { status: 400 })
  const [{ data: event, error: eventError }, { data: category, error: categoryError }, { data: setting, error: settingError }] = await Promise.all([
    adminClient.from('events').select('id, name, status, is_public').eq('id', eventId).maybeSingle(),
    adminClient.from('categories').select('id, event_id, label, enabled, scoring_format_override').eq('id', categoryId).eq('event_id', eventId).maybeSingle(),
    adminClient.from('event_settings').select('race_format_settings').eq('event_id', eventId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (eventError || categoryError || settingError) return NextResponse.json({ error: 'Gagal memuat hasil Drag Race.' }, { status: 400 })
  if (!event || event.is_public === false || !category || category.enabled === false) return NextResponse.json({ error: 'Hasil tidak tersedia.' }, { status: 404 })
  const settings = setting?.race_format_settings && typeof setting.race_format_settings === 'object' && !Array.isArray(setting.race_format_settings)
    ? setting.race_format_settings as Record<string, unknown>
    : {}
  if (settings.event_scope === 'INTERNAL') return NextResponse.json({ error: 'Hasil tidak tersedia.' }, { status: 404 })
  const allowed = ['MOTO_POINTS', 'DRAG_MANUAL', 'DRAG_TIMING']
  const override = category.scoring_format_override
  const format = typeof override === 'string' && allowed.includes(override)
    ? override
    : typeof settings.scoring_format === 'string' && allowed.includes(settings.scoring_format) ? settings.scoring_format : 'MOTO_POINTS'
  if (format === 'MOTO_POINTS') return NextResponse.json({ error: 'Kategori ini memakai format Moto.' }, { status: 409 })

  const [{ data: heats, error: heatsError }, { data: runRows, error: runsError }, { data: finalRows, error: finalsError }] = await Promise.all([
    adminClient.from('drag_heats').select('id, round_number, round_label, heat_number, run_number, lane_a_rider_id, lane_b_rider_id, winner_rider_id, outcome, status').eq('event_id', eventId).eq('category_id', categoryId).eq('scoring_format', format).order('round_number').order('heat_number'),
    adminClient.from('drag_run_results').select('heat_id, rider_id, run_number, lane, reaction_time_seconds, elapsed_time_seconds, jump_start, jump_penalty_seconds, total_seconds, result_status').eq('event_id', eventId).eq('category_id', categoryId).order('run_number'),
    adminClient.from('drag_final_results').select('rider_id, position, final_class, total_seconds').eq('event_id', eventId).eq('category_id', categoryId).order('position'),
  ])
  if (heatsError || runsError || finalsError) return NextResponse.json({ error: 'Gagal memuat heat atau hasil.' }, { status: 400 })
  const bracketMode = format === 'DRAG_MANUAL' || (format === 'DRAG_TIMING' && (heats ?? []).length > 0 && (heats ?? []).every((heat) => heat.run_number === 1))
  const allRiderIds = Array.from(new Set([...(heats ?? []).flatMap((heat) => [heat.lane_a_rider_id, heat.lane_b_rider_id]), ...(runRows ?? []).map((run) => run.rider_id)].filter((id): id is string => Boolean(id))))
  const { data: riders, error: riderError } = allRiderIds.length
    ? await adminClient.from('riders').select('id, name, no_plate_display, club').in('id', allRiderIds)
    : { data: [], error: null }
  if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })
  const riderMap = new Map((riders ?? []).map((rider) => [rider.id, rider]))
  const visibleRider = (id: string | null) => id ? riderMap.get(id) ?? null : null
  const runs = (runRows ?? []).map((run) => ({ ...run, rider: visibleRider(run.rider_id) }))
  let standings: ReturnType<typeof rankTimedDragRiders> = []
  if (format === 'DRAG_TIMING') {
    const byRider = new Map<string, DragTimedRider['runs']>()
    for (const row of runRows ?? []) {
      const rows = byRider.get(row.rider_id) ?? []
      rows.push({
        status: row.result_status,
        reactionTimeSeconds: row.reaction_time_seconds == null ? null : Number(row.reaction_time_seconds),
        elapsedTimeSeconds: row.elapsed_time_seconds == null ? null : Number(row.elapsed_time_seconds),
        jumpStart: row.jump_start,
        jumpPenaltySeconds: Number(row.jump_penalty_seconds ?? 0),
        totalSeconds: row.total_seconds == null ? null : Number(row.total_seconds),
      })
      byRider.set(row.rider_id, rows)
    }
    standings = rankTimedDragRiders(allRiderIds.map((riderId) => ({ riderId, runs: byRider.get(riderId) ?? [] })) as DragTimedRider[])
      .map((row) => ({ ...row, rider: visibleRider(row.riderId) })) as typeof standings
  }
  const response = NextResponse.json({ data: {
    event: { name: event.name, status: event.status }, category: { id: category.id, label: category.label },
    scoring_format: format, bracket_mode: bracketMode, heats: (heats ?? []).map((heat) => ({ ...heat, lane_a_rider: visibleRider(heat.lane_a_rider_id), lane_b_rider: visibleRider(heat.lane_b_rider_id), winner: visibleRider(heat.winner_rider_id) })),
    runs, standings, final_results: finalRows ?? [],
  } })
  response.headers.set('Cache-Control', event.status === 'FINISHED' ? 'public, s-maxage=120, stale-while-revalidate=600' : 'public, s-maxage=5, stale-while-revalidate=20')
  response.headers.set('Vary', 'Accept-Encoding')
  return response
}
