import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { rateLimit } from '../../../../../../lib/rateLimit'

const PUSH_SUB_LIMIT = {
  key: 'public-push-sub',
  limit: 10,
  windowMs: 60 * 1000,
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const limited = await rateLimit(req, PUSH_SUB_LIMIT)
  if (!limited.ok) return limited.response

  const { eventId } = await params
  const body = await req.json().catch(() => ({}))

  const { rider_id, subscription } = body
  if (!rider_id || !subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription payload.' }, { status: 400 })
  }

  if (!subscription.endpoint.startsWith('https://')) {
    return NextResponse.json({ error: 'Endpoint must be HTTPS.' }, { status: 400 })
  }

  // Validate event
  const { data: event, error: eventError } = await adminClient
    .from('events')
    .select('id, is_public, status')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError || !event || event.is_public === false) {
    return NextResponse.json({ error: 'Event not found or not public.' }, { status: 404 })
  }
  if (event.status === 'FINISHED') {
    return NextResponse.json({ error: 'Event is already finished.' }, { status: 400 })
  }

  // Validate rider belongs to event
  const { data: rider, error: riderError } = await adminClient
    .from('riders')
    .select('id')
    .eq('id', rider_id)
    .eq('event_id', eventId)
    .maybeSingle()

  if (riderError || !rider) {
    return NextResponse.json({ error: 'Rider not found for this event.' }, { status: 404 })
  }

  // Upsert subscription
  const { error: upsertError } = await adminClient
    .from('push_subscriptions')
    .upsert({
      event_id: eventId,
      rider_id: rider_id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      last_used_at: new Date().toISOString()
    }, {
      onConflict: 'event_id,rider_id,endpoint'
    })

  if (upsertError) {
    console.error('Failed to upsert push subscription:', upsertError)
    return NextResponse.json({ error: 'Failed to save subscription.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const limited = await rateLimit(req, PUSH_SUB_LIMIT)
  if (!limited.ok) return limited.response

  const { eventId } = await params
  const body = await req.json().catch(() => ({}))

  const { rider_id, endpoint } = body
  if (!rider_id || !endpoint) {
    return NextResponse.json({ error: 'Missing rider_id or endpoint.' }, { status: 400 })
  }

  const { error: deleteError } = await adminClient
    .from('push_subscriptions')
    .delete()
    .eq('event_id', eventId)
    .eq('rider_id', rider_id)
    .eq('endpoint', endpoint)

  if (deleteError) {
    return NextResponse.json({ error: 'Failed to delete subscription.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
