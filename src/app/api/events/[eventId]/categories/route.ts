import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../lib/auth'

export async function GET(_: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { data, error } = await adminClient
    .from('categories')
    .select('id, year, year_min, year_max, gender, label, enabled')
    .eq('event_id', eventId)
    .order('year_min', { ascending: true })
    .order('gender', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: data ?? [] })
}
