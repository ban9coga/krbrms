import { NextResponse } from 'next/server'
import { adminClient } from '../../../../lib/auth'
import { requireJury } from '../../../../services/juryAuth'
import { sendPushNotification } from '../../../../lib/pushNotifier'

export async function POST(req: Request) {
  const auth = await requireJury(req, ['RACE_DIRECTOR', 'super_admin', 'admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const { event_id, rider_id } = body

  if (!event_id || !rider_id) {
    return NextResponse.json({ error: 'event_id and rider_id are required.' }, { status: 400 })
  }

  const { data: subscriptions, error } = await adminClient
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('event_id', event_id)
    .eq('rider_id', rider_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
  
  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({ error: 'No subscriptions found for this rider.' }, { status: 404 })
  }

  const results = []
  for (const sub of subscriptions) {
    const webPushSub = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      }
    }
    
    const payload = {
      title: 'RacePushBike',
      body: 'Notifikasi RacePushBike berhasil diaktifkan.',
      data: {
        url: `/event/${event_id}`
      }
    }
    
    const res = await sendPushNotification(webPushSub, payload)
    results.push({ id: sub.id, result: res })
  }

  return NextResponse.json({ ok: true, results })
}
