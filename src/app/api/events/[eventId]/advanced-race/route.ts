import { NextResponse } from 'next/server'
import { adminClient, requireAdmin, requireScopedEventWorkspace } from '../../../../../lib/auth'

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
    .select('id, event_id, category_id, enabled, max_riders_per_race, qualification_moto_count, repechage_max_riders_per_race, quarter_final_max_riders_per_race, semi_final_max_riders_per_race, dnf_point_override, dns_point_override')
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
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  const rcAuth = auth.ok ? auth : await requireScopedEventWorkspace(req.headers.get('authorization'), eventId, ['RC_ADMIN'])
  if (!rcAuth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const category_id = body?.category_id as string | undefined
  const enabled = Boolean(body?.enabled ?? false)
  const max_riders_per_race = Number(body?.max_riders_per_race ?? 8)
  const qualification_moto_count = Number(body?.qualification_moto_count ?? 2)
  const repechage_max_riders_per_race =
    body?.repechage_max_riders_per_race === '' || body?.repechage_max_riders_per_race == null
      ? null
      : Number(body?.repechage_max_riders_per_race)
  const quarter_final_max_riders_per_race =
    body?.quarter_final_max_riders_per_race === '' || body?.quarter_final_max_riders_per_race == null
      ? null
      : Number(body?.quarter_final_max_riders_per_race)
  const semi_final_max_riders_per_race =
    body?.semi_final_max_riders_per_race === '' || body?.semi_final_max_riders_per_race == null
      ? null
      : Number(body?.semi_final_max_riders_per_race)
  const dnf_point_override =
    body?.dnf_point_override === '' || body?.dnf_point_override == null
      ? null
      : Number(body?.dnf_point_override)
  const dns_point_override =
    body?.dns_point_override === '' || body?.dns_point_override == null
      ? null
      : Number(body?.dns_point_override)

  const optionalLimits = [repechage_max_riders_per_race, quarter_final_max_riders_per_race, semi_final_max_riders_per_race]
  const optionalPoints = [dnf_point_override, dns_point_override]
  if (!Number.isInteger(max_riders_per_race) || max_riders_per_race < 2 || max_riders_per_race > 32) {
    return NextResponse.json({ error: 'max_riders_per_race must be an integer from 2 to 32' }, { status: 400 })
  }
  if (!Number.isInteger(qualification_moto_count) || qualification_moto_count < 1 || qualification_moto_count > 10) {
    return NextResponse.json({ error: 'qualification_moto_count must be an integer from 1 to 10' }, { status: 400 })
  }
  if (optionalLimits.some((value) => value != null && (!Number.isInteger(value) || value < 2 || value > 32))) {
    return NextResponse.json({ error: 'Stage rider limits must be integers from 2 to 32' }, { status: 400 })
  }
  if (optionalPoints.some((value) => value != null && (!Number.isInteger(value) || value < 0 || value > 100))) {
    return NextResponse.json({ error: 'DNS/DNF points must be integers from 0 to 100' }, { status: 400 })
  }

  if (!category_id) {
    return NextResponse.json({ error: 'category_id required' }, { status: 400 })
  }

  const { data: category, error: categoryError } = await adminClient
    .from('categories').select('id').eq('id', category_id).eq('event_id', eventId).maybeSingle()
  if (categoryError || !category) return NextResponse.json({ error: 'Category not found in event' }, { status: 404 })

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
          repechage_max_riders_per_race,
          quarter_final_max_riders_per_race,
          semi_final_max_riders_per_race,
          dnf_point_override,
          dns_point_override,
        },
      ],
      { onConflict: 'event_id,category_id' }
    )
    .select('id, event_id, category_id, enabled, max_riders_per_race, qualification_moto_count, repechage_max_riders_per_race, quarter_final_max_riders_per_race, semi_final_max_riders_per_race, dnf_point_override, dns_point_override')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
