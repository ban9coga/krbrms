import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { assertMotoEditable, assertMotoNotUnderProtest } from '../../../../../../lib/motoLock'
import { isMotoLive, isMotoReady, isMotoUpcoming } from '../../../../../../lib/motoStatus'
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

const syncSafetyPenalties = async ({
  authUserId,
  eventId,
  motoId,
  motoStatus,
  checks,
}: {
  authUserId: string | null
  eventId: string
  motoId: string
  motoStatus: string
  checks: SafetyCheckRow[]
}) => {
  if (!checks.length || (!isMotoLive(motoStatus) && !isMotoReady(motoStatus) && !isMotoUpcoming(motoStatus))) return

  const requirementIds = Array.from(new Set(checks.map((check) => check.requirement_id)))
  const { data: requirements, error: requirementError } = await adminClient
    .from('event_safety_requirements')
    .select('id, label, penalty_code')
    .eq('event_id', eventId)
    .in('id', requirementIds)

  if (requirementError) throw new Error(requirementError.message)

  const requirementById = new Map((requirements ?? []).map((requirement) => [requirement.id, requirement]))
  const ruleCodes = Array.from(
    new Set(
      checks
        .map((check) => requirementById.get(check.requirement_id)?.penalty_code?.trim() ?? '')
        .filter(Boolean)
    )
  )
  if (!ruleCodes.length) return

  const { data: rules, error: ruleError } = await adminClient
    .from('event_penalty_rules')
    .select('code, penalty_point, is_active, checker_enabled, applies_to_stage')
    .eq('event_id', eventId)
    .in('code', ruleCodes)

  if (ruleError) throw new Error(ruleError.message)
  const ruleByCode = new Map((rules ?? []).map((rule) => [rule.code, rule]))
  const manageableChecks = checks.filter((check) => {
    const ruleCode = requirementById.get(check.requirement_id)?.penalty_code?.trim()
    const rule = ruleCode ? ruleByCode.get(ruleCode) : null
    return Boolean(rule?.is_active && rule?.checker_enabled && (rule.applies_to_stage === 'ALL' || rule.applies_to_stage === 'MOTO'))
  })
  if (!manageableChecks.length) return

  const riderIds = Array.from(new Set(manageableChecks.map((check) => check.rider_id)))
  const manageableRuleCodes = Array.from(
    new Set(manageableChecks.map((check) => requirementById.get(check.requirement_id)?.penalty_code?.trim()).filter(Boolean))
  )
  const { data: existingPenalties, error: existingPenaltyError } = await adminClient
    .from('rider_penalties')
    .select('id, rider_id, rule_code, note')
    .eq('event_id', eventId)
    .eq('moto_id', motoId)
    .eq('stage', 'MOTO')
    .in('rider_id', riderIds)
    .in('rule_code', manageableRuleCodes)
    .like('note', 'AUTO_SAFETY_REQUIREMENT:%')

  if (existingPenaltyError) throw new Error(existingPenaltyError.message)

  const existingByKey = new Map(
    (existingPenalties ?? []).map((penalty) => [`${penalty.rider_id}:${penalty.note}`, penalty])
  )
  const penaltiesToInsert = manageableChecks.flatMap((check) => {
    if (check.is_checked) return []
    const requirement = requirementById.get(check.requirement_id)
    const ruleCode = requirement?.penalty_code?.trim()
    const rule = ruleCode ? ruleByCode.get(ruleCode) : null
    const note = `AUTO_SAFETY_REQUIREMENT:${check.requirement_id}`
    if (!requirement || !ruleCode || !rule || existingByKey.has(`${check.rider_id}:${note}`)) return []
    return [{ rider_id: check.rider_id, event_id: eventId, moto_id: motoId, stage: 'MOTO', rule_code: ruleCode, penalty_point: rule.penalty_point, note }]
  })
  const penaltyIdsToDelete = manageableChecks.flatMap((check) => {
    if (!check.is_checked) return []
    const penalty = existingByKey.get(`${check.rider_id}:AUTO_SAFETY_REQUIREMENT:${check.requirement_id}`)
    return penalty ? [penalty.id] : []
  })

  if (penaltyIdsToDelete.length > 0) {
    const { error: approvalDeleteError } = await adminClient
      .from('rider_penalty_approvals')
      .delete()
      .in('penalty_id', penaltyIdsToDelete)

    if (approvalDeleteError) throw new Error(approvalDeleteError.message)

    const { error: penaltyDeleteError } = await adminClient
      .from('rider_penalties')
      .delete()
      .in('id', penaltyIdsToDelete)

    if (penaltyDeleteError) throw new Error(penaltyDeleteError.message)
    const deletedPenaltySet = new Set(penaltyIdsToDelete)
    await adminClient.from('audit_log').insert(
      (existingPenalties ?? [])
        .filter((penalty) => deletedPenaltySet.has(penalty.id))
        .map((penalty) => ({
          action_type: 'PENALTY_VOID',
          performed_by: authUserId ?? 'SYSTEM',
          rider_id: penalty.rider_id,
          moto_id: motoId,
          event_id: eventId,
          reason: 'Auto safety penalty removed',
        }))
    )
  }

  if (penaltiesToInsert.length > 0) {
    const { data: insertedPenalties, error: insertPenaltyError } = await adminClient
      .from('rider_penalties')
      .insert(penaltiesToInsert)
      .select('id, rider_id, rule_code, note')
    if (insertPenaltyError) throw new Error(insertPenaltyError.message)

    const now = new Date().toISOString()
    const { error: approvalInsertError } = await adminClient.from('rider_penalty_approvals').insert(
      (insertedPenalties ?? []).map((penalty) => ({
        penalty_id: penalty.id,
        approval_status: 'APPROVED',
        approved_by: authUserId ?? 'SYSTEM',
        approved_at: now,
      }))
    )
    if (approvalInsertError) throw new Error(approvalInsertError.message)

    const requirementLabelById = new Map((requirements ?? []).map((requirement) => [requirement.id, requirement.label]))
    await adminClient.from('audit_log').insert(
      (insertedPenalties ?? []).map((penalty) => ({
        action_type: 'PENALTY_APPROVAL',
        performed_by: authUserId ?? 'SYSTEM',
        rider_id: penalty.rider_id,
        moto_id: motoId,
        event_id: eventId,
        reason: `Auto safety penalty applied for ${requirementLabelById.get(penalty.note.replace('AUTO_SAFETY_REQUIREMENT:', '')) ?? penalty.rule_code}`,
      }))
    )
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

  try {
    await syncSafetyPenalties({
      authUserId: auth.user?.id ?? null,
      eventId: moto.event_id,
      motoId,
      motoStatus: moto.status,
      checks: validChecks,
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to sync safety penalty' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, count: validChecks.length })
}
