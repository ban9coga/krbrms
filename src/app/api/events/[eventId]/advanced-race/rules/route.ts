import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'

type RuleInput = {
  min_riders: number
  enable_qualification: boolean
  enable_quarter_final: boolean
  enable_semi_final: boolean
  enabled_final_classes: string[]
}

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { data: categories, error: catError } = await adminClient
    .from('categories')
    .select('id')
    .eq('event_id', eventId)
  if (catError) return NextResponse.json({ error: catError.message }, { status: 400 })

  const categoryIds = (categories ?? []).map((c) => c.id)
  if (categoryIds.length === 0) return NextResponse.json({ data: [] })

  const { data, error } = await adminClient
    .from('race_category_rule')
    .select('id, category_id, min_riders, enable_qualification, enable_quarter_final, enable_semi_final, enabled_final_classes')
    .in('category_id', categoryIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId } = await params
  const body = await req.json().catch(() => ({}))
  const category_id = body?.category_id as string | undefined
  const rules = (body?.rules ?? []) as RuleInput[]
  if (!category_id) return NextResponse.json({ error: 'category_id required' }, { status: 400 })
  if (!Array.isArray(rules)) return NextResponse.json({ error: 'rules must be array' }, { status: 400 })

  const { data: category, error: catError } = await adminClient
    .from('categories')
    .select('id, event_id')
    .eq('id', category_id)
    .maybeSingle()
  if (catError || !category || category.event_id !== eventId) {
    return NextResponse.json({ error: 'Category not found in event' }, { status: 404 })
  }

  await adminClient.from('race_category_rule').delete().eq('category_id', category_id)

  if (rules.length === 0) return NextResponse.json({ data: [] })

  const payload = rules.map((rule) => ({
    category_id,
    min_riders: Number(rule.min_riders),
    enable_qualification: Boolean(rule.enable_qualification),
    enable_quarter_final: Boolean(rule.enable_quarter_final),
    enable_semi_final: Boolean(rule.enable_semi_final),
    enabled_final_classes: Array.isArray(rule.enabled_final_classes) ? rule.enabled_final_classes : [],
  }))

  const { data, error } = await adminClient
    .from('race_category_rule')
    .insert(payload)
    .select('id, category_id, min_riders, enable_qualification, enable_quarter_final, enable_semi_final, enabled_final_classes')

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: data ?? [] })
}
