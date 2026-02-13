import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { PENALTY_DEFINITIONS } from '../../../../../../lib/penaltyDefinitions'
import { requireJury } from '../../../../../../services/juryAuth'

const getApprovalMode = async (eventId: string) => {
  const { data } = await adminClient
    .from('event_approval_modes')
    .select('approval_mode')
    .eq('event_id', eventId)
    .maybeSingle()
  return (data?.approval_mode as 'AUTO' | 'DIRECTOR') ?? 'AUTO'
}

const isLockedMoto = async (motoId?: string | null) => {
  if (!motoId) return false
  const { data } = await adminClient
    .from('moto_locks')
    .select('moto_id, is_locked')
    .eq('moto_id', motoId)
    .eq('is_locked', true)
    .maybeSingle()
  return !!data
}

export async function POST(req: Request, { params }: { params: Promise<{ riderId: string }> }) {
  const auth = await requireJury(req, ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { riderId } = await params
  const body = await req.json()
  const { event_id, stage = 'MOTO', rule_code, note, moto_id } = body ?? {}
  if (!event_id || !rule_code) {
    return NextResponse.json({ error: 'event_id and rule_code required' }, { status: 400 })
  }

  if (auth.role === 'RACE_DIRECTOR') {
    return NextResponse.json({ error: 'Read-only for RACE_DIRECTOR' }, { status: 403 })
  }

  if (await isLockedMoto(moto_id)) {
    return NextResponse.json({ error: 'Moto locked. Updates disabled.' }, { status: 409 })
  }

  const approvalMode = await getApprovalMode(event_id)

  const { data: rule, error: ruleError } = await adminClient
    .from('event_penalty_rules')
    .select('code, penalty_point, applies_to_stage, is_active')
    .eq('event_id', event_id)
    .eq('code', rule_code)
    .maybeSingle()

  let resolvedRule = rule
  if (ruleError) return NextResponse.json({ error: ruleError.message }, { status: 400 })

  if (!resolvedRule) {
    const def = PENALTY_DEFINITIONS.find((p) => p.id === rule_code)
    if (!def) {
      return NextResponse.json({ error: 'Rule not found or inactive' }, { status: 400 })
    }
    const { data: created, error: createError } = await adminClient
      .from('event_penalty_rules')
      .insert([
        {
          event_id,
          code: def.id,
          description: def.description,
          penalty_point: def.points,
          applies_to_stage: 'MOTO',
          is_active: true,
        },
      ])
      .select('code, penalty_point, applies_to_stage, is_active')
      .single()
    if (createError) return NextResponse.json({ error: createError.message }, { status: 400 })
    resolvedRule = created
  }

  if (!resolvedRule?.is_active) {
    return NextResponse.json({ error: 'Rule not found or inactive' }, { status: 400 })
  }

  const applies = resolvedRule.applies_to_stage
  if (stage !== 'MOTO') {
    return NextResponse.json({ error: 'Invalid stage for jury' }, { status: 400 })
  }
  if (applies !== 'ALL' && applies !== stage) {
    return NextResponse.json({ error: 'Rule not applicable to this stage' }, { status: 400 })
  }

  const { data, error } = await adminClient
    .from('rider_penalties')
    .insert([
      {
        rider_id: riderId,
        event_id,
        stage,
        rule_code: resolvedRule.code,
        penalty_point: resolvedRule.penalty_point,
        note: note ?? null,
      },
    ])
    .select('id, rider_id, event_id, stage, rule_code, penalty_point, note, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await adminClient.from('rider_penalty_approvals').insert([
    {
      penalty_id: data.id,
      approval_status: approvalMode === 'AUTO' ? 'APPROVED' : 'PENDING',
      approved_by: approvalMode === 'AUTO' ? 'SYSTEM' : null,
      approved_at: approvalMode === 'AUTO' ? new Date().toISOString() : null,
    },
  ])

  await adminClient.from('audit_log').insert([
    {
      action_type: 'PENALTY_APPROVAL',
      performed_by: approvalMode === 'AUTO' ? 'SYSTEM' : auth.user.id,
      rider_id: riderId,
      event_id,
      reason: approvalMode === 'AUTO' ? 'AUTO mode: penalty applied' : 'Penalty submitted',
    },
  ])

  return NextResponse.json({ data })
}
