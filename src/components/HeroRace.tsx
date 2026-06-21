import Link from 'next/link'
import type { LiveEventItem } from '../lib/liveEvent'

const heroStats = [
  { value: '01', label: 'Integrated Platform' },
  { value: 'Multi', label: 'Stage Race Engine' },
  { value: 'Live', label: 'Public Results' },
]

export default function HeroRace({ liveEvent }: { liveEvent: LiveEventItem | null }) {
  return (
    <section className="homepage-editorial-hero-shell">
      <div className="homepage-editorial-hero">
        <div className="homepage-editorial-hero-media" aria-hidden="true" />
        <div className="homepage-editorial-hero-shade" aria-hidden="true" />

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
          <span>LIVE SCORING REAL-TIME</span>
          <strong>PENDAFTARAN ONLINE</strong>
          <span>HASIL RACE TRANSPARAN</span>
          <strong>MULTI KATEGORI USIA</strong>
          <span>JURY &amp; MARSHAL DASHBOARD</span>
          <strong>KOMUNITAS PUSHBIKE &amp; BALANCE BIKE INDONESIA</strong>
        </div>
      </div>
    </section>
  )
}
