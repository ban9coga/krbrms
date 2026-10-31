import { adminClient } from './auth'

const sendBroadcast = async (
  channelName: string,
  isPrivate: boolean,
  eventName: string,
  payload: Record<string, string | null>
): Promise<void> => {
  const channel = adminClient.channel(channelName, { config: { private: isPrivate } })
  try {
    await channel.send({
      type: 'broadcast',
      event: eventName,
      payload,
    })
  } catch {
    // Screens keep their low-frequency polling fallback if broadcast fails.
  } finally {
    try {
      await adminClient.removeChannel(channel)
    } catch {
      // Channel cleanup is non-critical.
    }
  }
}

/** Signal public score viewers for one category after a race-data change. */
export async function broadcastPublicLiveScore(
  eventId: string,
  categoryId: string,
  motoId?: string | null
): Promise<void> {
  if (!eventId || !categoryId) return
  await sendBroadcast(
    `public-live-score:event:${eventId}:category:${categoryId}`,
    false,
    'score_changed',
    { event_id: eventId, category_id: categoryId, moto_id: motoId ?? null }
  )
}

/** Send an internal race signal and, when scoped to a category, a public score signal. */
export async function broadcastRaceState(
  eventId: string,
  motoId?: string | null,
  categoryId?: string | null
): Promise<void> {
  if (!eventId) return
  await Promise.all([
    sendBroadcast(`race:event:${eventId}`, true, 'race_state_changed', {
      event_id: eventId,
      moto_id: motoId ?? null,
    }),
    categoryId ? broadcastPublicLiveScore(eventId, categoryId, motoId) : Promise.resolve(),
  ])
}
