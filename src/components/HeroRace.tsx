import Link from 'next/link'
import Image from 'next/image'
import type { LiveEventItem } from '../lib/liveEvent'

const heroStats = [
  { value: 'Digital Scoring Room', label: 'Real-Time & Paperless' },
  { value: 'Drawing Batch', label: 'Gate dan Moto Otomatis' },
  { value: 'Live Result', label: 'E-Sertifikat dengan QR' },
]

const tickerItems = [
  { label: 'YOUR DIGITAL SCORING ROOM', accent: true },
  { label: 'LIVE SCORING REAL-TIME', accent: false },
  { label: 'PENDAFTARAN ONLINE', accent: true },
  { label: 'DRAWING BATCH & GATE', accent: true },
  { label: 'JADWAL RACE PUSHBIKE INDONESIA', accent: false },
  { label: 'HASIL RACE TRANSPARAN', accent: false },
  { label: 'E-SERTIFIKAT TERVERIFIKASI', accent: true },
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
            PLATFORM EVENT RACE PUSHBIKE INDONESIA
          </div>

          <h1 className="homepage-editorial-title">
          
            <span className="homepage-editorial-title-line">
             <span>Dari </span><mark>Registrasi,</mark> Drawing <mark> Batch, </mark> Live Score <mark> Realtime,</mark>  sampai <mark>E-Certificate.</mark>
            </span>
          </h1>

          <div className="homepage-editorial-actions">
            <Link href="/jadwal-race-pushbike" className="homepage-editorial-action homepage-editorial-action-primary">
              Cari Event &amp; Daftar
            </Link>
            <Link
              href="/live-results"
              className={`homepage-editorial-action homepage-editorial-action-secondary ${
                liveEvent ? 'homepage-editorial-live-score-cta' : ''
              }`}
            >
              Lihat Live Score
              {liveEvent ? (
                <span className="homepage-editorial-live-event-name" title={liveEvent.name}>
                  {liveEvent.name}
                </span>
              ) : null}
              
            </Link>
          </div>

          <div className="homepage-editorial-organizer-cta">
            <p>Komunitas atau EO? Percayakan event pushbike Anda dengan RacePushbike.com</p>
            <Link href="/untuk-panitia" className="homepage-editorial-organizer-button">
              Lihat fitur <span aria-hidden="true">→</span>
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
