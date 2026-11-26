import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../../lib/auth'
import { broadcastRaceState } from '../../../../../../../lib/broadcastRaceState'
import { rankTimedDragRiders, type DragTimedRider } from '../../../../../../../lib/dragRaceScoring'
import { resolveDragScoringFormat } from '../../../../../../../lib/dragRaceScoring'

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const categoryId = typeof body?.category_id === 'string' ? body.category_id : ''
  if (!categoryId) return NextResponse.json({ error: 'Pilih kategori.' }, { status: 400 })
  const [{ data: category, error: categoryError }, { data: setting, error: settingError }, { data: heats, error: heatError }, { data: runs, error: runError }] = await Promise.all([
    adminClient.from('categories').select('id, label, scoring_format_override').eq('id', categoryId).eq('event_id', eventId).maybeSingle(),
    adminClient.from('event_settings').select('race_format_settings').eq('event_id', eventId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    adminClient.from('drag_heats').select('id, scoring_format, round_number, round_label, heat_number, run_number, lane_a_rider_id, lane_b_rider_id, winner_rider_id, outcome, status').eq('event_id', eventId).eq('category_id', categoryId).order('round_number').order('heat_number'),
    adminClient.from('drag_run_results').select('heat_id, rider_id, run_number, reaction_time_seconds, elapsed_time_seconds, jump_start, jump_penalty_seconds, total_seconds, result_status').eq('event_id', eventId).eq('category_id', categoryId).order('run_number'),
  ])
  if (categoryError || settingError || heatError || runError) return NextResponse.json({ error: categoryError?.message || settingError?.message || heatError?.message || runError?.message }, { status: 400 })
  if (!category || !heats?.length) return NextResponse.json({ error: 'Kategori atau drawing Drag Race tidak ditemukan.' }, { status: 404 })
  const settings = setting?.race_format_settings && typeof setting.race_format_settings === 'object' && !Array.isArray(setting.race_format_settings) ? setting.race_format_settings as Record<string, unknown> : {}
  const format = resolveDragScoringFormat(settings.scoring_format, category.scoring_format_override)
  if (format === 'MOTO_POINTS') return NextResponse.json({ error: 'Kategori ini memakai format Moto.' }, { status: 409 })
  if (heats.some((heat) => heat.status !== 'COMPLETE')) return NextResponse.json({ error: 'Semua heat/run harus selesai sebelum hasil difinalisasi.' }, { status: 409 })

  const riderIds = Array.from(new Set(heats.flatMap((heat) => [heat.lane_a_rider_id, heat.lane_b_rider_id]).filter((id): id is string => Boolean(id))))
  let finalRows: Array<{ rider_id: string; position: number; total_seconds: number | null }> = []
  const timingBracket = format === 'DRAG_TIMING' && heats.every((heat) => heat.run_number === 1)
  if (format === 'DRAG_MANUAL' || timingBracket) {
    const finalRound = Math.max(...heats.map((heat) => heat.round_number))
    const finalHeat = heats.find((heat) => heat.round_number === finalRound)
    if (!finalHeat?.winner_rider_id) return NextResponse.json({ error: 'Pemenang Final belum ditentukan.' }, { status: 409 })
    const finalist = [finalHeat.lane_a_rider_id, finalHeat.lane_b_rider_id].find((id) => id && id !== finalHeat.winner_rider_id)
    if (!finalist) return NextResponse.json({ error: 'Heat Final harus berisi dua rider.' }, { status: 409 })
    const totalByRider = new Map<string, number>()
    for (const run of runs ?? []) {
      if (run.total_seconds != null) totalByRider.set(run.rider_id, (totalByRider.get(run.rider_id) ?? 0) + Number(run.total_seconds))
    }
    finalRows.push(
      { rider_id: finalHeat.winner_rider_id, position: 1, total_seconds: timingBracket ? totalByRider.get(finalHeat.winner_rider_id) ?? null : null },
      { rider_id: finalist, position: 2, total_seconds: timingBracket ? totalByRider.get(finalist) ?? null : null },
    )
    for (let roundNumber = finalRound - 1; roundNumber >= 1; roundNumber -= 1) {
      const eliminated: string[] = []
      for (const heat of heats.filter((row) => row.round_number === roundNumber && row.outcome !== 'BYE')) {
        if (!heat.winner_rider_id) return NextResponse.json({ error: `Heat ${heat.round_label} ${heat.heat_number} belum memiliki pemenang.` }, { status: 409 })
        const loserId = [heat.lane_a_rider_id, heat.lane_b_rider_id].find((id) => id && id !== heat.winner_rider_id)
        if (loserId) eliminated.push(loserId)
      }
      const position = 2 ** (finalRound - roundNumber) + 1
      finalRows.push(...eliminated.map((rider_id) => ({ rider_id, position, total_seconds: timingBracket ? totalByRider.get(rider_id) ?? null : null })))
    }
  } else {
    const byRider = new Map<string, DragTimedRider['runs']>()
    for (const run of runs ?? []) {
      const riderRuns = byRider.get(run.rider_id) ?? []
      riderRuns.push({
        status: run.result_status,
        reactionTimeSeconds: run.reaction_time_seconds == null ? null : Number(run.reaction_time_seconds),
        elapsedTimeSeconds: run.elapsed_time_seconds == null ? null : Number(run.elapsed_time_seconds),
        jumpStart: run.jump_start,
        jumpPenaltySeconds: Number(run.jump_penalty_seconds ?? 0),
        totalSeconds: run.total_seconds == null ? null : Number(run.total_seconds),
      })
      byRider.set(run.rider_id, riderRuns)
    }
    const ranking = rankTimedDragRiders(riderIds.map((rider_id) => ({ riderId: rider_id, runs: byRider.get(rider_id) ?? [] })))
    if (ranking.some((row) => row.status !== 'COMPLETE')) return NextResponse.json({ error: 'Setiap rider perlu dua hasil FINISH sebelum klasemen waktu difinalisasi.' }, { status: 409 })
    if (ranking.some((row) => row.needsRunoff)) return NextResponse.json({ error: 'Ada hasil seri sampai RT. Regulasi meminta race tambahan; selesaikan tie-break sebelum finalisasi.' }, { status: 409 })
    finalRows = ranking.map((row, index) => ({ rider_id: row.riderId, position: index + 1, total_seconds: row.totalSeconds }))
  }
  if (new Set(finalRows.map((row) => row.rider_id)).size !== riderIds.length) return NextResponse.json({ error: 'Ranking belum mencakup seluruh rider drawing.' }, { status: 409 })
  const { data: finalizedCount, error: finalizeError } = await adminClient.rpc('finalize_drag_category_results', {
    p_event_id: eventId, p_category_id: categoryId, p_scoring_format: format, p_results: finalRows, p_actor_id: auth.user.id,
  })
  if (finalizeError) return NextResponse.json({ error: finalizeError.message }, { status: 409 })
  await broadcastRaceState(eventId, null, categoryId)
  return NextResponse.json({ data: { finalized: Number(finalizedCount ?? finalRows.length), scoring_format: format } })
}
