import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'

const toCategory = (birthYear: number, gender: 'BOY' | 'GIRL') => {
  const isU2017 = birthYear === 2017
  const yearKey = isU2017 ? 2017 : birthYear
  const categoryGender = isU2017 ? 'MIX' : gender
  const label = isU2017 ? 'FFA-MIX' : `${birthYear} ${gender === 'BOY' ? 'Boys' : 'Girls'}`
  return { year: yearKey, gender: categoryGender, label }
}

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireAdmin(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventId } = await params

  const { data: riders, error: riderError } = await adminClient
    .from('riders')
    .select('birth_year, gender')
    .eq('event_id', eventId)

  if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 })

  const unique = new Map<string, { year: number; gender: 'BOY' | 'GIRL' | 'MIX'; label: string }>()
  for (const row of riders ?? []) {
    const birthYear = Number(row.birth_year)
    if (!Number.isFinite(birthYear)) continue
    const gender = row.gender as 'BOY' | 'GIRL'
    const cat = toCategory(birthYear, gender)
    const key = `${cat.year}-${cat.gender}`
    if (!unique.has(key)) unique.set(key, cat)
  }

  const payload = Array.from(unique.values()).map((c) => ({
    event_id: eventId,
    year: c.year,
    gender: c.gender,
    label: c.label,
    enabled: true,
  }))

  if (payload.length === 0) return NextResponse.json({ data: { inserted: 0 } })

  const { error: insertError } = await adminClient
    .from('categories')
    .upsert(payload, { onConflict: 'event_id,year,gender' })

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 })

  return NextResponse.json({ data: { inserted: payload.length } })
}
