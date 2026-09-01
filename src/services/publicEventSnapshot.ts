import { adminClient } from '../lib/auth'
import { GET as getPublicLiveScore } from '../app/api/public/events/[eventId]/live-score/route'

type SnapshotEvent = {
  id: string
  name: string
  location: string | null
  event_date: string
  status: string
  is_public: boolean
  created_at: string
  updated_at: string
}

/**
 * Captures the public race source data exactly once an event is finished.
 * The public endpoints will consume this archive in the next caching step.
 */
export async function capturePublicEventSnapshot(eventId: string) {
  const { data: event, error: eventError } = await adminClient
    .from('events')
    .select('id, name, location, event_date, status, is_public, created_at, updated_at')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) throw new Error(eventError.message)
  if (!event) throw new Error('Event not found while creating public snapshot.')
  if (event.status !== 'FINISHED') throw new Error('Public snapshot can only be created for a FINISHED event.')

  const [
    settingsResult,
    categoriesResult,
    motosResult,
    ridersResult,
    resultsResult,
    participationResult,
    penaltiesResult,
    penaltyRulesResult,
  ] = await Promise.all([
    adminClient
      .from('event_settings')
      .select('event_id, event_logo_url, sponsor_logo_urls, display_theme, race_format_settings, business_settings, registration_open')
      .eq('event_id', eventId)
      .maybeSingle(),
    adminClient
      .from('categories')
      .select('id, event_id, year, year_min, year_max, capacity, gender, label, enabled, sequence_order')
      .eq('event_id', eventId)
      .order('sequence_order', { ascending: true }),
    adminClient
      .from('motos')
      .select('id, event_id, category_id, moto_name, moto_order, status, is_published, published_at, provisional_at, checker_prep_ready_at')
      .eq('event_id', eventId)
      .order('moto_order', { ascending: true }),
    adminClient
      .from('riders')
      .select('id, event_id, name, rider_nickname, primary_category_id, gender, no_plate_display, club, photo_url, photo_thumbnail_url')
      .eq('event_id', eventId),
    adminClient.from('results').select('moto_id, rider_id, finish_order, result_status').eq('event_id', eventId),
    adminClient
      .from('rider_participation_status')
      .select('moto_id, rider_id, participation_status')
      .eq('event_id', eventId),
    adminClient
      .from('rider_penalties')
      .select('id, rider_id, moto_id, stage, rule_code, penalty_point, note, created_at')
      .eq('event_id', eventId),
    adminClient
      .from('event_penalty_rules')
      .select('code, description, penalty_point, applies_to_stage, is_active')
      .eq('event_id', eventId),
  ])

  const queries = [
    settingsResult,
    categoriesResult,
    motosResult,
    ridersResult,
    resultsResult,
    participationResult,
    penaltiesResult,
    penaltyRulesResult,
  ]
  const failed = queries.find((result) => result.error)
  if (failed?.error) throw new Error(failed.error.message)

  const motoIds = (motosResult.data ?? []).map((moto) => moto.id)
  const categoryIds = (categoriesResult.data ?? []).map((category) => category.id)
  const [motoRidersResult, gatesResult, stageResultsResult] = await Promise.all([
    motoIds.length
      ? adminClient.from('moto_riders').select('moto_id, rider_id, created_at').in('moto_id', motoIds)
      : Promise.resolve({ data: [], error: null }),
    motoIds.length
      ? adminClient.from('moto_gate_positions').select('moto_id, rider_id, gate_position').in('moto_id', motoIds)
      : Promise.resolve({ data: [], error: null }),
    categoryIds.length
      ? adminClient
          .from('race_stage_result')
          .select('category_id, rider_id, stage, final_class, batch_id, position, points')
          .in('category_id', categoryIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  const dependentFailure = [motoRidersResult, gatesResult, stageResultsResult].find((result) => result.error)
  if (dependentFailure?.error) throw new Error(dependentFailure.error.message)

  const penalties = penaltiesResult.data ?? []
  const penaltyIds = penalties.map((penalty) => penalty.id)
  const approvalsResult = penaltyIds.length
    ? await adminClient
        .from('rider_penalty_approvals')
        .select('penalty_id, approval_status, approved_at, approved_by')
        .in('penalty_id', penaltyIds)
    : { data: [], error: null }
  if (approvalsResult.error) throw new Error(approvalsResult.error.message)

  const payload = {
    event: event as SnapshotEvent,
    settings: settingsResult.data ?? null,
    categories: categoriesResult.data ?? [],
    motos: motosResult.data ?? [],
    riders: ridersResult.data ?? [],
    moto_riders: motoRidersResult.data ?? [],
    moto_gate_positions: gatesResult.data ?? [],
    results: resultsResult.data ?? [],
    rider_participation_status: participationResult.data ?? [],
    race_stage_result: stageResultsResult.data ?? [],
    rider_penalties: penalties,
    rider_penalty_approvals: approvalsResult.data ?? [],
    event_penalty_rules: penaltyRulesResult.data ?? [],
    live_scores: {} as Record<string, unknown>,
  }

  const liveScores = await Promise.all(
    payload.categories.map(async (category) => {
      const response = await getPublicLiveScore(
        new Request(
          `https://racepushbike.local/api/public/events/${eventId}/live-score?category_id=${category.id}&include_upcoming=0&include_photos=1`,
          {
            headers: {
              'x-racepushbike-snapshot-refresh': process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
            },
          }
        ),
        { params: Promise.resolve({ eventId }) }
      )
      if (!response.ok) throw new Error(`Failed to archive live score for ${category.label}.`)
      const json = (await response.json()) as { data?: unknown }
      return [category.id, json.data ?? null] as const
    })
  )
  payload.live_scores = Object.fromEntries(liveScores)

  const { error: snapshotError } = await adminClient.from('event_public_snapshots').upsert(
    {
      event_id: eventId,
      schema_version: 1,
      payload,
      captured_at: new Date().toISOString(),
    },
    { onConflict: 'event_id' }
  )
  if (snapshotError) throw new Error(snapshotError.message)

  return {
    eventId,
    categories: payload.categories.length,
    motos: payload.motos.length,
    riders: payload.riders.length,
  }
}
