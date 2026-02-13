'use client'

import { useEffect, useState } from 'react'
import EventCard from '../components/EventCard'
import EmptyState from '../components/EmptyState'
import LoadingState from '../components/LoadingState'
import PageSection from '../components/PageSection'
import PublicTopbar from '../components/PublicTopbar'
import { getEvents, type EventItem } from '../lib/eventService'

export default function LandingPage() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(false)
  const [showRegisterPicker, setShowRegisterPicker] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const upcoming = await getEvents('UPCOMING')
      const live = await getEvents('LIVE')
      const finished = await getEvents('FINISHED')
      setEvents([...upcoming, ...live, ...finished])
      setLoading(false)
    }
    load()
  }, [])

  const upcomingEvents = events.filter((event) => event.status === 'UPCOMING')
  const ongoingEvents = events.filter((event) => event.status === 'LIVE')
  const finishedEvents = events.filter((event) => event.status === 'FINISHED')

  return (
    <div style={{ minHeight: '100vh', background: '#eaf7ee', color: '#111' }}>
      <PublicTopbar onRegisterClick={() => setShowRegisterPicker(true)} />

      <main style={{ maxWidth: '980px', margin: '0 auto', padding: '24px 20px 48px' }}>
        {showRegisterPicker && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              display: 'grid',
              placeItems: 'center',
              zIndex: 50,
              padding: 16,
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 520,
                background: '#fff',
                borderRadius: 16,
                border: '2px solid #111',
                padding: 16,
                display: 'grid',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 900, fontSize: 18 }}>Pilih Event untuk Pendaftaran</div>
                <button
                  type="button"
                  onClick={() => setShowRegisterPicker(false)}
                  style={{
                    border: '2px solid #111',
                    background: '#ffe1e1',
                    borderRadius: 10,
                    padding: '6px 10px',
                    fontWeight: 800,
                  }}
                >
                  Tutup
                </button>
              </div>

              {loading && <LoadingState />}
              {!loading && events.length === 0 && <EmptyState label="Belum ada event untuk pendaftaran." />}

              <div style={{ display: 'grid', gap: 10 }}>
                {events.map((event) => (
                  <a
                    key={event.id}
                    href={`/event/${event.id}/register`}
                    style={{
                      border: '2px solid #111',
                      borderRadius: 12,
                      padding: 12,
                      textDecoration: 'none',
                      color: '#111',
                      background: event.status === 'LIVE' ? '#d7ffd9' : '#eaf7ee',
                      display: 'grid',
                      gap: 4,
                    }}
                  >
                    <div style={{ fontWeight: 900 }}>{event.name}</div>
                    <div style={{ fontSize: 12 }}>{event.location}</div>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>{event.status}</div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}

        <div id="ongoing-events">
          <PageSection title="Ongoing Events">
          {loading && <LoadingState />}
          {!loading && ongoingEvents.length === 0 && (
            <EmptyState label="Belum ada event yang sedang berlangsung." />
          )}
          <div style={{ display: 'grid', gap: '12px' }}>
            {ongoingEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
          </PageSection>
        </div>

        <PageSection title="Coming Soon">
          {loading && <LoadingState />}
          {!loading && upcomingEvents.length === 0 && (
            <EmptyState label="Belum ada event yang akan datang." />
          )}
          <div style={{ display: 'grid', gap: '12px' }}>
            {upcomingEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </PageSection>

        <PageSection title="Completed Events">
          {loading && <LoadingState />}
          {!loading && finishedEvents.length === 0 && (
            <EmptyState label="Belum ada event yang selesai." />
          )}
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

