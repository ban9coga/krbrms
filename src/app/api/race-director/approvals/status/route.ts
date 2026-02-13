import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../lib/auth'
import { requireJury } from '../../../../../services/juryAuth'

export async function POST(req: Request) {
  const auth = await requireJury(req, ['RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json()
  const { update_id, decision, reason } = body ?? {}
  if (!update_id || !decision) return NextResponse.json({ error: 'update_id and decision required' }, { status: 400 })

  const { data: update, error } = await adminClient
    .from('rider_status_updates')
    .select('id, event_id, rider_id, proposed_status')
    .eq('id', update_id)
    .maybeSingle()

  if (error || !update) return NextResponse.json({ error: 'Update not found' }, { status: 404 })

  const approval_status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'

  await adminClient
    .from('rider_status_updates')
    .update({
      approval_status,
      approved_by: auth.user.id,
      approved_at: new Date().toISOString(),
      note: reason ?? null,
    })
    .eq('id', update_id)

  if (approval_status === 'APPROVED') {
    await adminClient
      .from('rider_participation_status')
      .upsert(
        [
          {
            event_id: update.event_id,
            rider_id: update.rider_id,
            participation_status: update.proposed_status,
            registration_order: 0,
          },
        ],
        { onConflict: 'event_id,rider_id' }
      )
  }

  await adminClient.from('audit_log').insert([
    {
      action_type: 'STATUS_APPROVAL',
      performed_by: auth.user.id,
      rider_id: update.rider_id,
      event_id: update.event_id,
      reason: reason ?? null,
    },
  ])

  return NextResponse.json({ ok: true })
}
