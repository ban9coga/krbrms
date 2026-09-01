import Image from 'next/image'
import Link from 'next/link'
import { formatInsightDate, getInsightCategoryLabel, type InsightPost } from '../lib/insight'

type InsightCardProps = {
  post: InsightPost
  priority?: boolean
  featured?: boolean
}

export default function InsightCard({ post, priority = false, featured = false }: InsightCardProps) {
  const publishedDate = formatInsightDate(post.published_at)

  return (
    <article className={`insight-card${featured ? ' insight-card-featured' : ''}`}>
      <Link
        href={`/insight/${post.slug}`}
        className="insight-card-cover"
        aria-label={`Baca ${getInsightCategoryLabel(post.category)}: ${post.title}`}
      >
        {post.cover_image_url ? (
          <Image
            src={post.cover_image_url}
            alt={post.cover_image_alt || `Ilustrasi ${post.title}`}
            fill
            priority={priority}
            sizes={featured ? '(max-width: 900px) 100vw, 58vw' : '(max-width: 700px) 100vw, 33vw'}
            className="object-cover"
          />
        ) : (
          <div className={`insight-card-cover-fallback insight-card-cover-${post.category.toLowerCase()}`} aria-hidden="true">
            <span>RP</span>
            <strong>{getInsightCategoryLabel(post.category)}</strong>
          </div>
        )}
        <span className="insight-card-category">{getInsightCategoryLabel(post.category)}</span>
      </Link>

      <div className="insight-card-body">
        <p className="insight-card-meta">
          {publishedDate ? <time dateTime={post.published_at ?? undefined}>{publishedDate}</time> : null}
          {publishedDate ? <span aria-hidden="true">&#8226;</span> : null}
          <span>{post.author_name}</span>
        </p>
        <h3>
          <Link href={`/insight/${post.slug}`}>{post.title}</Link>
        </h3>
        <p>{post.excerpt}</p>
        <Link href={`/insight/${post.slug}`} className="insight-card-read-link">
          Baca artikel <span aria-hidden="true">&#8594;</span>
        </Link>
      </div>
    </article>
  )
}
