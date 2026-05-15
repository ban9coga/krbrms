import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

export async function GET(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const { data: moto, error: motoError } = await adminClient
    .from('motos')
    .select('id, event_id')
    .eq('id', motoId)
    .maybeSingle()
  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })
  if (!moto?.event_id) return NextResponse.json({ error: 'Moto not found' }, { status: 404 })

  const auth = await requireJury(req, ['RACE_DIRECTOR', 'SUPER_ADMIN'], moto.event_id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await adminClient
    .from('rider_penalties')
    .select(
      `
        id,
        rider_id,
        moto_id,
        event_id,
        stage,
        rule_code,
        penalty_point,
        note,
        created_at,
        riders (
          id,
          name,
          no_plate_display
        ),
        rider_penalty_approvals!inner (
          approval_status,
          approved_at,
          approved_by
        )
      `
    )
    .eq('moto_id', motoId)
    .eq('stage', 'MOTO')
    .eq('rider_penalty_approvals.approval_status', 'APPROVED')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: Request, { params }: { params: Promise<{ motoId: string }> }) {
  const { motoId } = await params
  const body = await req.json().catch(() => ({}))
  const { penalty_id, reason } = body ?? {}
  const trimmedReason = typeof reason === 'string' ? reason.trim() : ''
  if (!penalty_id || !trimmedReason) {
    return NextResponse.json({ error: 'penalty_id and reason required' }, { status: 400 })
  }

  const { data: penalty, error: penaltyError } = await adminClient
    .from('rider_penalties')
    .select('id, rider_id, event_id, moto_id, stage, rule_code, penalty_point')
    .eq('id', penalty_id)
    .eq('moto_id', motoId)
    .maybeSingle()
  if (penaltyError) return NextResponse.json({ error: penaltyError.message }, { status: 400 })
  if (!penalty?.event_id) return NextResponse.json({ error: 'Penalty not found for this moto' }, { status: 404 })

  const auth = await requireJury(req, ['RACE_DIRECTOR', 'SUPER_ADMIN'], penalty.event_id)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error: approvalError } = await adminClient
    .from('rider_penalty_approvals')
    .update({
      approval_status: 'REJECTED',
      approved_by: auth.user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('penalty_id', penalty_id)
    .eq('approval_status', 'APPROVED')
  if (approvalError) return NextResponse.json({ error: approvalError.message }, { status: 400 })

  await adminClient.from('audit_log').insert([
    {
      action_type: 'PENALTY_VOID',
      performed_by: auth.user.id,
      rider_id: penalty.rider_id,
      moto_id: motoId,
      event_id: penalty.event_id,
      reason: `${trimmedReason} | Voided ${penalty.rule_code} (${penalty.penalty_point} pts)`,
    },
  ])

  return NextResponse.json({ ok: true })
}
