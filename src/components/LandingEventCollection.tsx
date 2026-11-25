'use client'

import { useMemo, useRef, useState } from 'react'
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
  if (Number.isNaN(parsed.getTime())) return { month: 'TBA', day: '--', year: '', full: 'Tanggal menyusul' }
  return {
    month: new Intl.DateTimeFormat('id-ID', { month: 'short' }).format(parsed).replace('.', '').toUpperCase(),
    day: new Intl.DateTimeFormat('id-ID', { day: '2-digit' }).format(parsed),
    year: new Intl.DateTimeFormat('id-ID', { year: 'numeric' }).format(parsed),
    full: new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(parsed),
  }
}

export default function LandingEventCollection({ events }: { events: LandingEventCardItem[] }) {
  const [activeFilter, setActiveFilter] = useState<EventFilter>(() =>
    events.some((event) => event.status === 'UPCOMING') ? 'UPCOMING' : 'ALL',
  )
  const [activeIndex, setActiveIndex] = useState(1)
  const [hasScrolled, setHasScrolled] = useState(false)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const visibleEvents = useMemo(
    () => activeFilter === 'ALL' ? events : events.filter((event) => event.status === activeFilter),
    [activeFilter, events],
  )
  const activeTabId = `event-filter-${activeFilter.toLowerCase()}`

  const selectFilter = (filter: EventFilter) => {
    setActiveFilter(filter)
    setActiveIndex(1)
  }

  const handleCarouselScroll = (element: HTMLDivElement) => {
    setHasScrolled(true)
    const firstCard = element.firstElementChild as HTMLElement | null
    if (!firstCard) return
    const gap = Number.parseFloat(window.getComputedStyle(element).columnGap) || 0
    const step = firstCard.getBoundingClientRect().width + gap
    if (!step) return
    setActiveIndex(Math.min(visibleEvents.length, Math.max(1, Math.round(element.scrollLeft / step) + 1)))
  }

  return (
    <section className="homepage-event-collection" aria-label="Daftar event">
      <div className="homepage-event-collection-inner">
        <div className="homepage-event-filters" role="tablist" aria-label="Filter status event">
          {filters.map((filter, index) => (
            <button
              key={filter.id}
              ref={(element) => { tabRefs.current[index] = element }}
              type="button"
              id={`event-filter-${filter.id.toLowerCase()}`}
              role="tab"
              aria-selected={activeFilter === filter.id}
              aria-controls="event-cards-panel"
              tabIndex={activeFilter === filter.id ? 0 : -1}
              className={`homepage-event-filter${activeFilter === filter.id ? ' is-active' : ''}`}
              onClick={() => selectFilter(filter.id)}
              onKeyDown={(event) => {
                let nextIndex: number | null = null
                if (event.key === 'ArrowRight') nextIndex = (index + 1) % filters.length
                if (event.key === 'ArrowLeft') nextIndex = (index - 1 + filters.length) % filters.length
                if (event.key === 'Home') nextIndex = 0
                if (event.key === 'End') nextIndex = filters.length - 1
                if (nextIndex === null) return
                event.preventDefault()
                selectFilter(filters[nextIndex].id)
                tabRefs.current[nextIndex]?.focus()
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>
        {!hasScrolled ? <p className="homepage-event-collection-hint" aria-hidden="true">
          Geser ke samping untuk melihat event lainnya <span>→</span>
        </p> : null}

        {visibleEvents.length === 0 ? (
          <div
            id="event-cards-panel"
            className="homepage-event-collection-empty"
            role="tabpanel"
            aria-labelledby={activeTabId}
            tabIndex={0}
          >
            <p role="status">
              {activeFilter === 'LIVE'
                ? 'Belum ada event yang sedang live.'
                : activeFilter === 'UPCOMING'
                  ? 'Belum ada event yang dijadwalkan.'
                  : 'Belum ada event untuk ditampilkan.'}
            </p>
            <Link href="/untuk-panitia" className="homepage-event-collection-empty-link">
              Hubungi Panitia / Info Event
            </Link>
          </div>
        ) : (
          <div
            key={activeFilter}
            id="event-cards-panel"
            className="homepage-event-collection-list"
            role="tabpanel"
            aria-labelledby={activeTabId}
            aria-label="Kartu event, geser ke samping untuk melihat lainnya"
            tabIndex={0}
            onScroll={(event) => handleCarouselScroll(event.currentTarget)}
          >
            {visibleEvents.map((event, index) => {
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
                        unoptimized
                        {...(index === 0 ? { priority: true } : { loading: 'lazy' as const })}
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
                      <strong>{date.day}</strong>
                      <span>{date.month} {date.year}</span>
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
        {visibleEvents.length > 0 ? (
          <p className="homepage-event-collection-position" aria-live="polite">
            {activeIndex}/{visibleEvents.length}
          </p>
        ) : null}
      </div>
    </section>
  )
}
