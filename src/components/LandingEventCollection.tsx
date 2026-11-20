'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { EventItem } from '../lib/eventService'

export type LandingEventCardItem = EventItem & {
  logoUrl: string | null
  posterUrl: string | null
  slogan: string | null
  canRegister: boolean
  riderTotal?: number
}

const filters = [
  { id: 'ALL', label: 'Semua Event' },
  { id: 'UPCOMING', label: 'Akan Datang' },
  { id: 'LIVE', label: 'Live' },
  { id: 'FINISHED', label: 'Selesai' },
] as const

type EventFilter = (typeof filters)[number]['id']

const statusLabels: Record<EventItem['status'], string> = {
  UPCOMING: 'Akan Datang',
  LIVE: 'Sedang Live',
  FINISHED: 'Selesai',
}

const dateParts = (date: string) => {
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return { month: 'TBA', day: '--', full: 'Tanggal menyusul' }
  return {
    month: new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(parsed).replace('.', '').toUpperCase(),
    day: new Intl.DateTimeFormat('id-ID', { day: '2-digit' }).format(parsed),
    full: new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(parsed),
  }
}

export default function LandingEventCollection({ events }: { events: LandingEventCardItem[] }) {
  const [activeFilter, setActiveFilter] = useState<EventFilter>('ALL')
  const visibleEvents = useMemo(
    () => activeFilter === 'ALL' ? events : events.filter((event) => event.status === activeFilter),
    [activeFilter, events],
  )

  return (
    <section className="homepage-event-collection" aria-label="Daftar event">
      <div className="homepage-event-collection-inner">
        <div className="homepage-event-filters" role="group" aria-label="Filter status event">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`homepage-event-filter${activeFilter === filter.id ? ' is-active' : ''}`}
              aria-pressed={activeFilter === filter.id}
              onClick={() => setActiveFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {visibleEvents.length === 0 ? (
          <p className="homepage-event-collection-empty" role="status">
            {activeFilter === 'ALL' ? 'Belum ada event untuk ditampilkan.' : `Belum ada event ${filters.find((filter) => filter.id === activeFilter)?.label.toLowerCase()}.`}
          </p>
        ) : (
          <div className="homepage-event-collection-list">
            {visibleEvents.map((event) => {
              const date = dateParts(event.event_date)
              const detailHref = `/event/${event.id}`
              const actionHref = event.status === 'UPCOMING' && event.canRegister
                ? `/event/${event.id}/register`
                : detailHref
              const actionLabel = event.status === 'UPCOMING'
                ? event.canRegister ? 'Daftar Rider' : 'Lihat Detail'
                : event.status === 'LIVE' ? 'Buka Live Event' : 'Lihat Hasil'

              const coverUrl = event.posterUrl || event.logoUrl

              return (
                <article key={event.id} className={`homepage-event-card homepage-event-card-${event.status.toLowerCase()}`}>
                  <Link href={detailHref} className="homepage-event-card-cover">
                    {coverUrl ? (
                      <Image
                        src={coverUrl}
                        alt=""
                        fill
                        sizes="(max-width: 760px) calc(100vw - 56px), (max-width: 1180px) 50vw, 560px"
                        quality={65}
                        className="homepage-event-card-cover-image"
                      />
                    ) : <span className="homepage-event-card-cover-placeholder" aria-hidden="true">RP</span>}
                    <span className="homepage-event-card-cover-shade" aria-hidden="true" />
                    <span className={`homepage-event-status homepage-event-status-${event.status.toLowerCase()}`}>
                      {statusLabels[event.status]}
                    </span>
                    {event.status === 'UPCOMING' && !event.canRegister ? (
                      <span className="homepage-event-registration-badge">
                        {event.registration_open === false ? 'Pendaftaran ditutup' : 'Kuota penuh'}
                      </span>
                    ) : null}
                    <time className="homepage-event-date" dateTime={event.event_date} title={date.full}>
                      <span>{date.month}</span>
                      <strong>{date.day}</strong>
                    </time>
                    <span className="homepage-event-card-cover-copy">
                      <strong className="homepage-event-card-cover-title">{event.name}</strong>
                      <span className="homepage-event-card-cover-location">{event.location || 'Lokasi menyusul'}</span>
                    </span>
                  </Link>
                  <div className="homepage-event-card-body">
                    {event.slogan ? <p className="homepage-event-card-slogan">{event.slogan}</p> : null}
                    <div className="homepage-event-card-footer">
                      <span className="homepage-event-card-footer-status">
                        {event.event_scope === 'INTERNAL' ? 'Event internal' : 'Public event'}
                        {event.riderTotal !== undefined
                          ? ` · ${event.riderTotal.toLocaleString('id-ID')} rider`
                          : ''}
                      </span>
                      <Link
                        href={actionHref}
                        className={`homepage-event-card-action${event.status === 'UPCOMING' && event.canRegister ? ' is-register' : ' is-secondary'}`}
                      >
                        {actionLabel}
                      </Link>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
