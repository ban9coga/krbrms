import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { data: categories, error: catError } = await adminClient
    .from('categories')
    .select('id, year, gender, label, enabled')
    .eq('event_id', eventId)
    .order('year', { ascending: false })
  if (catError) return NextResponse.json({ error: catError.message }, { status: 400 })

  const { data: configs, error: cfgError } = await adminClient
    .from('race_stage_config')
    .select('id, event_id, category_id, enabled, max_riders_per_race, qualification_moto_count')
    .eq('event_id', eventId)
  if (cfgError) return NextResponse.json({ error: cfgError.message }, { status: 400 })

  const { data: rules, error: ruleError } = await adminClient
    .from('race_category_rule')
    .select('id, category_id, min_riders, enable_qualification, enable_quarter_final, enable_semi_final, enabled_final_classes')
    .in(
      'category_id',
      (categories ?? []).map((c) => c.id)
    )
  if (ruleError) return NextResponse.json({ error: ruleError.message }, { status: 400 })

  return NextResponse.json({
    data: {
      categories: categories ?? [],
      configs: configs ?? [],
      rules: rules ?? [],
    },
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { eventId } = await params
  const body = await req.json().catch(() => ({}))
  const category_id = body?.category_id as string | undefined
  const enabled = Boolean(body?.enabled ?? false)
  const max_riders_per_race = Number(body?.max_riders_per_race ?? 8)
  const qualification_moto_count = Number(body?.qualification_moto_count ?? 2)

  if (!category_id) {
    return NextResponse.json({ error: 'category_id required' }, { status: 400 })
  }

  const { data, error } = await adminClient
    .from('race_stage_config')
    .upsert(
      [
        {
          event_id: eventId,
          category_id,
          enabled,
          max_riders_per_race,
          qualification_moto_count,
        },
      ],
      { onConflict: 'event_id,category_id' }
    )
    .select('id, event_id, category_id, enabled, max_riders_per_race, qualification_moto_count')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
