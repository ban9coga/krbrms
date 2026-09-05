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

  // Find the rider by name
  const { data: riders } = await supabase
    .from('riders')
    .select('id, name, no_plate_display, club')
    .ilike('name', '%DARREN MAULEN%')
  
  if (!riders || riders.length === 0) { console.error('Rider not found'); return }
  const rider = riders[0]
  console.log(`Rider: ${rider.name} | Plate: ${rider.no_plate_display} | Club: ${rider.club} | ID: ${rider.id}\n`)

  // Get ALL motos for this category
  const { data: motos } = await supabase
    .from('motos')
    .select('id, moto_name, status')
    .eq('event_id', event.id)
    .eq('category_id', category.id)
    .order('moto_order', { ascending: true })

  // Check which motos this rider is in
  const { data: motoRiders } = await supabase
    .from('moto_riders')
    .select('moto_id, rider_id')
    .eq('rider_id', rider.id)

  const riderMotoIds = new Set((motoRiders ?? []).map(r => r.moto_id))

  // Get results for this rider
  const { data: results } = await supabase
    .from('results')
    .select('moto_id, finish_order, result_status')
    .eq('rider_id', rider.id)

  const resultByMoto = new Map((results ?? []).map(r => [r.moto_id, r]))

  console.log('=== RIDER ASSIGNMENTS ===')
  for (const moto of motos ?? []) {
    const inMoto = riderMotoIds.has(moto.id)
    if (!inMoto) continue
    const result = resultByMoto.get(moto.id)
    const resultStr = result
      ? `${result.result_status} ${result.finish_order ? `(pos ${result.finish_order})` : ''}`
      : 'NO RESULT'
    console.log(`  ${moto.moto_name} [${moto.status}] → ${resultStr}`)
  }

  // Check stage_seeds
  const { data: seeds } = await supabase
    .from('stage_seeds')
    .select('*')
    .eq('rider_id', rider.id)
    .eq('event_id', event.id)
    .eq('category_id', category.id)

  console.log('\n=== STAGE SEEDS ===')
  if (!seeds || seeds.length === 0) {
    console.log('  No stage seeds found.')
  } else {
    seeds.forEach(s => console.log(`  Stage: ${s.stage} | Final class: ${s.final_class} | Position: ${s.position} | Points: ${s.points} | Batch: ${s.batch_id}`))
  }

  // Check race_stage_config / advancement rules
  const { data: rules } = await supabase
    .from('race_advancement_rules')
    .select('*')
    .eq('event_id', event.id)
    .eq('category_id', category.id)

  console.log('\n=== ADVANCEMENT RULES ===')
  if (!rules || rules.length === 0) {
    console.log('  No custom rules. Using defaults.')
  } else {
    rules.forEach(r => console.log(`  ${r.source_stage} rank ${r.rank_from}-${r.rank_to} → ${r.target_stage} ${r.target_final_class ?? ''} (split: ${r.split_basis})`))
  }

  // Show rider's qualification ranking
  console.log('\n=== ALL RIDERS IN SAME BATCH (Moto 1) ===')
  // Find which batch this rider is in
  const riderBatchMoto = (motos ?? []).find(m => /^moto 1/i.test(m.moto_name) && riderMotoIds.has(m.id))
  if (riderBatchMoto) {
    console.log(`Batch moto: ${riderBatchMoto.moto_name}`)
    const { data: batchRiders } = await supabase
      .from('moto_riders').select('rider_id').eq('moto_id', riderBatchMoto.id)
    
    const batchRiderIds = (batchRiders ?? []).map(r => r.rider_id)
    
    // Get all results for these riders across Moto 1, 2
    const moto1 = riderBatchMoto
    const batchNum = riderBatchMoto.moto_name.match(/batch\s*(\d+)/i)?.[1]
    const moto2 = (motos ?? []).find(m => m.moto_name.toLowerCase().includes(`moto 2`) && m.moto_name.includes(`Batch ${batchNum}`))
    
    console.log(`Moto 1: ${moto1.moto_name} (${moto1.id})`)
    console.log(`Moto 2: ${moto2?.moto_name} (${moto2?.id})`)
    
    const motoIdsForBatch = [moto1.id, ...(moto2 ? [moto2.id] : [])]
    const { data: batchResults } = await supabase
      .from('results')
      .select('rider_id, moto_id, finish_order, result_status')
      .in('moto_id', motoIdsForBatch)
    
    const { data: riderInfo } = await supabase
      .from('riders')
      .select('id, name, no_plate_display')
      .in('id', batchRiderIds)
    const riderInfoMap = new Map((riderInfo ?? []).map(r => [r.id, r]))
    
    console.log('\nRider results in batch:')
    for (const rid of batchRiderIds) {
      const r = riderInfoMap.get(rid)
      const m1Result = (batchResults ?? []).find(br => br.rider_id === rid && br.moto_id === moto1.id)
      const m2Result = moto2 ? (batchResults ?? []).find(br => br.rider_id === rid && br.moto_id === moto2.id) : null
      console.log(`  ${(r?.name ?? '???').padEnd(30)} Plate ${(r?.no_plate_display ?? '?').padEnd(5)} | M1: ${m1Result ? `${m1Result.result_status} pos=${m1Result.finish_order}` : 'NO RESULT'} | M2: ${m2Result ? `${m2Result.result_status} pos=${m2Result.finish_order}` : 'NO RESULT'}`)
    }
  }

  // Check repechage motos
  console.log('\n=== REPECHAGE MOTOS ===')
  const repMotos = (motos ?? []).filter(m => /^repechage/i.test(m.moto_name))
  for (const rep of repMotos) {
    const { data: repRiders } = await supabase.from('moto_riders').select('rider_id').eq('moto_id', rep.id)
    const repRiderIds = (repRiders ?? []).map(r => r.rider_id)
    const isInRep = repRiderIds.includes(rider.id)
    console.log(`  ${rep.moto_name} [${rep.status}] — ${repRiderIds.length} riders — Darren in it? ${isInRep ? 'YES ❌' : 'NO'}`)
    
    if (isInRep) {
      const { data: repRiderInfo } = await supabase.from('riders').select('id, name, no_plate_display').in('id', repRiderIds)
      console.log('  Riders in this repechage:')
      for (const rr of repRiderInfo ?? []) {
        console.log(`    - ${rr.name} (Plate ${rr.no_plate_display})`)
      }
    }
  }
}

run()
