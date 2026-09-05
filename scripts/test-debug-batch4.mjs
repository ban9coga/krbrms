import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function run() {
  const { data: events } = await supabase.from('events').select('id, name').ilike('name', '%SHC Test%')
  const event = events?.[0]
  if (!event) { console.error('Event not found'); return }

  const { data: categories } = await supabase
    .from('categories').select('id, label').eq('event_id', event.id).ilike('label', '%2021 Boys%')
  const category = categories?.[0]
  if (!category) { console.error('Category not found'); return }

  // Get motos for Batch 4
  const { data: motos } = await supabase
    .from('motos')
    .select('id, moto_name, status')
    .eq('event_id', event.id)
    .eq('category_id', category.id)
    .order('moto_order', { ascending: true })

  const moto1 = (motos ?? []).find(m => /moto 1.*batch 4/i.test(m.moto_name))
  const moto2 = (motos ?? []).find(m => /moto 2.*batch 4/i.test(m.moto_name))
  if (!moto1 || !moto2) { console.error('Batch 4 motos not found'); return }

  console.log(`Moto 1: ${moto1.moto_name} (${moto1.id})`)
  console.log(`Moto 2: ${moto2.moto_name} (${moto2.id})\n`)

  // Get riders in batch 4
  const { data: motoRiders } = await supabase
    .from('moto_riders').select('rider_id').eq('moto_id', moto1.id)
  const riderIds = (motoRiders ?? []).map(r => r.rider_id)

  // Get rider info
  const { data: riderInfo } = await supabase
    .from('riders').select('id, name, no_plate_display, club').in('id', riderIds)
  const riderMap = new Map((riderInfo ?? []).map(r => [r.id, r]))

  // Get all results for both motos
  const { data: results } = await supabase
    .from('results')
    .select('rider_id, moto_id, finish_order, result_status')
    .in('moto_id', [moto1.id, moto2.id])

  const riderCount = riderIds.length

  // Compute qualification points for each rider
  // Using the same logic as the system
  const riderScores = riderIds.map(riderId => {
    const r = riderMap.get(riderId)
    const m1 = (results ?? []).find(res => res.rider_id === riderId && res.moto_id === moto1.id)
    const m2 = (results ?? []).find(res => res.rider_id === riderId && res.moto_id === moto2.id)

    // Count DNS in each moto for new logic
    const dns1 = (results ?? []).filter(res => res.moto_id === moto1.id && res.result_status === 'DNS').length
    const dns2 = (results ?? []).filter(res => res.moto_id === moto2.id && res.result_status === 'DNS').length

    const getPoint = (res, totalRiders, dnsInMoto) => {
      if (!res) return null
      const status = (res.result_status ?? 'FINISH').toUpperCase()
      if (status === 'DQ') return null
      if (status === 'FINISH') return res.finish_order
      if (status === 'DNF' && res.finish_order != null) return res.finish_order
      if (status === 'DNF') return totalRiders - dnsInMoto // starters count
      if (status === 'DNS' || status === 'ABSENT') return totalRiders
      return res.finish_order
    }

    const p1 = getPoint(m1, riderCount, dns1)
    const p2 = getPoint(m2, riderCount, dns2)
    const total = (p1 ?? 0) + (p2 ?? 0)

    return {
      riderId,
      name: r?.name ?? '?',
      plate: r?.no_plate_display ?? '?',
      club: r?.club ?? '?',
      m1Status: m1?.result_status ?? '-',
      m1Pos: m1?.finish_order ?? '-',
      m1Point: p1,
      m2Status: m2?.result_status ?? '-',
      m2Pos: m2?.finish_order ?? '-',
      m2Point: p2,
      totalPoint: total,
    }
  })

  // Sort by total points (ascending = best first)
  riderScores.sort((a, b) => a.totalPoint - b.totalPoint)

  console.log('=== BATCH 4 QUALIFICATION RANKING ===')
  console.log('Rank | Name                          | Plate | M1 Status | M1 Pos | M1 Pt | M2 Status | M2 Pos | M2 Pt | Total')
  console.log('-'.repeat(120))
  riderScores.forEach((r, idx) => {
    const mark = r.name.includes('DARREN') ? ' ← DARREN' : r.name.includes('HANIF') ? ' ← HANIF' : ''
    console.log(
      `  ${(idx + 1).toString().padEnd(3)} | ${r.name.padEnd(30)} | ${String(r.plate).padEnd(5)} | ${String(r.m1Status).padEnd(9)} | ${String(r.m1Pos).padEnd(6)} | ${String(r.m1Point).padEnd(5)} | ${String(r.m2Status).padEnd(9)} | ${String(r.m2Pos).padEnd(6)} | ${String(r.m2Point).padEnd(5)} | ${r.totalPoint}${mark}`
    )
  })

  // Check advancement rules
  const { data: rules } = await supabase
    .from('race_advancement_rules')
    .select('*')
    .eq('event_id', event.id)
    .eq('category_id', category.id)

  console.log('\n=== ADVANCEMENT RULES ===')
  if (!rules || rules.length === 0) {
    console.log('No custom rules → using defaults.')
  } else {
    rules.forEach(r => console.log(`  ${r.source_stage} rank ${r.rank_from}-${r.rank_to} → ${r.target_stage} ${r.target_final_class ?? ''}`))
  }

  // Show repechage members
  const repMotos = (motos ?? []).filter(m => /^repechage/i.test(m.moto_name))
  for (const rep of repMotos) {
    const { data: repRiders } = await supabase.from('moto_riders').select('rider_id').eq('moto_id', rep.id)
    const repIds = (repRiders ?? []).map(r => r.rider_id)
    console.log(`\n=== ${rep.moto_name} MEMBERS ===`)
    for (const rid of repIds) {
      const r = riderMap.get(rid) 
      const score = riderScores.find(s => s.riderId === rid)
      if (r) {
        console.log(`  ${r.name.padEnd(30)} Plate ${r.no_plate_display} | Total: ${score?.totalPoint ?? '?'}`)
      } else {
        // Rider from different batch
        const { data: otherR } = await supabase.from('riders').select('id, name, no_plate_display').eq('id', rid)
        const or = otherR?.[0]
        console.log(`  ${(or?.name ?? rid).padEnd(30)} Plate ${or?.no_plate_display ?? '?'} | (from different batch)`)
      }
    }
  }
}

run()
