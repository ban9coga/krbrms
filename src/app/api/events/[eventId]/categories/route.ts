import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../lib/auth'

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { data, error } = await adminClient
    .from('categories')
    .select('id, year, gender, label, enabled')
    .eq('event_id', eventId)
    .gte('year', 2017)
    .lte('year', 2023)
    .order('year', { ascending: true })
    .order('gender', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  const normalized =
    (data ?? []).map((item) =>
      item.year === 2017 && item.gender === 'MIX'
        ? { ...item, label: 'FFA-MIX' }
        : item
    )
  return NextResponse.json({ data: normalized })
}
