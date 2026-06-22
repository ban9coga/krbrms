import { NextResponse } from 'next/server'
import { adminClient, requireBackoffice } from '../../../../../../lib/auth'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireBackoffice(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: extraRows, error: extraError } = await adminClient
    .from('rider_extra_categories')
    .select('rider_id, category_id')
    .eq('event_id', eventId)

  if (extraError) return NextResponse.json({ error: extraError.message }, { status: 400 })
  if (!extraRows?.length) return NextResponse.json({ data: [], total: 0 })

  const riderIds = extraRows.map((row) => row.rider_id)
  const categoryIds = Array.from(new Set(extraRows.map((row) => row.category_id)))

  const [{ data: riders, error: ridersError }, { data: categories, error: categoriesError }] = await Promise.all([
    adminClient
      .from('riders')
      .select(
        'id, name, rider_nickname, date_of_birth, gender, plate_number, plate_suffix, no_plate_display, club, primary_category_id'
      )
      .eq('event_id', eventId)
      .in('id', riderIds),
    adminClient
      .from('categories')
      .select('id, label')
      .eq('event_id', eventId)
      .in('id', categoryIds),
  ])

  if (ridersError) return NextResponse.json({ error: ridersError.message }, { status: 400 })
  if (categoriesError) return NextResponse.json({ error: categoriesError.message }, { status: 400 })

  const primaryCategoryIds = Array.from(
    new Set((riders ?? []).map((rider) => rider.primary_category_id).filter((id): id is string => Boolean(id)))
  )
  const { data: primaryCategories, error: primaryError } =
    primaryCategoryIds.length > 0
      ? await adminClient
          .from('categories')
          .select('id, label')
          .eq('event_id', eventId)
          .in('id', primaryCategoryIds)
      : { data: [], error: null }

  if (primaryError) return NextResponse.json({ error: primaryError.message }, { status: 400 })

  const riderMap = new Map((riders ?? []).map((rider) => [rider.id, rider]))
  const extraCategoryMap = new Map((categories ?? []).map((category) => [category.id, category.label]))
  const primaryCategoryMap = new Map((primaryCategories ?? []).map((category) => [category.id, category.label]))

  const data = extraRows
    .map((row) => {
      const rider = riderMap.get(row.rider_id)
      if (!rider) return null
      return {
        id: rider.id,
        name: rider.name,
        rider_nickname: rider.rider_nickname,
        date_of_birth: rider.date_of_birth,
        gender: rider.gender,
        plate: rider.no_plate_display || `${rider.plate_number}${rider.plate_suffix ?? ''}`,
        club: rider.club,
        primary_category: rider.primary_category_id
          ? primaryCategoryMap.get(rider.primary_category_id) ?? '-'
          : '-',
        upclass_category: extraCategoryMap.get(row.category_id) ?? '-',
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort((a, b) => a.upclass_category.localeCompare(b.upclass_category) || a.name.localeCompare(b.name))

  return NextResponse.json({ data, total: data.length })
}
