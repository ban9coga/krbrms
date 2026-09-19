import { adminClient } from './auth'

/**
 * Broadcasts a `race_state_changed` event on the private Supabase Realtime channel
 * for an event. All jury/checker tabs subscribed to that channel will receive this
 * and immediately re-fetch fresh data without waiting for the 15-second polling interval.
 *
 * Fire-and-forget: errors are silently suppressed so the main API response is never
 * blocked or failed by a broadcast hiccup.
 */
export async function broadcastRaceState(
  eventId: string,
  motoId?: string | null
): Promise<void> {
  try {
    const channel = adminClient.channel(ace:event:, {
      config: { private: true },
    })
    await channel.send({
      type: 'broadcast',
      event: 'race_state_changed',
      payload: {
        event_id: eventId,
        moto_id: motoId ?? null,
      },
    })
    await adminClient.removeChannel(channel)
  } catch {
    // Non-critical: tabs will fall back to the 15-second polling interval.
  }
}
