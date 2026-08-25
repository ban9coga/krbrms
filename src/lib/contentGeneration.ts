import { normalizeInsightBlocks, type InsightContentBlock } from './insightBlocks'
import { getInsightCategory, type InsightCategory } from './insightCategories'
import { normalizeInstagramPackage, type ContentStudioInstagramPackage } from './contentStudio'

export type ContentGenerationRequest = {
  topic: string
  audience: 'PARENTS' | 'ORGANIZERS' | 'COMMUNITY'
  tone: 'CLEAR' | 'FRIENDLY' | 'FORMAL'
}

export type ContentGenerationDraft = {
  topic: string
  insight: {
    title: string
    slug: string
    excerpt: string
    category: InsightCategory
    author_name: string
    content_blocks: InsightContentBlock[]
    seo_title: string
    seo_description: string
  }
  instagram: ContentStudioInstagramPackage
}

const clean = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/\u0000/g, '').trim().slice(0, max) : ''

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 160)

const CONTENT_BLOCK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'content', 'items', 'level', 'variant'],
  properties: {
    type: { type: 'string', enum: ['heading', 'paragraph', 'bullet_list', 'numbered_list', 'callout', 'quote', 'divider'] },
    content: { type: 'string' },
    items: { type: 'array', items: { type: 'string' } },
    level: { type: 'integer', enum: [2, 3] },
    variant: { type: 'string', enum: ['NOTE', 'IMPORTANT', 'EXAMPLE'] },
  },
} as const

export const contentGenerationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['topic', 'insight', 'instagram'],
  properties: {
    topic: { type: 'string' },
    insight: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'slug', 'excerpt', 'category', 'author_name', 'content_blocks', 'seo_title', 'seo_description'],
      properties: {
        title: { type: 'string' },
        slug: { type: 'string' },
        excerpt: { type: 'string' },
        category: { type: 'string', enum: ['RACE_KNOWLEDGE', 'RACE_GUIDE', 'EVENT_UPDATE', 'COMMUNITY_STORY'] },
        author_name: { type: 'string' },
        content_blocks: { type: 'array', minItems: 4, maxItems: 18, items: CONTENT_BLOCK_SCHEMA },
        seo_title: { type: 'string' },
        seo_description: { type: 'string' },
      },
    },
    instagram: {
      type: 'object',
      additionalProperties: false,
      required: ['post_type', 'slides', 'caption', 'cta', 'hashtags', 'notes'],
      properties: {
        post_type: { type: 'string', enum: ['CAROUSEL'] },
        slides: {
          type: 'array',
          minItems: 5,
          maxItems: 8,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['headline', 'body'],
            properties: { headline: { type: 'string' }, body: { type: 'string' } },
          },
        },
        caption: { type: 'string' },
        cta: { type: 'string' },
        hashtags: { type: 'string' },
        notes: { type: 'string' },
      },
    },
  },
} as const

export const normalizeContentGenerationRequest = (value: unknown): ContentGenerationRequest | null => {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  const topic = clean(input.topic, 500)
  if (!topic) return null
  return {
    topic,
    audience: input.audience === 'ORGANIZERS' || input.audience === 'COMMUNITY' ? input.audience : 'PARENTS',
    tone: input.tone === 'FRIENDLY' || input.tone === 'FORMAL' ? input.tone : 'CLEAR',
  }
}

export const normalizeContentGenerationDraft = (value: unknown): ContentGenerationDraft | null => {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  const insightInput = input.insight && typeof input.insight === 'object' ? input.insight as Record<string, unknown> : null
  const instagramInput = input.instagram && typeof input.instagram === 'object' ? input.instagram as Record<string, unknown> : null
  if (!insightInput || !instagramInput) return null

  const title = clean(insightInput.title, 220)
  const blocks = normalizeInsightBlocks(
    Array.isArray(insightInput.content_blocks)
      ? insightInput.content_blocks.map((block, index) => ({
          ...(block && typeof block === 'object' ? block : {}),
          id: `ai-block-${index + 1}`,
        }))
      : []
  )
  const category = typeof insightInput.category === 'string' && getInsightCategory(insightInput.category)
    ? insightInput.category as InsightCategory
    : 'RACE_KNOWLEDGE'
  const instagram = normalizeInstagramPackage({
    ...instagramInput,
    social_status: 'NOT_READY',
    slides: Array.isArray(instagramInput.slides)
      ? instagramInput.slides.map((slide, index) => ({ ...(slide && typeof slide === 'object' ? slide : {}), id: `ai-slide-${index + 1}` }))
      : [],
  })

  if (!title || blocks.length < 3 || instagram.slides.length < 3 || !instagram.caption) return null

  return {
    topic: clean(input.topic, 220) || title,
    insight: {
      title,
      slug: slugify(clean(insightInput.slug, 160) || title),
      excerpt: clean(insightInput.excerpt, 640),
      category,
      author_name: clean(insightInput.author_name, 160) || 'RacePushbike Team',
      content_blocks: blocks,
      seo_title: clean(insightInput.seo_title, 220),
      seo_description: clean(insightInput.seo_description, 320),
    },
    instagram,
  }
}

export const buildContentGenerationInstructions = ({ topic, audience, tone }: ContentGenerationRequest) => `
You are a careful Indonesian editorial writer for RacePushbike Indonesia.
Create a reviewable content draft from this topic: ${topic}

Audience: ${audience === 'PARENTS' ? 'wali rider dan keluarga' : audience === 'ORGANIZERS' ? 'panitia dan penyelenggara event' : 'komunitas pushbike'}.
Tone: ${tone === 'CLEAR' ? 'jelas, ringkas, profesional' : tone === 'FRIENDLY' ? 'hangat, mudah dipahami, tetap profesional' : 'formal dan informatif'}.

Rules:
- Write all copy in Indonesian.
- Return only the JSON structure requested.
- This is a draft for human review, never state that rules, points, schedules, or event policies are official unless provided in the topic.
- Do not invent event dates, regulations, names, results, quotes, sources, sponsors, or statistics.
- Do not give medical, legal, financial, or safety guarantees.
- For scoring/rule topics, explain examples as illustrative and preserve the existing public disclaimer workflow.
- Insight needs a useful editorial title, concise excerpt, 6-10 readable blocks, and no HTML.
- Use headings, paragraphs, lists, callouts, quotes, and dividers only when useful. Do not create images or tables.
- Create an Instagram carousel of 5-8 slides. Slide 1 must be a strong hook; last slide must have a gentle CTA.
- SEO title should be concise. Meta description should explain the article without keyword stuffing.
- Set Instagram content as a draft; it will be reviewed by an admin before use.
`.trim()
