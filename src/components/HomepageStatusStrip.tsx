import Link from 'next/link'
import type { EventItem } from '../lib/eventService'
import type { LiveEventItem } from '../lib/liveEvent'

type StatusEvent = Pick<EventItem, 'id' | 'name' | 'location' | 'event_date'>

export default function HomepageStatusStrip({
  liveEvent,
  upcomingEvent,
  latestFinishedEvent,
}: {
  liveEvent: LiveEventItem | null
  upcomingEvent: StatusEvent | null
  latestFinishedEvent: Pick<EventItem, 'id' | 'name'> | null
}) {
  if (liveEvent) {
    return (
      <section className="homepage-status-strip homepage-status-strip-live" aria-label="Event yang sedang berlangsung">
        <span className="homepage-status-strip-badge">
          <span className="homepage-editorial-live-dot" aria-hidden="true" />
          LIVE sekarang
        </span>
        <div className="homepage-status-strip-copy">
          <strong>{liveEvent.name}</strong>
          {liveEvent.location ? <span>{liveEvent.location}</span> : null}
        </div>
        <Link href={`/event/${liveEvent.id}`} className="homepage-status-strip-action">
          Lihat Live Score
        </Link>
      </section>
    )
  }

  if (upcomingEvent) {
    const dateLabel = new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Jakarta',
    }).format(new Date(upcomingEvent.event_date))

    return (
      <section className="homepage-status-strip homepage-status-strip-upcoming" aria-label="Event terdekat">
        <span className="homepage-status-strip-badge">EVENT TERDEKAT</span>
        <div className="homepage-status-strip-copy">
          <strong>{upcomingEvent.name}</strong>
          <span>
            {dateLabel}{upcomingEvent.location ? `, ${upcomingEvent.location}` : ''}
          </span>
        </div>
        <Link href={`/event/${upcomingEvent.id}/register`} className="homepage-status-strip-action">
          Daftar
        </Link>
      </section>
    )
  }

  return (
    <section className="homepage-status-strip homepage-status-strip-empty" aria-label="Status pendaftaran event">
      <div className="homepage-status-strip-copy">
        <strong>Belum ada event dibuka</strong>
        <span>
          {latestFinishedEvent
            ? `Lihat hasil terbaru: ${latestFinishedEvent.name}`
            : 'Silakan cek lagi nanti untuk jadwal event berikutnya.'}
        </span>
      </div>
      {latestFinishedEvent ? (
        <Link href={`/event/${latestFinishedEvent.id}/results`} className="homepage-status-strip-action">
          Lihat hasil
        </Link>
      ) : null}
    </section>
  )
}
