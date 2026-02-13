import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'

export async function GET(_: Request, { params }: { params: Promise<{ riderId: string }> }) {
  const { riderId } = await params
  const { data } = await adminClient
    .from('rider_extra_categories')
    .select('id, category_id')
    .eq('rider_id', riderId)
    .maybeSingle()
  return NextResponse.json({ data: data ?? null })
}

export async function PUT(req: Request, { params }: { params: Promise<{ riderId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { riderId } = await params
  const body = await req.json().catch(() => ({}))
  const categoryId = body?.category_id as string | null | undefined

  if (!categoryId) {
    await adminClient.from('rider_extra_categories').delete().eq('rider_id', riderId)
    return NextResponse.json({ data: null })
  }

  const { data: rider } = await adminClient
    .from('riders')
    .select('id, event_id, date_of_birth, gender')
    .eq('id', riderId)
    .maybeSingle()

  if (!rider) return NextResponse.json({ error: 'Rider not found' }, { status: 404 })

  const { data: category } = await adminClient
    .from('categories')
    .select('id, event_id, year, gender')
    .eq('id', categoryId)
    .maybeSingle()

  if (!category || category.event_id !== rider.event_id) {
    return NextResponse.json({ error: 'Invalid category for this event' }, { status: 400 })
  }

  const birthYear = Number(String(rider.date_of_birth).slice(0, 4))
  if (category.year >= birthYear) {
    return NextResponse.json({ error: 'Extra category must be above rider birth year' }, { status: 400 })
  }

  if (category.year === 2017) {
    if (category.gender !== 'MIX') {
      return NextResponse.json({ error: 'U2017 must be FFA-MIX' }, { status: 400 })
    }
  } else if (category.gender !== rider.gender) {
    return NextResponse.json({ error: 'Gender must match for extra category' }, { status: 400 })
  }

  const { data, error } = await adminClient
    .from('rider_extra_categories')
    .upsert(
      [
        {
          rider_id: riderId,
          event_id: rider.event_id,
          category_id: categoryId,
        },
      ],
      { onConflict: 'rider_id' }
    )
    .select('id, category_id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data })
}
