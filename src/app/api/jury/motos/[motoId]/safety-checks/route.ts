import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { assertMotoEditable, assertMotoNotUnderProtest } from '../../../../../../lib/motoLock'
import { isMotoLive, isMotoUpcoming } from '../../../../../../lib/motoStatus'
import { requireJury } from '../../../../../../services/juryAuth'

const getMotoEvent = async (motoId: string) => {
  const { data, error } = await adminClient
    .from('motos')
    .select('id, event_id, status')
    .eq('id', motoId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Moto not found')
  return data
}

type SafetyCheckInput = {
  rider_id?: unknown
  requirement_id?: unknown
  is_checked?: unknown
}

type SafetyCheckRow = {
  rider_id: string
  requirement_id: string
  is_checked: boolean
}

const parseSafetyCheck = (input: SafetyCheckInput): SafetyCheckRow | null => {
  if (
    typeof input.rider_id !== 'string' ||
    typeof input.requirement_id !== 'string' ||
    typeof input.is_checked !== 'boolean'
  ) {
    return null
  }

  return {
    rider_id: input.rider_id,
    requirement_id: input.requirement_id,
    is_checked: input.is_checked,
  }
}

const syncSafetyPenalty = async ({
  authUserId,
  eventId,
  motoId,
  motoStatus,
  check,
}: {
  authUserId: string | null
  eventId: string
  motoId: string
  motoStatus: string
  check: SafetyCheckRow
}) => {
  const { data: requirement, error: requirementError } = await adminClient
    .from('event_safety_requirements')
    .select('id, label, penalty_code')
    .eq('event_id', eventId)
    .eq('id', check.requirement_id)
    .maybeSingle()

  if (requirementError) throw new Error(requirementError.message)

  const noteTag = `AUTO_SAFETY_REQUIREMENT:${check.requirement_id}`
  const shouldManagePenalty =
    (isMotoLive(motoStatus) || isMotoUpcoming(motoStatus)) &&
    typeof requirement?.penalty_code === 'string' &&
    requirement.penalty_code.trim().length > 0

  if (!shouldManagePenalty) return

  const ruleCode = requirement.penalty_code!.trim()
  const { data: rule, error: ruleError } = await adminClient
    .from('event_penalty_rules')
    .select('code, penalty_point, is_active, checker_enabled, applies_to_stage')
    .eq('event_id', eventId)
    .eq('code', ruleCode)
    .maybeSingle()

  if (ruleError) throw new Error(ruleError.message)

  if (!rule?.is_active || !rule?.checker_enabled || (rule.applies_to_stage !== 'ALL' && rule.applies_to_stage !== 'MOTO')) {
    return
  }

  const { data: existingPenalties, error: existingPenaltyError } = await adminClient
    .from('rider_penalties')
    .select('id')
    .eq('event_id', eventId)
    .eq('moto_id', motoId)
    .eq('rider_id', check.rider_id)
    .eq('stage', 'MOTO')
    .eq('rule_code', ruleCode)
    .eq('note', noteTag)

  if (existingPenaltyError) throw new Error(existingPenaltyError.message)

  const existingPenaltyIds = (existingPenalties ?? []).map((row) => row.id)

  if (!check.is_checked && existingPenaltyIds.length === 0) {
    const { data: insertedPenalty, error: insertPenaltyError } = await adminClient
      .from('rider_penalties')
      .insert([
        {
          rider_id: check.rider_id,
          event_id: eventId,
          moto_id: motoId,
          stage: 'MOTO',
          rule_code: ruleCode,
          penalty_point: rule.penalty_point,
          note: noteTag,
        },
      ])
      .select('id')
      .single()

    if (insertPenaltyError) throw new Error(insertPenaltyError.message)

    if (insertedPenalty?.id) {
      const now = new Date().toISOString()
      const { error: approvalInsertError } = await adminClient
        .from('rider_penalty_approvals')
        .insert([
          {
            penalty_id: insertedPenalty.id,
            approval_status: 'APPROVED',
            approved_by: authUserId ?? 'SYSTEM',
            approved_at: now,
          },
        ])

      if (approvalInsertError) throw new Error(approvalInsertError.message)

      await adminClient.from('audit_log').insert([
        {
          action_type: 'PENALTY_APPROVAL',
          performed_by: authUserId ?? 'SYSTEM',
          rider_id: check.rider_id,
          moto_id: motoId,
          event_id: eventId,
          reason: `Auto safety penalty applied for ${requirement?.label ?? ruleCode}`,
        },
      ])
    }
  }

  if (check.is_checked && existingPenaltyIds.length > 0) {
    const { error: approvalDeleteError } = await adminClient
      .from('rider_penalty_approvals')
      .delete()
      .in('penalty_id', existingPenaltyIds)

    if (approvalDeleteError) throw new Error(approvalDeleteError.message)

    const { error: penaltyDeleteError } = await adminClient
      .from('rider_penalties')
      .delete()
      .in('id', existingPenaltyIds)

    if (penaltyDeleteError) throw new Error(penaltyDeleteError.message)

    await adminClient.from('audit_log').insert([
      {
        action_type: 'PENALTY_VOID',
        performed_by: authUserId ?? 'SYSTEM',
        rider_id: check.rider_id,
        moto_id: motoId,
        event_id: eventId,
        reason: `Auto safety penalty removed for ${requirement?.label ?? ruleCode}`,
      },
    ])
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const moto = await getMotoEvent(motoId)
  const auth = await requireJury(req, ['CHECKER', 'FINISHER', 'RACE_DIRECTOR', 'super_admin'], moto.event_id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: requirements, error: reqError } = await adminClient
    .from('event_safety_requirements')
    .select('id, label, is_required, sort_order, penalty_code, icon_key')
    .eq('event_id', moto.event_id)
    .order('sort_order', { ascending: true })
  if (reqError) return NextResponse.json({ error: reqError.message }, { status: 400 })

  const { data: checks, error: checkError } = await adminClient
    .from('rider_safety_checks')
    .select('rider_id, requirement_id, is_checked')
    .eq('moto_id', motoId)
  if (checkError) return NextResponse.json({ error: checkError.message }, { status: 400 })

  return NextResponse.json({ data: { requirements: requirements ?? [], checks: checks ?? [] } })
}

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const body = await req.json().catch(() => ({}))
  const rawChecks: SafetyCheckInput[] = Array.isArray(body?.checks) ? body.checks : [body]
  const checks: Array<SafetyCheckRow | null> = rawChecks.map(parseSafetyCheck)

  if (checks.some((check) => !check)) {
    return NextResponse.json({ error: 'rider_id, requirement_id, is_checked required' }, { status: 400 })
  }

  const moto = await getMotoEvent(motoId)
  const auth = await requireJury(req, ['CHECKER', 'super_admin'], moto.event_id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    assertMotoEditable(moto.status)
    assertMotoNotUnderProtest(moto.status)
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Moto locked.' }, { status: 409 })
  }

  const validChecks = checks as SafetyCheckRow[]
  const now = new Date().toISOString()
  const { error } = await adminClient
    .from('rider_safety_checks')
    .upsert(
      validChecks.map((check) => ({
          event_id: moto.event_id,
          moto_id: motoId,
          rider_id: check.rider_id,
          requirement_id: check.requirement_id,
          is_checked: check.is_checked,
          updated_at: now,
          updated_by: auth.user?.id ?? null,
      })),
      { onConflict: 'event_id,moto_id,rider_id,requirement_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  for (const check of validChecks) {
    try {
      await syncSafetyPenalty({
        authUserId: auth.user?.id ?? null,
        eventId: moto.event_id,
        motoId,
        motoStatus: moto.status,
        check,
      })
    } catch (err: unknown) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to sync safety penalty' }, { status: 400 })
    }
  }

  return NextResponse.json({ ok: true, count: validChecks.length })
}
