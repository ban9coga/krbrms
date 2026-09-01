import { adminClient } from './auth'
import { normalizeInsightBlocks, type InsightContentBlock } from './insightBlocks'
import {
  INSIGHT_CATEGORIES,
  getInsightCategory,
  getInsightCategoryFromSlug,
  getInsightCategoryLabel,
  type InsightCategory,
} from './insightCategories'

export { INSIGHT_CATEGORIES, getInsightCategory, getInsightCategoryFromSlug, getInsightCategoryLabel, type InsightCategory }

export type InsightPost = {
  id: string
  title: string
  slug: string
  excerpt: string
  content_markdown: string
  content_blocks: InsightContentBlock[]
  content_item_id: string | null
  cover_image_url: string | null
  cover_image_alt: string
  category: InsightCategory
  status: 'DRAFT' | 'PUBLISHED'
  seo_title: string | null
  seo_description: string | null
  canonical_url: string | null
  author_name: string
  published_at: string | null
  created_at: string
  updated_at: string
}

// Select all known columns so a deploy remains safe while a later Insight
// migration is being applied. Unknown optional fields simply normalize to null.
const POST_FIELDS = '*'

const categoryValues = new Set<string>(INSIGHT_CATEGORIES.map((category) => category.value))

const normalizePost = (value: unknown): InsightPost | null => {
  if (!value || typeof value !== 'object') return null
  const row = value as Record<string, unknown>
  if (
    typeof row.id !== 'string' ||
    typeof row.title !== 'string' ||
    typeof row.slug !== 'string' ||
    typeof row.excerpt !== 'string' ||
    typeof row.content_markdown !== 'string' ||
    typeof row.category !== 'string' ||
    !categoryValues.has(row.category) ||
    (row.status !== 'DRAFT' && row.status !== 'PUBLISHED') ||
    typeof row.author_name !== 'string' ||
    typeof row.created_at !== 'string' ||
    typeof row.updated_at !== 'string'
  ) {
    return null
  }

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    content_markdown: row.content_markdown,
    content_blocks: normalizeInsightBlocks(row.content_blocks),
    content_item_id: typeof row.content_item_id === 'string' ? row.content_item_id : null,
    cover_image_url: typeof row.cover_image_url === 'string' ? row.cover_image_url : null,
    cover_image_alt: typeof row.cover_image_alt === 'string' ? row.cover_image_alt : '',
    category: row.category as InsightCategory,
    status: row.status,
    seo_title: typeof row.seo_title === 'string' ? row.seo_title : null,
    seo_description: typeof row.seo_description === 'string' ? row.seo_description : null,
    canonical_url: typeof row.canonical_url === 'string' ? row.canonical_url : null,
    author_name: row.author_name,
    published_at: typeof row.published_at === 'string' ? row.published_at : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export const getPublishedInsightPosts = async (category?: InsightCategory | null): Promise<InsightPost[]> => {
  try {
    let query = adminClient
      .from('insight_posts')
      .select(POST_FIELDS)
      .eq('status', 'PUBLISHED')
      .order('published_at', { ascending: false })

    if (category) query = query.eq('category', category)

    const { data, error } = await query
    if (error) return []
    return (data ?? []).map(normalizePost).filter((post): post is InsightPost => Boolean(post))
  } catch {
    return []
  }
}

export const getLatestInsightPosts = async (limit = 3): Promise<InsightPost[]> => {
  const posts = await getPublishedInsightPosts()
  return posts.slice(0, Math.max(0, limit))
}

export const getPublishedInsightPostBySlug = async (slug: string): Promise<InsightPost | null> => {
  try {
    const { data, error } = await adminClient
      .from('insight_posts')
      .select(POST_FIELDS)
      .eq('slug', slug)
      .eq('status', 'PUBLISHED')
      .maybeSingle()

    if (error) return null
    return normalizePost(data)
  } catch {
    return null
  }
}

export const getRelatedInsightPosts = async (post: InsightPost, limit = 3): Promise<InsightPost[]> => {
  const posts = await getPublishedInsightPosts()
  const otherPosts = posts.filter((item) => item.id !== post.id)
  const sameCategory = otherPosts.filter((item) => item.category === post.category)
  const latest = otherPosts.filter((item) => item.category !== post.category)
  return [...sameCategory, ...latest].slice(0, Math.max(0, limit))
}

export const formatInsightDate = (value: string | null) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}
