import { NextResponse } from 'next/server'
import { adminClient, requireAdmin, requireScopedEventWorkspace } from '../../../../../lib/auth'
import type { PublicEventRegulation } from '../../../../../lib/eventService'

const STAGES = new Set(['QUALIFICATION', 'QUARTER_FINAL', 'REPECHAGE', 'SEMI_FINAL', 'FINAL'])

const normalizeRegulations = (input: unknown): PublicEventRegulation[] | null => {
  if (!Array.isArray(input) || input.length > 100) return null
  const rows: PublicEventRegulation[] = []
  for (const [index, raw] of input.entries()) {
    if (!raw || typeof raw !== 'object') return null
    const item = raw as Record<string, unknown>
    const scope = item.scope
    const categoryId = typeof item.category_id === 'string' && item.category_id.trim() ? item.category_id.trim() : null
    const stage = typeof item.stage === 'string' && item.stage ? item.stage : null
    const title = typeof item.title === 'string' ? item.title.trim() : ''
    const content = typeof item.content === 'string' ? item.content.trim() : ''
    const documentUrl = typeof item.document_url === 'string' ? item.document_url.trim() : ''
    if (!['EVENT', 'CATEGORY', 'STAGE'].includes(String(scope))) return null
    if (!title || title.length > 120 || !content || content.length > 6000) return null
    if ((scope === 'EVENT' && (categoryId || stage)) || (scope === 'CATEGORY' && (!categoryId || stage)) || (scope === 'STAGE' && (!categoryId || !stage || !STAGES.has(stage)))) return null
    if (documentUrl) {
      try {
        if (!['http:', 'https:'].includes(new URL(documentUrl).protocol)) return null
      } catch {
        return null
      }
    }
    rows.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : crypto.randomUUID(),
      scope: scope as PublicEventRegulation['scope'],
      category_id: categoryId,
      stage: stage as PublicEventRegulation['stage'],
      title,
      content,
      document_url: documentUrl || null,
      enabled: item.enabled !== false,
      sort_order: Number.isInteger(item.sort_order) ? Number(item.sort_order) : index,
    })
  }
  return rows
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const authorization = req.headers.get('authorization')
  const adminAuth = await requireAdmin(authorization, eventId)
  const scopedAuth = adminAuth.ok ? adminAuth : await requireScopedEventWorkspace(authorization, eventId, ['RC_ADMIN'])
  if (!scopedAuth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: settings }, { data: categories, error: categoryError }] = await Promise.all([
    adminClient.from('event_settings').select('business_settings').eq('event_id', eventId).maybeSingle(),
    adminClient.from('categories').select('id, label, enabled').eq('event_id', eventId).order('sequence_order', { ascending: true }),
  ])
  if (categoryError) return NextResponse.json({ error: categoryError.message }, { status: 400 })
  const business = settings?.business_settings && typeof settings.business_settings === 'object'
    ? settings.business_settings as Record<string, unknown>
    : {}
  const regulations = Array.isArray(business.public_regulations) ? business.public_regulations : []
  return NextResponse.json({ data: { regulations, categories: categories ?? [] } })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const authorization = req.headers.get('authorization')
  const adminAuth = await requireAdmin(authorization, eventId)
  const scopedAuth = adminAuth.ok ? adminAuth : await requireScopedEventWorkspace(authorization, eventId, ['RC_ADMIN'])
  if (!scopedAuth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const regulations = normalizeRegulations(body?.regulations)
  if (!regulations) return NextResponse.json({ error: 'Periksa kembali isi regulasi. Maksimal 100 item; judul, isi, dan tautan harus valid.' }, { status: 400 })

  const categoryIds = [...new Set(regulations.map((row) => row.category_id).filter((id): id is string => Boolean(id)))]
  if (categoryIds.length) {
    const { data: categories, error } = await adminClient.from('categories').select('id').eq('event_id', eventId).in('id', categoryIds)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if ((categories ?? []).length !== categoryIds.length) return NextResponse.json({ error: 'Kategori regulasi tidak cocok dengan event ini.' }, { status: 400 })
  }

  const { data: existing, error: readError } = await adminClient
    .from('event_settings')
    .select('business_settings')
    .eq('event_id', eventId)
    .maybeSingle()
  if (readError) return NextResponse.json({ error: readError.message }, { status: 400 })
  const business = existing?.business_settings && typeof existing.business_settings === 'object' && !Array.isArray(existing.business_settings)
    ? existing.business_settings as Record<string, unknown>
    : {}
  const nextBusinessSettings = { ...business, public_regulations: regulations }
  const write = existing
    ? await adminClient.from('event_settings').update({ business_settings: nextBusinessSettings }).eq('event_id', eventId)
    : await adminClient.from('event_settings').insert({ event_id: eventId, business_settings: nextBusinessSettings })
  const { error } = write
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: regulations })
}
