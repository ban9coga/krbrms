import { cache } from 'react'
import { adminClient } from './auth'

export type LiveEventItem = {
  id: string
  name: string
  location?: string | null
}

export const getLiveEvent = cache(async (): Promise<LiveEventItem | null> => {
  const { data, error } = await adminClient
    .from('events')
    .select('id, name, location, status, is_public, event_date')
    .eq('status', 'LIVE')
    .eq('is_public', true)
    .order('event_date', { ascending: false })
    .limit(1)

  if (error) return null

  const row = (data ?? [])[0]
  if (!row) return null

  return {
    id: row.id,
    name: row.name,
    location: row.location,
  }
})
