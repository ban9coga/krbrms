import Link from 'next/link'
import Image from 'next/image'
import type { LiveEventItem } from '../lib/liveEvent'

const heroStats = [
  { value: 'End-to-End', label: 'Registration to Results' },
  { value: 'Real-Time', label: 'Live Scoring & Race Control' },
  { value: 'Connected', label: 'Organizer, Jury & Parents' },
]

const tickerItems = [
  { label: 'LIVE SCORING REAL-TIME', accent: false },
  { label: 'PENDAFTARAN ONLINE', accent: true },
  { label: 'HASIL RACE TRANSPARAN', accent: false },
  { label: 'MULTI KATEGORI USIA', accent: true },
  { label: 'JURY & MARSHAL DASHBOARD', accent: false },
  { label: 'KOMUNITAS PUSHBIKE & BALANCE BIKE INDONESIA', accent: true },
]

export default function HeroRace({ liveEvent }: { liveEvent: LiveEventItem | null }) {
  return (
    <section className="homepage-editorial-hero-shell">
      <div className="homepage-editorial-hero">
        <Image
          src="/homepage-hero-texture-v2.webp"
          alt=""
          fill
          priority
          fetchPriority="high"
          unoptimized
          sizes="100vw"
          className="homepage-editorial-hero-media"
          aria-hidden="true"
        />
        <div className="homepage-editorial-hero-shade" aria-hidden="true" />
        <div className="homepage-race-speed-lines homepage-race-speed-lines-left" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="homepage-race-speed-lines homepage-race-speed-lines-right" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="homepage-race-track-mark" aria-hidden="true">
          <span>RACE</span>
          <strong>01</strong>
        </div>
        <div className="homepage-race-checkered-flag" aria-hidden="true">
          <span />
        </div>
        <div className="homepage-race-motion-orbit" aria-hidden="true" />

        <div className="homepage-editorial-hero-content">
          <div className="homepage-editorial-kicker">
            <span className={liveEvent ? 'homepage-editorial-live-dot' : 'homepage-editorial-idle-dot'} />
            RACEPUSHBIKE.COM - PLATFORM RACE PUSHBIKE &amp; BALANCE BIKE · INDONESIA
          </div>

          <h1 className="homepage-editorial-title">
            <span>Platform Race Pushbike</span>
            <span className="homepage-editorial-title-line">
              <mark>Terpercaya</mark> untuk Komunitas se-Indonesia
            </span>
          </h1>

          <p className="homepage-editorial-copy">
            Daftarkan si kecil ke race pushbike terdekat, atau kelola event komunitasmu sendiri dengan sistem
            live scoring real-time yang sudah dipercaya komunitas di berbagai kota.
          </p>

          <div className="homepage-editorial-actions">
            <Link href="/dashboard" className="homepage-editorial-action homepage-editorial-action-primary">
              Cari Race &amp; Daftar
            </Link>
            <Link href="/live-results" className="homepage-editorial-action homepage-editorial-action-secondary">
              Cek Live Skor
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
          <div className="homepage-editorial-ticker-track">
            {[0, 1].map((groupIndex) => (
              <div
                key={groupIndex}
                className="homepage-editorial-ticker-group"
                aria-hidden={groupIndex === 1 ? 'true' : undefined}
              >
                {tickerItems.map((item) =>
                  item.accent ? (
                    <strong key={item.label}>{item.label}</strong>
                  ) : (
                    <span key={item.label}>{item.label}</span>
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
