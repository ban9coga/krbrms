import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import InsightCard from '../../../components/InsightCard'
import InsightMarkdown from '../../../components/InsightMarkdown'
import InsightBlocks from '../../../components/InsightBlocks'
import InsightRuleDisclaimer from '../../../components/InsightRuleDisclaimer'
import MarketingTopbar from '../../../components/MarketingTopbar'
import {
  formatInsightDate,
  getInsightCategoryLabel,
  getPublishedInsightPostBySlug,
  getRelatedInsightPosts,
} from '../../../lib/insight'
import { serializeJsonLd, SITE_URL } from '../../../lib/structuredData'

export const revalidate = 3600

type InsightArticlePageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: InsightArticlePageProps): Promise<Metadata> {
  const { slug } = await params
  const post = await getPublishedInsightPostBySlug(slug)
  if (!post) return { title: 'Artikel Tidak Ditemukan' }

  const title = post.seo_title || post.title
  const description = post.seo_description || post.excerpt
  const canonical = post.canonical_url || `${SITE_URL}/insight/${post.slug}`

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'article',
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at,
      authors: [post.author_name],
      images: post.cover_image_url
        ? [{ url: post.cover_image_url, alt: post.cover_image_alt || post.title }]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: post.cover_image_url ? [post.cover_image_url] : undefined,
    },
  }
}

export default async function InsightArticlePage({ params }: InsightArticlePageProps) {
  const { slug } = await params
  const post = await getPublishedInsightPostBySlug(slug)
  if (!post) notFound()

  const related = await getRelatedInsightPosts(post)
  const publishedDate = formatInsightDate(post.published_at)
  const updatedDate = formatInsightDate(post.updated_at)
  const isUpdated = post.published_at && post.updated_at && new Date(post.updated_at).getTime() - new Date(post.published_at).getTime() > 24 * 60 * 60 * 1000
  const articleUrl = post.canonical_url || `${SITE_URL}/insight/${post.slug}`
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.seo_description || post.excerpt,
      datePublished: post.published_at,
      dateModified: post.updated_at,
      author: { '@type': 'Organization', name: post.author_name },
      publisher: { '@type': 'Organization', name: 'RacePushbike', url: SITE_URL },
      mainEntityOfPage: articleUrl,
      image: post.cover_image_url || undefined,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Insight', item: `${SITE_URL}/insight` },
        { '@type': 'ListItem', position: 3, name: post.title, item: articleUrl },
      ],
    },
  ]

  return (
    <div className="public-page insight-page insight-article-page">
      <MarketingTopbar variant="editorial" />
      <main className="insight-article-main">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
        <nav className="insight-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <Link href="/insight">Insight</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{post.title}</span>
        </nav>

        <article className="insight-article">
          <header className="insight-article-header">
            <p>{getInsightCategoryLabel(post.category)}</p>
            <h1>{post.title}</h1>
            <div className="insight-article-byline">
              <span>{post.author_name}</span>
              {publishedDate ? <time dateTime={post.published_at ?? undefined}>{publishedDate}</time> : null}
              {isUpdated && updatedDate ? <span>Diperbarui {updatedDate}</span> : null}
            </div>
          </header>

          {post.cover_image_url ? (
            <figure className="insight-article-cover">
              <Image
                src={post.cover_image_url}
                alt={post.cover_image_alt || post.title}
                fill
                sizes="(max-width: 900px) 100vw, 920px"
                priority
              />
            </figure>
          ) : (
            <div className={`insight-article-cover insight-article-cover-fallback insight-card-cover-${post.category.toLowerCase()}`}>
              <span>RacePushbike</span>
              <strong>{getInsightCategoryLabel(post.category)}</strong>
            </div>
          )}

          <div className="insight-article-content">
            {post.content_blocks.length > 0 ? <InsightBlocks blocks={post.content_blocks} /> : <InsightMarkdown content={post.content_markdown} />}
            {post.category === 'RULES_SCORING' ? <InsightRuleDisclaimer /> : null}
          </div>
        </article>

        <section className="insight-article-cta">
          <p>Ikuti event dan hasil race terbaru</p>
          <h2>Cari event pushbike berikutnya di RacePushbike.</h2>
          <Link href="/jadwal-race-pushbike">Lihat Jadwal Race</Link>
        </section>

        {related.length > 0 ? (
          <section className="insight-related" aria-labelledby="related-insight-title">
            <div className="insight-section-heading">
              <p>Artikel Terkait</p>
              <h2 id="related-insight-title">Lanjut baca.</h2>
            </div>
            <div className="insight-grid">
              {related.map((item) => (
                <InsightCard key={item.id} post={item} />
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}
