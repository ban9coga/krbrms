import { adminClient } from '../lib/auth'
import { sendPushNotification, type PushPayload } from '../lib/pushNotifier'

export type NotifyResult = {
  ok: boolean
  processedCount: number
  sentCount: number
  failedCount: number
  warning?: string
}

/**
 * Dispatches RIDER_MOTO_PREP_CALL push notifications to guardians of riders
 * in the NEXT scheduled moto, triggered when the CURRENT moto transitions to READY.
 *
 * Cascade / domino logic:
 * - Moto N transitions to READY  â†’  notify walis of Moto N+1 to head to waiting zone.
 * - Side-effect only: never throws or disrupts race flow.
 * - Sourced 100% from database tables (motos, moto_gate_positions, moto_riders, riders).
 * - Idempotency key: RIDER_MOTO_CONFIRMED:${event_id}:${rider_id}:${target_moto_id}:TRIGGERED_BY_${triggering_moto_id}:${checker_prep_ready_at}
 */
export async function notifyRiderMotoConfirmed(motoId: string): Promise<NotifyResult> {
  try {
    // 1. Fetch triggering moto state
    const { data: triggeringMoto, error: motoError } = await adminClient
      .from('motos')
      .select('id, event_id, moto_order, status, checker_prep_ready_at')
      .eq('id', motoId)
      .maybeSingle()

    if (motoError || !triggeringMoto) {
      return {
        ok: false,
        processedCount: 0,
        sentCount: 0,
        failedCount: 0,
        warning: motoError?.message || 'Triggering moto not found',
      }
    }

    // 2. Hard boundary check: Must be READY and have checker_prep_ready_at timestamp
    const normalizedStatus = String(triggeringMoto.status ?? '').toUpperCase()
    if (normalizedStatus !== 'READY' || !triggeringMoto.checker_prep_ready_at) {
      return {
        ok: false,
        processedCount: 0,
        sentCount: 0,
        failedCount: 0,
        warning: `Moto status is ${triggeringMoto.status} (expected READY with checker_prep_ready_at). Notification skipped.`,
      }
    }

    // 2.5 Fetch the TARGET moto (the next moto in the event schedule)
    const { data: moto, error: targetError } = await adminClient
      .from('motos')
      .select('id, event_id, category_id, moto_name, status')
      .eq('event_id', triggeringMoto.event_id)
      .gt('moto_order', triggeringMoto.moto_order)
      .in('status', ['UPCOMING', 'READY']) // Next moto might be UPCOMING or already READY in weird edge cases
      .order('moto_order', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (targetError || !moto) {
      return {
        ok: true, // Graceful exit, end of schedule
        processedCount: 0,
        sentCount: 0,
        failedCount: 0,
        warning: 'No next moto found to notify (end of schedule).',
      }
    }

    // 3. Fetch confirmed riders, gate positions, and disqualifications for the TARGET moto
    const [{ data: gateRows, error: gateError }, { data: assignmentRows, error: assignError }, { data: dqRows }] =
      await Promise.all([
        adminClient
          .from('moto_gate_positions')
          .select('rider_id, gate_position')
          .eq('moto_id', moto.id)
          .order('gate_position', { ascending: true }),
        adminClient
          .from('moto_riders')
          .select('rider_id, created_at')
          .eq('moto_id', moto.id)
          .order('created_at', { ascending: true }),
        adminClient
          .from('results')
          .select('rider_id')
          .eq('moto_id', moto.id)
          .eq('result_status', 'DQ'),
      ])

    if (gateError) console.warn('Could not read moto_gate_positions:', gateError.message)
    if (assignError) console.warn('Could not read moto_riders:', assignError.message)

    const dqRiderIds = new Set((dqRows ?? []).map((r) => r.rider_id))

    type ConfirmedAssignment = { riderId: string; gate: number }
    let confirmedAssignments: ConfirmedAssignment[] = []

    if (gateRows && gateRows.length > 0) {
      confirmedAssignments = gateRows
        .filter((g) => !dqRiderIds.has(g.rider_id))
        .map((g, idx) => ({
          riderId: g.rider_id,
          gate: Number(g.gate_position ?? idx + 1),
        }))
    } else if (assignmentRows && assignmentRows.length > 0) {
      confirmedAssignments = assignmentRows
        .filter((a) => !dqRiderIds.has(a.rider_id))
        .map((a, idx) => ({
          riderId: a.rider_id,
          gate: idx + 1,
        }))
    }

    if (confirmedAssignments.length === 0) {
      return {
        ok: true,
        processedCount: 0,
        sentCount: 0,
        failedCount: 0,
        warning: 'No confirmed riders found in moto.',
      }
    }

    // 4. Fetch rider profile details (name, plate)
    const riderIds = confirmedAssignments.map((a) => a.riderId)
    const { data: riders, error: riderError } = await adminClient
      .from('riders')
      .select('id, name, no_plate_display')
      .in('id', riderIds)

    if (riderError) console.warn('Could not read riders:', riderError.message)
    const riderMap = new Map((riders ?? []).map((r) => [r.id, r]))

    // 5. Query active subscriptions scoped by event_id + riderIds
    const { data: subscriptions, error: subError } = await adminClient
      .from('push_subscriptions')
      .select('id, rider_id, endpoint, p256dh, auth')
      .eq('event_id', moto.event_id)
      .in('rider_id', riderIds)

    if (subError) {
      console.error('Failed to query push subscriptions:', subError.message)
      return { ok: false, processedCount: 0, sentCount: 0, failedCount: 0, warning: subError.message }
    }

    if (!subscriptions || subscriptions.length === 0) {
      // Test A: Rider without subscription succeeds cleanly without error
      return { ok: true, processedCount: 0, sentCount: 0, failedCount: 0 }
    }

    // Group subscriptions by rider_id (supports multiple devices/guardians per rider)
    const subsByRider = new Map<string, typeof subscriptions>()
    for (const sub of subscriptions) {
      const list = subsByRider.get(sub.rider_id) ?? []
      list.push(sub)
      subsByRider.set(sub.rider_id, list)
    }

    // Existing public route URL
    const publicUrl = moto.category_id
      ? `/event/${moto.event_id}/live-score/${moto.category_id}`
      : `/event/${moto.event_id}`

    let processedCount = 0
    let sentCount = 0
    let failedCount = 0

    // 6. Process each confirmed rider independently (MULTIPLE RIDERS)
    for (const assignment of confirmedAssignments) {
      const subs = subsByRider.get(assignment.riderId)
      if (!subs || subs.length === 0) continue

      const rider = riderMap.get(assignment.riderId)
      const riderName = rider?.name?.trim() || 'Rider'
      const plateText = rider?.no_plate_display ? ` (#${rider.no_plate_display})` : ''
      const motoName = moto.moto_name?.trim() || 'Moto'

      // Idempotency key per rider & confirmation cycle (includes triggering moto ID to ensure uniqueness)
      const idempotencyKey = `RIDER_MOTO_CONFIRMED:${moto.event_id}:${assignment.riderId}:${moto.id}:TRIGGERED_BY_${triggeringMoto.id}:${triggeringMoto.checker_prep_ready_at}`

      const payload: PushPayload = {
        title: 'ðŸ“¢ RacePushBike - Segera ke Area Persiapan',
        body: `${riderName}${plateText} akan segera dipanggil ke ${motoName}. Harap menuju Area Persiapan sekarang.`,
        icon: '/icon.png',
        data: {
          url: publicUrl,
          eventId: moto.event_id,
          riderId: assignment.riderId,
          motoId: moto.id,
          gate: assignment.gate,
        },
      }

      // Process each subscription for this rider (MULTIPLE SUBSCRIPTIONS)
      for (const sub of subs) {
        processedCount++

        // Insert pending log to enforce idempotency via unique(idempotency_key, subscription_id)
        const { data: logRow, error: logInsertError } = await adminClient
          .from('push_notification_log')
          .insert({
            event_id: moto.event_id,
            rider_id: assignment.riderId,
            subscription_id: sub.id,
            event_type: 'RIDER_MOTO_CONFIRMED',
            idempotency_key: idempotencyKey,
            status: 'PENDING',
            attempt_count: 1,
            last_attempted_at: new Date().toISOString(),
          })
          .select('id')
          .maybeSingle()

        if (logInsertError) {
          // Check for duplicate violation (PostgreSQL 23505 or constraint message)
          if (
            logInsertError.code === '23505' ||
            logInsertError.message.includes('unique') ||
            logInsertError.message.includes('idempotency')
          ) {
            // Already handled for this cycle and subscription, skip duplicate safely
            continue
          }
          console.error('Push notification log insert error:', logInsertError.message)
          failedCount++
          continue
        }

        if (!logRow?.id) continue

        // Send push notification via web-push
        const pushResult = await sendPushNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          payload
        )

        if (pushResult.ok) {
          sentCount++
          await adminClient
            .from('push_notification_log')
            .update({
              status: 'SENT',
              sent_at: new Date().toISOString(),
            })
            .eq('id', logRow.id)

          await adminClient
            .from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', sub.id)
        } else {
          failedCount++
          if (pushResult.error === 'GONE') {
            // HTTP 404/410: Clean up dead subscription
            await adminClient.from('push_subscriptions').delete().eq('id', sub.id)
            await adminClient
              .from('push_notification_log')
              .update({
                status: 'FAILED',
                error_message: 'Subscription expired or unregistered (HTTP 410/404). Cleaned up.',
              })
              .eq('id', logRow.id)
          } else {
            // Temporary failure (network, 5xx, 429)
            await adminClient
              .from('push_notification_log')
              .update({
                status: 'FAILED',
                error_message: pushResult.error || 'Push delivery failed',
              })
              .eq('id', logRow.id)
          }
        }
      }
    }

    return { ok: true, processedCount, sentCount, failedCount }
  } catch (err: unknown) {
    console.error('Unexpected error in notifyRiderMotoConfirmed:', err instanceof Error ? err.message : err)
    return {
      ok: false,
      processedCount: 0,
      sentCount: 0,
      failedCount: 0,
      warning: err instanceof Error ? err.message : 'Unexpected push notification error',
    }
  }
}

