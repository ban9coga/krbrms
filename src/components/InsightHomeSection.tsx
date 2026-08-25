import Link from 'next/link'
import type { InsightPost } from '../lib/insight'
import InsightCard from './InsightCard'

export default function InsightHomeSection({ posts }: { posts: InsightPost[] }) {
  return (
    <section className="homepage-editorial-section insight-home-section">
      <div className="homepage-editorial-section-inner">
        <div className="homepage-editorial-section-heading">
          <div>
            <p className="homepage-editorial-section-kicker">RacePushbike Insight</p>
            <h2>Lebih Paham Sebelum Race Dimulai.</h2>
            <p className="homepage-editorial-section-description">
              Panduan singkat tentang aturan race, pembagian batch, scoring, dan hal-hal yang sering ditanyakan orang tua rider.
            </p>
          </div>
          <Link href="/insight" className="homepage-editorial-section-action">
            Lihat Semua Insight <span aria-hidden="true">&#8594;</span>
          </Link>
        </div>

        {posts.length > 0 ? (
          <div className="insight-home-grid">
            {posts.map((post) => (
              <InsightCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <div className="homepage-editorial-empty-state">Artikel Insight akan segera hadir.</div>
        )}
      </div>
    </section>
  )
}
