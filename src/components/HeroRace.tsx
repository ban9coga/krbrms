import Link from 'next/link'
import LiveEntryButton from './LiveEntryButton'

type LiveEventItem = {
  id: string
  name: string
  location?: string | null
}

const heroStats = [
  { value: '01', label: 'Integrated Platform' },
  { value: 'Multi', label: 'Stage Race Engine' },
  { value: 'Live', label: 'Public Results' },
]

export default function HeroRace({ liveEvent }: { liveEvent: LiveEventItem | null }) {
  const eventHref = liveEvent ? `/event/${liveEvent.id}` : '/dashboard'

  return (
    <section className="homepage-editorial-hero-shell">
      <div className="homepage-editorial-hero">
        <div className="homepage-editorial-hero-media" aria-hidden="true" />
        <div className="homepage-editorial-hero-shade" aria-hidden="true" />

        <div className="homepage-editorial-hero-content">
          <div className="homepage-editorial-kicker">
            <span className={liveEvent ? 'homepage-editorial-live-dot' : 'homepage-editorial-idle-dot'} />
            {liveEvent ? `LIVE EVENT · ${liveEvent.name}` : 'PUSHBIKE RACE MANAGEMENT · SEASON 2026'}
          </div>

          <h1 className="homepage-editorial-title">
            <span>Race management built for</span>
            <span className="homepage-editorial-title-line">
              <mark>faster</mark> decisions.
            </span>
          </h1>

          <p className="homepage-editorial-copy">
            Registrasi rider, gate assignment, jury workflow, penalty, scoring, dan live results dalam satu
            platform untuk race day yang lebih terkendali.
          </p>

          <div className="homepage-editorial-actions">
            <LiveEntryButton
              label="Pantau Live"
              mode="display"
              fallbackHref="/dashboard"
              className="homepage-editorial-action homepage-editorial-action-primary"
            />
            <Link href={eventHref} className="homepage-editorial-action homepage-editorial-action-secondary">
              {liveEvent ? 'Buka Event Live' : 'Lihat Semua Event'}
              <span aria-hidden="true">→</span>
            </Link>
          </div>

          <div className="homepage-editorial-stats" aria-label="Platform capabilities">
            {heroStats.map((stat) => (
              <div key={stat.label} className="homepage-editorial-stat">
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="homepage-editorial-ticker" aria-label="Platform features">
          <span>LIVE SCORING</span>
          <strong>READY</strong>
          <span>GATE & MOTO CONTROL</span>
          <strong>CONNECTED</strong>
          <span>CHECKER · FINISHER · MC</span>
          <strong>ACTIVE</strong>
          <span>PUBLIC RESULTS</span>
          <strong>UPDATED</strong>
        </div>
      </div>
    </section>
  )
}
