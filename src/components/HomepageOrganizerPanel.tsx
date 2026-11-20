import Link from 'next/link'
import { SITE_INSTAGRAM_DM_URL, SITE_INSTAGRAM_URL } from '../lib/structuredData'

export default function HomepageOrganizerPanel() {
  return (
    <section className="homepage-organizer-panel" aria-labelledby="homepage-organizer-title">
      <div className="homepage-organizer-copy">
        <p className="homepage-organizer-kicker">Untuk komunitas dan penyelenggara</p>
        <h2 id="homepage-organizer-title">Komunitas atau EO? Kelola event kamu pakai RacePushbike</h2>
      </div>
      <div className="homepage-organizer-actions">
        <div className="homepage-organizer-action-row">
          <Link href="/untuk-panitia" className="homepage-organizer-action homepage-organizer-action-primary">
            Lihat Fitur
          </Link>
          <a
            href={SITE_INSTAGRAM_DM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="homepage-organizer-action homepage-organizer-action-secondary"
          >
            Chat via Instagram
          </a>
        </div>
        <a
          href={SITE_INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="homepage-organizer-instagram-link"
        >
          Lihat Instagram kami
        </a>
      </div>
    </section>
  )
}
