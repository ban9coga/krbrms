import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import InsightCard from '../../components/InsightCard'
import MarketingTopbar from '../../components/MarketingTopbar'
import {
  INSIGHT_CATEGORIES,
  getInsightCategoryFromSlug,
  getPublishedInsightPosts,
} from '../../lib/insight'
import { SITE_URL } from '../../lib/structuredData'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'RacePushbike Insight | Cerita, Aturan, dan Kultur Race Pushbike',
  description: 'Liputan dan panduan race pushbike untuk wali rider, komunitas, dan panitia: dari aturan, scoring, sampai cerita di balik race day.',
  alternates: { canonical: `${SITE_URL}/insight` },
  openGraph: {
    title: 'RacePushbike Insight | Cerita, Aturan, dan Kultur Race Pushbike',
    description: 'Liputan dan panduan race pushbike untuk wali rider, komunitas, dan panitia.',
    url: `${SITE_URL}/insight`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RacePushbike Insight | Cerita, Aturan, dan Kultur Race Pushbike',
    description: 'Liputan dan panduan race pushbike untuk wali rider, komunitas, dan panitia.',
  },
}

type InsightListingPageProps = {
  searchParams: Promise<{ category?: string | string[] }>
}

export default async function InsightListingPage({ searchParams }: InsightListingPageProps) {
  const params = await searchParams
  const categorySlug = typeof params.category === 'string' ? params.category : null
  const selectedCategory = getInsightCategoryFromSlug(categorySlug)
  const posts = await getPublishedInsightPosts(selectedCategory?.value)
  const featured = posts[0] ?? null
  const rest = featured ? posts.slice(1) : []

  return (
    <div className="public-page insight-page">
      <MarketingTopbar variant="editorial" />
      <main className="insight-main">
        <section className="insight-listing-hero">
          <Image
            src="/homepage-hero-texture-v2.webp"
            alt=""
            fill
            priority
            sizes="(max-width: 1400px) 100vw, 1380px"
            className="insight-listing-hero-media"
            aria-hidden="true"
          />
          <div className="insight-listing-hero-shade" aria-hidden="true" />
          <div className="insight-listing-hero-flag" aria-hidden="true"><span /></div>
          <div className="insight-listing-hero-content">
            <p className="insight-listing-edition">RacePushbike Insight - Race Day Journal</p>
            <h1>
              <span>Cerita, Aturan, dan Kultur</span>
              <span><mark>di Balik Race Pushbike.</mark></span>
            </h1>
            <span>
              Liputan dan panduan untuk wali rider, komunitas, serta panitia yang ingin memahami race pushbike dengan lebih jernih.
            </span>
          </div>
        </section>

        <nav className="insight-category-filter" aria-label="Filter kategori Insight">
          <Link href="/insight" className={!selectedCategory ? 'is-active' : undefined}>
            Semua
          </Link>
          {INSIGHT_CATEGORIES.map((category) => (
            <Link
              key={category.value}
              href={`/insight?category=${category.slug}`}
              className={selectedCategory?.value === category.value ? 'is-active' : undefined}
            >
              {category.label}
            </Link>
          ))}
        </nav>

        {featured ? (
          <>
            <section className="insight-featured-section" aria-labelledby="featured-insight-title">
              <div className="insight-section-heading">
                <p>Cover story</p>
                <h2 id="featured-insight-title">Mulai dari yang paling baru.</h2>
              </div>
              <InsightCard post={featured} featured priority />
            </section>

            {rest.length > 0 ? (
              <section className="insight-latest-section" aria-labelledby="latest-insight-title">
                <div className="insight-section-heading">
                  <p>{selectedCategory ? selectedCategory.label : 'Artikel Lainnya'}</p>
                  <h2 id="latest-insight-title">Baca dan pahami race dengan lebih tenang.</h2>
                </div>
                <div className="insight-grid">
                  {rest.map((post) => (
                    <InsightCard key={post.id} post={post} />
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <section className="insight-empty-state" aria-live="polite">
            <h2>Belum ada artikel di kategori ini.</h2>
            <p>Artikel baru sedang disiapkan. Coba pilih kategori lain atau kembali lagi nanti.</p>
            {selectedCategory ? <Link href="/insight">Lihat semua Insight</Link> : null}
          </section>
        )}
      </main>
    </div>
  )
}
