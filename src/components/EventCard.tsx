import Link from 'next/link'
import StatusBadge from './StatusBadge'
import type { EventItem } from '../lib/eventService'

export default function EventCard({ event }: { event: EventItem }) {
  const showGoGreen = event.status === 'LIVE'

  return (
    <Link
      href={`/event/${event.id}`}
      style={{
        textDecoration: 'none',
        color: '#111',
      }}
    >
      <div
        style={{
          padding: '16px',
          borderRadius: '16px',
          border: '1px solid rgba(15, 23, 42, 0.12)',
          boxShadow: '0 10px 24px rgba(15, 23, 42, 0.06)',
          background: '#fff',
          display: 'grid',
          gap: '10px',
          transition: 'transform 0.12s ease, box-shadow 0.12s ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: '17px', letterSpacing: '-0.01em' }}>{event.name}</div>
          <StatusBadge
            label={
              event.status === 'LIVE'
                ? 'Ongoing Event'
                : event.status === 'FINISHED'
                ? 'Completed Event'
                : 'Coming Soon'
            }
          />
        </div>
        {showGoGreen ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                border: '1px solid rgba(15, 23, 42, 0.2)',
                borderRadius: 999,
                padding: '4px 10px',
                background: '#2ecc71',
                fontWeight: 900,
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
                <path
                  d="M4 13c5.5-2.2 9.2-5.8 11-10 3 3 4.5 7.5 2.5 11.5C16 18 12.5 20 9 20c-3.3 0-5-1.7-5-4.5 0-.9 0-1.7.4-2.5Z"
                  fill="#0f5f2d"
                />
                <path d="M9 20c3-4 5.5-7.5 10-10" stroke="#0f5f2d" strokeWidth="2" fill="none" />
              </svg>
              Go Green
            </span>
            <span
              style={{
                border: '1px solid rgba(15, 23, 42, 0.2)',
                borderRadius: 999,
                padding: '4px 10px',
                background: '#fff',
                fontWeight: 800,
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
                <path
                  d="M6 16a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm12 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6ZM6 12h7l2-4h3l-1.5 4h-4l-2 4H7"
                  fill="#111"
                />
                <circle cx="6" cy="13" r="2" fill="#2ecc71" />
                <circle cx="18" cy="13" r="2" fill="#2ecc71" />
              </svg>
              Pushbike + Alam
            </span>
            <span
              style={{
                border: '1px solid rgba(15, 23, 42, 0.2)',
                borderRadius: 999,
                padding: '4px 10px',
                background: '#fff',
                fontWeight: 800,
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
                <path d="M5 20h2V6H5v14Zm6 0h2V10h-2v10Zm6 0h2V4h-2v16Z" fill="#111" />
                <path d="M5 6h14V4H5v2Z" fill="#2ecc71" />
              </svg>
              Live Scoring
            </span>
          </div>
        ) : null}
        <div style={{ color: '#374151', fontSize: '14px' }}>
          Lokasi: {event.location || '-'}
        </div>
        <div style={{ color: '#374151', fontSize: '14px' }}>
          Tanggal:{' '}
          {new Date(event.event_date).toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </div>
      </div>
    </Link>
  )
}
