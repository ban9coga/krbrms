 'use client'

import Link from 'next/link'
import StatusBadge from './StatusBadge'
import type { EventItem } from '../lib/eventService'

export default function EventCard({
  event,
  index = 0,
  logoUrl,
  slogan,
}: {
  event: EventItem
  index?: number
  logoUrl?: string | null
  slogan?: string | null
}) {
  const showGoGreen = event.status === 'LIVE'
  const headerBg = event.status === 'LIVE' ? '#e9fff1' : '#fff'

  return (
    <Link
      href={`/event/${event.id}`}
      style={{
        textDecoration: 'none',
        color: '#111',
        display: 'block',
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
          animation: 'fadeUp 0.4s ease both',
          animationDelay: `${index * 40}ms`,
        }}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'
          ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 14px 30px rgba(15, 23, 42, 0.1)'
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'
          ;(e.currentTarget as HTMLDivElement).style.boxShadow = '0 10px 24px rgba(15, 23, 42, 0.06)'
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '12px',
            alignItems: 'center',
            padding: '10px 12px',
            borderRadius: 12,
            background: headerBg,
            border: '1px solid rgba(15, 23, 42, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`${event.name} logo`}
                style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover', border: '1px solid #e5e7eb' }}
              />
            ) : null}
            <div style={{ display: 'grid', gap: 2 }}>
              <div style={{ fontWeight: 900, fontSize: '17px', letterSpacing: '-0.01em' }}>{event.name}</div>
              {slogan ? <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 700 }}>{slogan}</div> : null}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {event.status === 'LIVE' && (
              <span
                style={{
                  padding: '4px 8px',
                  borderRadius: 999,
                  background: '#16a34a',
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: 11,
                  letterSpacing: '0.04em',
                }}
              >
                LIVE NOW
              </span>
            )}
            {event.status !== 'LIVE' && (
              <StatusBadge
                label={event.status === 'FINISHED' ? 'Completed Event' : 'Coming Soon'}
              />
            )}
          </div>
        </div>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 700 }}>Klik untuk detail</span>
          <span
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: '1px solid rgba(15, 23, 42, 0.18)',
              fontWeight: 900,
              fontSize: 12,
              background: '#f5f7fa',
            }}
          >
            Detail Event
          </span>
        </div>
      </div>
    </Link>
  )
}
