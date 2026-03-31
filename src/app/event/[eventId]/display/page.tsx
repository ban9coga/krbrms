import LiveDisplayClient from './LiveDisplayClient'
import { adminClient } from '../../../../lib/auth'
import type { BusinessSettings, EventItem } from '../../../../lib/eventService'

const parseBusinessSettings = (value: unknown): BusinessSettings => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as BusinessSettings
  }
  return {}
}

export default async function LiveDisplayPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { data: eventRow } = await adminClient
    .from('events')
    .select('id, name, location, event_date, status, is_public, created_at, updated_at')
    .eq('id', eventId)
    .maybeSingle()

  const { data: settingsRow } = await adminClient
    .from('event_settings')
    .select('event_logo_url, sponsor_logo_urls, business_settings')
    .eq('event_id', eventId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const initialEvent: EventItem | null = eventRow
    ? {
        ...eventRow,
        event_logo_url: typeof settingsRow?.event_logo_url === 'string' ? settingsRow.event_logo_url : null,
        sponsor_logo_urls: Array.isArray(settingsRow?.sponsor_logo_urls)
          ? settingsRow.sponsor_logo_urls.filter((item): item is string => typeof item === 'string')
          : [],
        business_settings: parseBusinessSettings(settingsRow?.business_settings),
      }
    : null

  return <LiveDisplayClient eventId={eventId} initialEvent={initialEvent} />
}
