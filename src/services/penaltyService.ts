'use server'

import { adminClient } from '../lib/auth'
import { assertMotoEditable } from '../lib/motoLock'

export type PenaltyStage = 'MOTO' | 'QUARTER' | 'SEMI' | 'FINAL' | 'ALL'

export type PenaltyRule = {
  id: string
  event_id: string
  code: string
  description: string | null
  penalty_point: number
  applies_to_stage: PenaltyStage
  is_active: boolean
}

export async function listPenaltyRules(eventId: string) {
  const { data, error } = await adminClient
    .from('event_penalty_rules')
    .select('id, event_id, code, description, penalty_point, applies_to_stage, is_active')
    .eq('event_id', eventId)
    .order('code', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as PenaltyRule[]
}

export async function clonePenaltyRules(fromEventId: string, toEventId: string) {
  const rules = await listPenaltyRules(fromEventId)
  if (rules.length === 0) return { inserted: 0 }
  const payload = rules.map((r) => ({
    event_id: toEventId,
    code: r.code,
    description: r.description,
    penalty_point: r.penalty_point,
    applies_to_stage: r.applies_to_stage,
    is_active: r.is_active,
  }))
  const { error } = await adminClient.from('event_penalty_rules').insert(payload)
  if (error) throw new Error(error.message)
  return { inserted: payload.length }
}

export async function addRiderPenalty(params: {
  rider_id: string
  event_id: string
  stage: PenaltyStage
  rule_code: string
  penalty_point: number
  note?: string | null
  moto_status?: string | null
}) {
  assertMotoEditable(params.moto_status ?? null)
  const { error } = await adminClient.from('rider_penalties').insert([
    {
      rider_id: params.rider_id,
      event_id: params.event_id,
      stage: params.stage,
      rule_code: params.rule_code,
      penalty_point: params.penalty_point,
      note: params.note ?? null,
    },
  ])
  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function sumPenaltyPoints(params: {
  event_id: string
  rider_id: string
  stage: PenaltyStage
}) {
  const { data, error } = await adminClient
    .from('rider_penalties')
    .select('penalty_point')
    .eq('event_id', params.event_id)
    .eq('rider_id', params.rider_id)
    .in('stage', [params.stage, 'ALL'])
  if (error) throw new Error(error.message)
  const total = (data ?? []).reduce((acc, row) => acc + (row.penalty_point ?? 0), 0)
  return { total }
}
