import EventCard from '../components/EventCard'
import EmptyState from '../components/EmptyState'
import LandingTopbar from '../components/LandingTopbar'
import PageSection from '../components/PageSection'
import type { EventItem, EventStatus } from '../lib/eventService'
import Link from 'next/link'
import { adminClient } from '../lib/auth'

const fetchEvents = async (status?: EventStatus): Promise<EventItem[]> => {
  let query = adminClient
    .from('events')
    .select('id, name, location, event_date, status, is_public')
    .eq('is_public', true)
    .order('event_date', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data } = await query
  return (data ?? []) as EventItem[]
}

export default async function LandingPage() {
  const [upcomingEvents, ongoingEvents, finishedEvents] = await Promise.all([
    fetchEvents('UPCOMING'),
    fetchEvents('LIVE'),
    fetchEvents('FINISHED'),
  ])
  const allEvents = [...upcomingEvents, ...ongoingEvents, ...finishedEvents]

  return (
    <div style={{ minHeight: '100vh', background: '#f6fbf7', color: '#111' }}>
      <LandingTopbar events={allEvents} />

      <main style={{ maxWidth: '980px', margin: '0 auto', padding: '24px 20px 48px' }}>
        <div id="ongoing-events">
          <PageSection title="Ongoing Events">
            {ongoingEvents.length === 0 && <EmptyState label="Belum ada event yang sedang berlangsung." />}
            <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
              {ongoingEvents.map((event, idx) => (
                <div key={event.id} style={{ display: 'grid', gap: 8 }}>
                  <EventCard event={event} index={idx} />
                  {event.is_public !== false && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Link
                        href={`/event/${event.id}/display`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 12px',
                          borderRadius: 999,
                          border: '1px solid rgba(15, 23, 42, 0.18)',
                          background: '#2ecc71',
                          color: '#111',
                          fontWeight: 900,
                          textDecoration: 'none',
                        }}
                      >
                        Live Display (Publik)
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </PageSection>
        </div>

        <PageSection title="Coming Soon">
          {upcomingEvents.length === 0 && <EmptyState label="Belum ada event yang akan datang." />}
          <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            {upcomingEvents.map((event, idx) => (
              <EventCard key={event.id} event={event} index={idx} />
            ))}
          </div>
        </PageSection>

        <PageSection title="Completed Events">
          {finishedEvents.length === 0 && <EmptyState label="Belum ada event yang selesai." />}
          <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
            {finishedEvents.map((event, idx) => (
              <EventCard key={event.id} event={event} index={idx} />
            ))}
          </div>
        </PageSection>
      </main>
    </div>
  )
}
