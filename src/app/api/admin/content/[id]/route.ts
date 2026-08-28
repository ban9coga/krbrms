import { NextRequest, NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '@/src/lib/auth'
import { insightBlocksToMarkdown, normalizeInsightBlocks, hasInsightBlockContent } from '@/src/lib/insightBlocks'
import { isSafeCanonicalUrl, normalizeInstagramPackage } from '@/src/lib/contentStudio'
import { getInsightCategory } from '@/src/lib/insightCategories'

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
const clean = (value: unknown, max = 12000) => (typeof value === 'string' ? value.replace(/\u0000/g, '').trim().slice(0, max) : '')
const safeSlug = (value: unknown) => clean(value, 160).toLowerCase()
const isValidSlug = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
const safeImageUrl = (value: unknown) => {
  const candidate = clean(value, 2000)
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return unauthorized()
  const { id } = await params

  const [itemResult, insightResult, instagramResult] = await Promise.all([
    adminClient.from('content_items').select('*').eq('id', id).maybeSingle(),
    adminClient.from('insight_posts').select('*').eq('content_item_id', id).maybeSingle(),
    adminClient.from('content_instagram_packages').select('*').eq('content_item_id', id).maybeSingle(),
  ])

  if (itemResult.error) return NextResponse.json({ error: itemResult.error.message }, { status: 500 })
  if (!itemResult.data || !insightResult.data) return NextResponse.json({ error: 'Content tidak ditemukan.' }, { status: 404 })
  if (insightResult.error) return NextResponse.json({ error: insightResult.error.message }, { status: 500 })
  if (instagramResult.error) return NextResponse.json({ error: instagramResult.error.message }, { status: 500 })

  return NextResponse.json({
    data: {
      item: itemResult.data,
      insight: { ...insightResult.data, content_blocks: normalizeInsightBlocks(insightResult.data.content_blocks) },
      instagram: normalizeInstagramPackage(instagramResult.data),
    },
  })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return unauthorized()
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const publish = body.action === 'PUBLISH'

  const { data: existing, error: existingError } = await adminClient
    .from('insight_posts')
    .select('*')
    .eq('content_item_id', id)
    .maybeSingle()
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Draft Insight tidak ditemukan.' }, { status: 404 })

  const insightInput = body.insight && typeof body.insight === 'object' ? body.insight as Record<string, unknown> : {}
  const title = clean(insightInput.title, 220)
  const topic = clean(body.topic, 220) || title || clean(existing.title, 220)
  const slug = safeSlug(insightInput.slug)
  const excerpt = clean(insightInput.excerpt, 640)
  const category = typeof insightInput.category === 'string' && getInsightCategory(insightInput.category) ? insightInput.category : ''
  const authorName = clean(insightInput.author_name, 160) || 'RacePushbike Team'
  const blocks = normalizeInsightBlocks(insightInput.content_blocks)
  const rawMarkdown = clean(insightInput.content_markdown)
  const contentMarkdown = blocks.length > 0 ? insightBlocksToMarkdown(blocks) : rawMarkdown
  const coverImageUrl = safeImageUrl(insightInput.cover_image_url)
  const coverImageAlt = clean(insightInput.cover_image_alt, 500)
  const seoTitle = clean(insightInput.seo_title, 220) || null
  const seoDescription = clean(insightInput.seo_description, 320) || null
  const canonicalUrl = clean(insightInput.canonical_url, 2000)
  const instagram = normalizeInstagramPackage(body.instagram)

  if (!isSafeCanonicalUrl(canonicalUrl)) {
    return NextResponse.json({ error: 'Canonical URL harus memakai alamat http atau https yang valid.' }, { status: 400 })
  }
  if (publish) {
    if (!title || !isValidSlug(slug) || !excerpt || !category || (!hasInsightBlockContent(blocks) && !contentMarkdown)) {
      return NextResponse.json(
        { error: 'Untuk publish, isi Title, Slug valid, Excerpt, Category, dan minimal satu konten artikel.' },
        { status: 400 }
      )
    }
  }

  const insightStatus = publish ? 'PUBLISHED' : existing.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
  const publishedAt = insightStatus === 'PUBLISHED' ? existing.published_at || new Date().toISOString() : null
  const { error: itemError } = await adminClient
    .from('content_items')
    .update({ topic, status: insightStatus })
    .eq('id', id)
  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })

  const { data: insight, error: insightError } = await adminClient
    .from('insight_posts')
    .update({
      title: title || existing.title,
      slug: slug || existing.slug,
      excerpt,
      content_markdown: contentMarkdown,
      content_blocks: blocks,
      cover_image_url: coverImageUrl,
      cover_image_alt: coverImageAlt,
      category: category || existing.category,
      status: insightStatus,
      seo_title: seoTitle,
      seo_description: seoDescription,
      canonical_url: canonicalUrl || null,
      author_name: authorName,
      published_at: publishedAt,
    })
    .eq('id', existing.id)
    .select('*')
    .single()
  if (insightError) {
    const statusCode = insightError.code === '23505' ? 409 : 500
    return NextResponse.json({ error: insightError.code === '23505' ? 'Slug sudah digunakan artikel lain.' : insightError.message }, { status: statusCode })
  }

  const instagramPublishedAt = instagram.social_status === 'POSTED' ? instagram.published_at || new Date().toISOString() : null
  const { error: instagramError } = await adminClient
    .from('content_instagram_packages')
    .upsert(
      {
        content_item_id: id,
        post_type: instagram.post_type,
        social_status: instagram.social_status,
        slides: instagram.slides,
        caption: instagram.caption,
        cta: instagram.cta,
        hashtags: instagram.hashtags,
        notes: instagram.notes,
        published_at: instagramPublishedAt,
      },
      { onConflict: 'content_item_id' }
    )
  if (instagramError) return NextResponse.json({ error: instagramError.message }, { status: 500 })

  return NextResponse.json({ data: { insight, status: insightStatus } })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return unauthorized()
  const { id } = await params

  const { data: item, error: itemError } = await adminClient
    .from('content_items')
    .select('id, topic')
    .eq('id', id)
    .maybeSingle()

  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })
  if (!item) return NextResponse.json({ error: 'Konten tidak ditemukan.' }, { status: 404 })

  // Delete the public Insight record first. Its foreign key safely clears the
  // content-item reference, then deleting the parent cascades its IG package.
  const { error: insightError } = await adminClient
    .from('insight_posts')
    .delete()
    .eq('content_item_id', id)
  if (insightError) return NextResponse.json({ error: insightError.message }, { status: 500 })

  const { error: deleteError } = await adminClient
    .from('content_items')
    .delete()
    .eq('id', id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  return NextResponse.json({ data: { id, topic: item.topic } })
}
