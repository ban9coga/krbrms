'use client'

import { useMemo, useState } from 'react'
import PublicTopbar from './PublicTopbar'
import EmptyState from './EmptyState'
import type { EventItem } from '../lib/eventService'

type LandingTopbarProps = {
  events: EventItem[]
}

export default function LandingTopbar({ events }: LandingTopbarProps) {
  const [showRegisterPicker, setShowRegisterPicker] = useState(false)
  const sortedEvents = useMemo(
    () =>
      [...events].sort((a, b) => {
        const aDate = new Date(a.event_date).getTime()
        const bDate = new Date(b.event_date).getTime()
        return aDate - bDate
      }),
    [events]
  )

  return (
    <>
      <PublicTopbar onRegisterClick={() => setShowRegisterPicker(true)} />

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
              borderRadius: 18,
              border: '1px solid rgba(15, 23, 42, 0.12)',
              boxShadow: '0 20px 50px rgba(15, 23, 42, 0.15)',
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
                  border: '1px solid rgba(15, 23, 42, 0.2)',
                  background: '#fbe7e7',
                  borderRadius: 10,
                  padding: '6px 10px',
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                Tutup
              </button>
            </div>

            {sortedEvents.length === 0 && <EmptyState label="Belum ada event untuk pendaftaran." />}

            <div style={{ display: 'grid', gap: 10 }}>
              {sortedEvents.map((event) => (
                <a
                  key={event.id}
                  href={`/event/${event.id}/register`}
                  style={{
                    border: '1px solid rgba(15, 23, 42, 0.12)',
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
    </>
  )
}
