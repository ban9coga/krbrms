import { NextRequest, NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '@/src/lib/auth'
import { createEmptyInstagramPackage } from '@/src/lib/contentStudio'

type ContentItemRow = {
  id: string
  topic: string
  status: 'DRAFT' | 'PUBLISHED'
  created_at: string
  updated_at: string
}

type InsightRow = {
  id: string
  content_item_id: string | null
  title: string
  category: string
  status: 'DRAFT' | 'PUBLISHED'
  published_at: string | null
}

const unauthorized = () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return unauthorized()

  const query = new URL(req.url).searchParams
  const requestedStatus = query.get('status')
  const status = requestedStatus === 'DRAFT' || requestedStatus === 'PUBLISHED' ? requestedStatus : null
  const search = (query.get('q') || '').trim().toLowerCase()

  const { data: itemRows, error: itemError } = await adminClient
    .from('content_items')
    .select('id, topic, status, created_at, updated_at')
    .order('updated_at', { ascending: false })

  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })
  const items = (itemRows ?? []) as ContentItemRow[]
  const ids = items.map((item) => item.id)
  const [insightsResult, instagramResult] = ids.length
    ? await Promise.all([
        adminClient
          .from('insight_posts')
          .select('id, content_item_id, title, category, status, published_at')
          .in('content_item_id', ids),
        adminClient
          .from('content_instagram_packages')
          .select('id, content_item_id, social_status')
          .in('content_item_id', ids),
      ])
    : [{ data: [], error: null }, { data: [], error: null }]

  if (insightsResult.error) return NextResponse.json({ error: insightsResult.error.message }, { status: 500 })
  if (instagramResult.error) return NextResponse.json({ error: instagramResult.error.message }, { status: 500 })

  const insights = (insightsResult.data ?? []) as InsightRow[]
  const insightByItem = new Map(insights.filter((row) => row.content_item_id).map((row) => [row.content_item_id as string, row]))
  const instagramByItem = new Map(
    (instagramResult.data ?? []).map((row) => [row.content_item_id as string, String(row.social_status || 'NOT_READY')])
  )

  const data = items
    .map((item) => {
      const insight = insightByItem.get(item.id)
      return {
        ...item,
        title: insight?.title || item.topic,
        category: insight?.category || 'RACE_KNOWLEDGE',
        insight_status: insight?.status || item.status,
        instagram_status: instagramByItem.get(item.id) || 'NOT_READY',
        published_at: insight?.published_at || null,
      }
    })
    .filter((item) => (!status || item.insight_status === status) && (!search || `${item.topic} ${item.title}`.toLowerCase().includes(search)))

  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return unauthorized()

  const body = await req.json().catch(() => ({}))
  const topic = typeof body.topic === 'string' && body.topic.trim() ? body.topic.trim().slice(0, 220) : 'Konten Baru'

  const { data: item, error: itemError } = await adminClient
    .from('content_items')
    .insert({ topic, status: 'DRAFT' })
    .select('id, topic, status, created_at, updated_at')
    .single()
  if (itemError || !item) return NextResponse.json({ error: itemError?.message || 'Gagal membuat content item.' }, { status: 500 })

  const draftSlug = `draft-${item.id}`
  const { data: insight, error: insightError } = await adminClient
    .from('insight_posts')
    .insert({
      content_item_id: item.id,
      title: topic,
      slug: draftSlug,
      excerpt: '',
      content_markdown: '',
      content_blocks: [],
      category: 'RACE_KNOWLEDGE',
      status: 'DRAFT',
      author_name: 'RacePushbike Team',
    })
    .select('id, content_item_id')
    .single()

  if (insightError || !insight) {
    await adminClient.from('content_items').delete().eq('id', item.id)
    return NextResponse.json({ error: insightError?.message || 'Gagal membuat draft Insight.' }, { status: 500 })
  }

  const instagram = createEmptyInstagramPackage()
  const { error: instagramError } = await adminClient.from('content_instagram_packages').insert({
    content_item_id: item.id,
    post_type: instagram.post_type,
    social_status: instagram.social_status,
    slides: instagram.slides,
  })
  if (instagramError) return NextResponse.json({ error: instagramError.message }, { status: 500 })

  return NextResponse.json({ data: { id: item.id } }, { status: 201 })
}
