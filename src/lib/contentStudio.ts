import { normalizeInsightBlocks, type InsightContentBlock } from './insightBlocks'

export type { InsightContentBlock } from './insightBlocks'

export type InstagramPostType = 'CAROUSEL' | 'REEL' | 'SINGLE_IMAGE'
export type InstagramStatus = 'NOT_READY' | 'READY' | 'POSTED'

export type InstagramSlide = {
  id: string
  headline: string
  body: string
}

export type ContentStudioInstagramPackage = {
  id: string | null
  post_type: InstagramPostType
  social_status: InstagramStatus
  slides: InstagramSlide[]
  caption: string
  cta: string
  hashtags: string
  notes: string
  published_at: string | null
}

const cleanText = (value: unknown, max = 10000) =>
  typeof value === 'string' ? value.replace(/\u0000/g, '').trim().slice(0, max) : ''

export const normalizeInstagramSlides = (value: unknown): InstagramSlide[] => {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).flatMap((raw, index) => {
    if (!raw || typeof raw !== 'object') return []
    const row = raw as Record<string, unknown>
    const headline = cleanText(row.headline, 300)
    const body = cleanText(row.body, 2400)
    if (!headline && !body) return []
    const suppliedId = cleanText(row.id, 120).replace(/[^a-zA-Z0-9_-]/g, '')
    return [{ id: suppliedId || `slide-${index + 1}`, headline, body }]
  })
}

export const normalizeInstagramPackage = (value: unknown): ContentStudioInstagramPackage => {
  const input = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const postType: InstagramPostType =
    input.post_type === 'REEL' || input.post_type === 'SINGLE_IMAGE' ? input.post_type : 'CAROUSEL'
  const socialStatus: InstagramStatus =
    input.social_status === 'READY' || input.social_status === 'POSTED' ? input.social_status : 'NOT_READY'

  return {
    id: typeof input.id === 'string' ? input.id : null,
    post_type: postType,
    social_status: socialStatus,
    slides: normalizeInstagramSlides(input.slides),
    caption: cleanText(input.caption),
    cta: cleanText(input.cta, 1000),
    hashtags: cleanText(input.hashtags, 3000),
    notes: cleanText(input.notes),
    published_at: typeof input.published_at === 'string' ? input.published_at : null,
  }
}

export const createEmptyInstagramPackage = (): ContentStudioInstagramPackage => ({
  id: null,
  post_type: 'CAROUSEL',
  social_status: 'NOT_READY',
  slides: [],
  caption: '',
  cta: '',
  hashtags: '',
  notes: '',
  published_at: null,
})

export const isSafeCanonicalUrl = (value: string) => {
  if (!value) return true
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export const createDefaultInsightBlocks = (): InsightContentBlock[] => [
  { id: 'block-1', type: 'paragraph', content: '' },
]

export const normalizeContentBlocks = normalizeInsightBlocks