export type StagePlacement = {
  riderId: string
  motoId: string
  motoName: string
  gate: number | null
}

/**
 * Dispatches RIDER_STAGE_ADVANCED push notifications to guardians of riders
 * who have just been placed into the next stage bracket (Repechage, Quarter Final,
 * Semi-Final, Final A/B/C, etc.) after a stage concludes and is locked.
 *
 * Applies to all stage transitions:
 * - Qualification -> Repechage / Quarter Final / Semi-Final
 * - Repechage -> Quarter Final
 * - Quarter Final -> Semi-Final
 * - Semi-Final -> Final (A / B / C / etc.)
 *
 * Side-effect only: never throws or disrupts race flow.
 * Idempotency key: RIDER_STAGE_ADVANCED:${event_id}:${ider_id}:${moto_id}
 */
export async function notifyRidersStageAdvanced(
  eventId: string,
  placements: StagePlacement[]
): Promise<NotifyResult> {
  if (!placements || placements.length === 0) {
    return { ok: true, processedCount: 0, sentCount: 0, failedCount: 0 }
  }

  try {
    const riderIds = [...new Set(placements.map((p) => p.riderId))]

    const { data: riders, error: riderError } = await adminClient
      .from('riders')
      .select('id, name, no_plate_display')
      .in('id', riderIds)

    if (riderError) console.warn('Could not read riders for stage advance notify:', riderError.message)
    const riderMap = new Map((riders ?? []).map((r) => [r.id, r]))

    const { data: subscriptions, error: subError } = await adminClient
      .from('push_subscriptions')
      .select('id, rider_id, endpoint, p256dh, auth')
      .eq('event_id', eventId)
      .in('rider_id', riderIds)

    if (subError) {
      console.error('Failed to query push subscriptions for stage advance:', subError.message)
      return { ok: false, processedCount: 0, sentCount: 0, failedCount: 0, warning: subError.message }
    }

    if (!subscriptions || subscriptions.length === 0) {
      return { ok: true, processedCount: 0, sentCount: 0, failedCount: 0 }
    }

    const subsByRider = new Map<string, typeof subscriptions>()
    for (const sub of subscriptions) {
      const list = subsByRider.get(sub.rider_id) ?? []
      list.push(sub)
      subsByRider.set(sub.rider_id, list)
    }

    const publicUrl = `/event/${eventId}`

    let processedCount = 0
    let sentCount = 0
    let failedCount = 0

    for (const placement of placements) {
      const subs = subsByRider.get(placement.riderId)
      if (!subs || subs.length === 0) continue

      const rider = riderMap.get(placement.riderId)
      const riderName = rider?.name?.trim() || 'Rider'
      const plateText = rider?.no_plate_display ? ` (#${rider.no_plate_display})` : ''
      const motoName = placement.motoName?.trim() || 'Babak Selanjutnya'
      const gateText = placement.gate != null ? `, Gate ${placement.gate}` : ''

      const idempotencyKey = `RIDER_STAGE_ADVANCED:${eventId}:${placement.riderId}:${placement.motoId}`

      const payload: PushPayload = {
        title: '🌟 RacePushBike - Lolos Babak Selanjutnya',
        body: `${plateText} masuk ke ${motoName}${gateText}.`,
        icon: '/icon.png',
        data: { url: publicUrl, eventId, riderId: placement.riderId, motoId: placement.motoId },
      }

      for (const sub of subs) {
        processedCount++
        const { data: logRow, error: logInsertError } = await adminClient
          .from('push_notification_log')
          .insert({
            event_id: eventId,
            rider_id: placement.riderId,
            subscription_id: sub.id,
            event_type: 'RIDER_STAGE_ADVANCED',
            idempotency_key: idempotencyKey,
            status: 'PENDING',
            attempt_count: 1,
            last_attempted_at: new Date().toISOString(),
          })
          .select('id')
          .maybeSingle()

        if (logInsertError) {
          if (logInsertError.code === '23505' || logInsertError.message.includes('unique') || logInsertError.message.includes('idempotency')) {
            continue
          }
          failedCount++
          continue
        }
        if (!logRow?.id) continue

        const pushResult = await sendPushNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )

        if (pushResult.ok) {
          sentCount++
          await adminClient.from('push_notification_log').update({ status: 'SENT', sent_at: new Date().toISOString() }).eq('id', logRow.id)
          await adminClient.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', sub.id)
        } else {
          failedCount++
          if (pushResult.error === 'GONE') {
            await adminClient.from('push_subscriptions').delete().eq('id', sub.id)
            await adminClient.from('push_notification_log').update({ status: 'FAILED', error_message: 'Subscription expired (HTTP 410/404). Cleaned up.' }).eq('id', logRow.id)
          } else {
            await adminClient.from('push_notification_log').update({ status: 'FAILED', error_message: pushResult.error || 'Push delivery failed' }).eq('id', logRow.id)
          }
        }
      }
    }

    return { ok: true, processedCount, sentCount, failedCount }
  } catch (err: unknown) {
    console.error('Unexpected error in notifyRidersStageAdvanced:', err instanceof Error ? err.message : err)
    return { ok: false, processedCount: 0, sentCount: 0, failedCount: 0, warning: err instanceof Error ? err.message : 'Unexpected push notification error' }
  }
}