import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { assertMotoEditable, assertMotoNotUnderProtest } from '../../../../../../lib/motoLock'
import { requireJury } from '../../../../../../services/juryAuth'

type PenaltyStage = 'ALL' | 'MOTO' | 'QUARTER' | 'SEMI' | 'FINAL'

const validStages: PenaltyStage[] = ['ALL', 'MOTO', 'QUARTER', 'SEMI', 'FINAL']

export async function POST(req: Request, { params }: { params: Promise<{ riderId: string }> }) {
  const { riderId } = await params
  const body = await req.json().catch(() => ({}))
  const {
    event_id,
    stage,
    rule_code,
    note,
    moto_id,
  }: {
    event_id?: string
    stage?: PenaltyStage
    rule_code?: string
    note?: string | null
    moto_id?: string | null
  } = body ?? {}

  if (!event_id || !rule_code) {
    return NextResponse.json({ error: 'event_id and rule_code required' }, { status: 400 })
  }

  const auth = await requireJury(req, ['RACE_DIRECTOR', 'SUPER_ADMIN'], event_id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: rule, error: ruleError } = await adminClient
    .from('event_penalty_rules')
    .select('code, penalty_point, applies_to_stage, is_active, rd_enabled')
    .eq('event_id', event_id)
    .eq('code', rule_code)
    .maybeSingle()

  if (ruleError) return NextResponse.json({ error: ruleError.message }, { status: 400 })
  if (!rule || !rule.is_active) {
    return NextResponse.json({ error: 'Penalty rule not found or inactive.' }, { status: 400 })
  }
  if (!rule.rd_enabled) {
    return NextResponse.json({ error: 'Penalty rule not enabled for Race Director usage.' }, { status: 400 })
  }

  const requestedStage = typeof stage === 'string' && validStages.includes(stage) ? stage : null
  const resolvedStage = (requestedStage ?? (rule.applies_to_stage as PenaltyStage | null) ?? 'ALL') as PenaltyStage
  if (!validStages.includes(resolvedStage)) {
    return NextResponse.json({ error: 'Invalid stage.' }, { status: 400 })
  }
  if (rule.applies_to_stage !== 'ALL' && rule.applies_to_stage !== resolvedStage) {
    return NextResponse.json({ error: 'Rule not applicable to selected stage.' }, { status: 400 })
  }

  if (resolvedStage === 'MOTO' && !moto_id) {
    return NextResponse.json({ error: 'moto_id required for MOTO stage penalty.' }, { status: 400 })
  }

  if (moto_id) {
    const { data: moto, error: motoError } = await adminClient
      .from('motos')
      .select('id, event_id, status')
      .eq('id', moto_id)
      .maybeSingle()
    if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })
    if (!moto || moto.event_id !== event_id) {
      return NextResponse.json({ error: 'Moto not found for this event.' }, { status: 400 })
    }
    try {
      assertMotoEditable((moto as { status?: string | null })?.status ?? null)
      assertMotoNotUnderProtest((moto as { status?: string | null })?.status ?? null)
    } catch (err: unknown) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Moto not editable.' },
        { status: 409 }
      )
    }
  }

  const { data: rider, error: riderError } = await adminClient
    .from('riders')
    .select('id, event_id')
    .eq('id', riderId)
    .maybeSingle()
  if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })
  if (!rider || rider.event_id !== event_id) {
    return NextResponse.json({ error: 'Rider not found for this event.' }, { status: 400 })
  }

  const { data: penalty, error: insertError } = await adminClient
    .from('rider_penalties')
    .insert([
      {
        rider_id: riderId,
        event_id,
        moto_id: moto_id ?? null,
        stage: resolvedStage,
        rule_code: rule.code,
        penalty_point: rule.penalty_point,
        note: note?.trim() || null,
      },
    ])
    .select('id, rider_id, event_id, moto_id, stage, rule_code, penalty_point, note, created_at')
    .single()

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 })

  const approvalTimestamp = new Date().toISOString()
  const approverId = auth.user.id
  const { error: approvalError } = await adminClient.from('rider_penalty_approvals').insert([
    {
      penalty_id: penalty.id,
      approval_status: 'APPROVED',
      approved_by: approverId,
      approved_at: approvalTimestamp,
    },
  ])
  if (approvalError) return NextResponse.json({ error: approvalError.message }, { status: 400 })

  await adminClient.from('audit_log').insert([
    {
      action_type: 'RIDER_PENALTY_ADD',
      performed_by: approverId,
      rider_id: riderId,
      moto_id: moto_id ?? null,
      event_id,
      reason: note?.trim() || `Rule ${rule.code} applied by Race Director`,
    },
    {
      action_type: 'PENALTY_APPROVAL',
      performed_by: approverId,
      rider_id: riderId,
      moto_id: moto_id ?? null,
      event_id,
      reason: note?.trim() || `Rule ${rule.code} approved immediately by Race Director`,
    },
  ])

  return NextResponse.json({ data: penalty })
}
