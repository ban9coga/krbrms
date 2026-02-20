import EventCard from '../components/EventCard'
import EmptyState from '../components/EmptyState'
import LandingTopbar from '../components/LandingTopbar'
import PageSection from '../components/PageSection'
import type { EventItem, EventStatus } from '../lib/eventService'
import { headers } from 'next/headers'

const getBaseUrl = () => {
  const headerList = headers()
  const proto = headerList.get('x-forwarded-proto') ?? 'http'
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host')
  if (!host) return ''
  return `${proto}://${host}`
}

const fetchEvents = async (status?: EventStatus): Promise<EventItem[]> => {
  const baseUrl = getBaseUrl()
  const url = status ? `${baseUrl}/api/events?status=${status}` : `${baseUrl}/api/events`
  const res = await fetch(url, { cache: 'no-store' })
  const json = await res.json()
  return json.data ?? []
}

export default async function LandingPage() {
  const [upcomingEvents, ongoingEvents, finishedEvents] = await Promise.all([
    fetchEvents('UPCOMING'),
    fetchEvents('LIVE'),
    fetchEvents('FINISHED'),
  ])
  const allEvents = [...upcomingEvents, ...ongoingEvents, ...finishedEvents]

  return (
    <div style={{ minHeight: '100vh', background: '#eaf7ee', color: '#111' }}>
      <LandingTopbar events={allEvents} />

      <main style={{ maxWidth: '980px', margin: '0 auto', padding: '24px 20px 48px' }}>
        <div id="ongoing-events">
          <PageSection title="Ongoing Events">
            {ongoingEvents.length === 0 && <EmptyState label="Belum ada event yang sedang berlangsung." />}
            <div style={{ display: 'grid', gap: '12px' }}>
              {ongoingEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </PageSection>
        </div>

        <PageSection title="Coming Soon">
          {upcomingEvents.length === 0 && <EmptyState label="Belum ada event yang akan datang." />}
          <div style={{ display: 'grid', gap: '12px' }}>
            {upcomingEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </PageSection>

        <PageSection title="Completed Events">
          {finishedEvents.length === 0 && <EmptyState label="Belum ada event yang selesai." />}
          <div style={{ display: 'grid', gap: '12px' }}>
            {finishedEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </PageSection>
      </main>
    </div>
  )
}
