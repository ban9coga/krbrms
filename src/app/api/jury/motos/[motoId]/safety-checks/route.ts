import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { assertMotoEditable, assertMotoNotUnderProtest } from '../../../../../../lib/motoLock'
import { isMotoLive } from '../../../../../../lib/motoStatus'
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
  const { rider_id, requirement_id, is_checked } = await req.json().catch(() => ({}))

  if (!rider_id || !requirement_id || typeof is_checked !== 'boolean') {
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

  const { error } = await adminClient
    .from('rider_safety_checks')
    .upsert(
      [
        {
          event_id: moto.event_id,
          moto_id: motoId,
          rider_id,
          requirement_id,
          is_checked,
          updated_at: new Date().toISOString(),
          updated_by: auth.user?.id ?? null,
        },
      ],
      { onConflict: 'event_id,moto_id,rider_id,requirement_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const { data: requirement, error: requirementError } = await adminClient
    .from('event_safety_requirements')
    .select('id, label, penalty_code')
    .eq('event_id', moto.event_id)
    .eq('id', requirement_id)
    .maybeSingle()

  if (requirementError) return NextResponse.json({ error: requirementError.message }, { status: 400 })

  const noteTag = `AUTO_SAFETY_REQUIREMENT:${requirement_id}`
  const shouldManagePenalty = isMotoLive(moto.status) && typeof requirement?.penalty_code === 'string' && requirement.penalty_code.trim().length > 0

  if (shouldManagePenalty) {
    const ruleCode = requirement.penalty_code!.trim()
    const { data: rule, error: ruleError } = await adminClient
      .from('event_penalty_rules')
      .select('code, penalty_point, is_active, checker_enabled, applies_to_stage')
      .eq('event_id', moto.event_id)
      .eq('code', ruleCode)
      .maybeSingle()

    if (ruleError) return NextResponse.json({ error: ruleError.message }, { status: 400 })

    if (rule?.is_active && rule?.checker_enabled && (rule.applies_to_stage === 'ALL' || rule.applies_to_stage === 'MOTO')) {
      const { data: existingPenalties, error: existingPenaltyError } = await adminClient
        .from('rider_penalties')
        .select('id')
        .eq('event_id', moto.event_id)
        .eq('moto_id', motoId)
        .eq('rider_id', rider_id)
        .eq('stage', 'MOTO')
        .eq('rule_code', ruleCode)
        .eq('note', noteTag)

      if (existingPenaltyError) return NextResponse.json({ error: existingPenaltyError.message }, { status: 400 })

      const existingPenaltyIds = (existingPenalties ?? []).map((row) => row.id)

      if (!is_checked && existingPenaltyIds.length === 0) {
        const { data: insertedPenalty, error: insertPenaltyError } = await adminClient
          .from('rider_penalties')
          .insert([
            {
              rider_id,
              event_id: moto.event_id,
              moto_id: motoId,
              stage: 'MOTO',
              rule_code: ruleCode,
              penalty_point: rule.penalty_point,
              note: noteTag,
            },
          ])
          .select('id')
          .single()

        if (insertPenaltyError) return NextResponse.json({ error: insertPenaltyError.message }, { status: 400 })

        if (insertedPenalty?.id) {
          const now = new Date().toISOString()
          const { error: approvalInsertError } = await adminClient
            .from('rider_penalty_approvals')
            .insert([
              {
                penalty_id: insertedPenalty.id,
                approval_status: 'APPROVED',
                approved_by: auth.user?.id ?? 'SYSTEM',
                approved_at: now,
              },
            ])

          if (approvalInsertError) return NextResponse.json({ error: approvalInsertError.message }, { status: 400 })

          await adminClient.from('audit_log').insert([
            {
              action_type: 'PENALTY_APPROVAL',
              performed_by: auth.user?.id ?? 'SYSTEM',
              rider_id,
              moto_id: motoId,
              event_id: moto.event_id,
              reason: `Auto safety penalty applied for ${requirement?.label ?? ruleCode}`,
            },
          ])
        }
      }

      if (is_checked && existingPenaltyIds.length > 0) {
        const { error: approvalDeleteError } = await adminClient
          .from('rider_penalty_approvals')
          .delete()
          .in('penalty_id', existingPenaltyIds)

        if (approvalDeleteError) return NextResponse.json({ error: approvalDeleteError.message }, { status: 400 })

        const { error: penaltyDeleteError } = await adminClient
          .from('rider_penalties')
          .delete()
          .in('id', existingPenaltyIds)

        if (penaltyDeleteError) return NextResponse.json({ error: penaltyDeleteError.message }, { status: 400 })

        await adminClient.from('audit_log').insert([
          {
            action_type: 'PENALTY_VOID',
            performed_by: auth.user?.id ?? 'SYSTEM',
            rider_id,
            moto_id: motoId,
            event_id: moto.event_id,
            reason: `Auto safety penalty removed for ${requirement?.label ?? ruleCode}`,
          },
        ])
      }
    }
  }

  return NextResponse.json({ ok: true })
}
