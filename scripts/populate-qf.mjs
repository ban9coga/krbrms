import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in environment.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Helper for shuffling array
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function main() {
  const { data: events } = await supabase.from('events').select('id, name').ilike('name', '%SHC Test%').limit(1)
  const event = events?.[0]
  if (!event) { console.error('Event not found'); return }

  const { data: cats } = await supabase.from('categories').select('id, label').eq('event_id', event.id).ilike('label', '%2021 Boys%').limit(1)
  const category = cats?.[0]
  if (!category) { console.error('Category not found'); return }

  const EVENT_ID = event.id
  const CATEGORY_ID = category.id

  console.log(`Finding Quarter Final Motos for category ${category.label}...`)
  
  // Find the QF motos
  const { data: motos, error: motoError } = await supabase
    .from('motos')
    .select('id, moto_name, status')
    .eq('event_id', EVENT_ID)
    .eq('category_id', CATEGORY_ID)
    .ilike('moto_name', 'Quarter Final%')
    
  if (motoError) throw motoError
  
  if (!motos || motos.length === 0) {
    console.error('No Quarter Final motos found. Please compute the stage first.')
    return
  }

  console.log(`Found ${motos.length} Quarter Final motos. Populating data...`)

  for (const moto of motos) {
    console.log(`\nProcessing ${moto.moto_name} (${moto.id})...`)
    
    // Clear existing results
    await supabase.from('results').delete().eq('moto_id', moto.id)

    // Get riders
    const { data: riders, error: riderError } = await supabase
      .from('moto_riders')
      .select('rider_id, riders(name)')
      .eq('moto_id', moto.id)
      
    if (riderError) throw riderError
    
    if (!riders || riders.length === 0) {
      console.log('No riders found for this moto, skipping.')
      continue
    }

    // Determine random number of DNS and DNF
    // Max 1 DNS and 1 DNF per batch so we still have enough people finishing
    const numDns = Math.floor(Math.random() * 2) // 0 or 1
    const numDnf = Math.floor(Math.random() * 2) // 0 or 1

    let unassignedRiders = shuffle([...riders])
    const resultsToInsert = []
    
    console.log(`Assigning ${numDns} DNS, ${numDnf} DNF, and ${unassignedRiders.length - numDns - numDnf} FINISH.`)

    // Assign DNS
    for (let i = 0; i < numDns; i++) {
      if (unassignedRiders.length === 0) break
      const r = unassignedRiders.pop()
      resultsToInsert.push({
        event_id: EVENT_ID,
        moto_id: moto.id,
        rider_id: r.rider_id,
        finish_order: null,
        result_status: 'DNS',
      })
      console.log(`- ${r.riders.name} -> DNS`)
    }

    // Assign DNF
    for (let i = 0; i < numDnf; i++) {
      if (unassignedRiders.length === 0) break
      const r = unassignedRiders.pop()
      resultsToInsert.push({
        event_id: EVENT_ID,
        moto_id: moto.id,
        rider_id: r.rider_id,
        finish_order: null,
        result_status: 'DNF',
      })
      console.log(`- ${r.riders.name} -> DNF`)
    }

    // Assign FINISH
    let rank = 1
    while(unassignedRiders.length > 0) {
      const r = unassignedRiders.pop()
      resultsToInsert.push({
        event_id: EVENT_ID,
        moto_id: moto.id,
        rider_id: r.rider_id,
        finish_order: rank,
        result_status: 'FINISH',
      })
      console.log(`- ${r.riders.name} -> FINISH (Rank ${rank})`)
      rank++
    }

    const { error: insertError } = await supabase
      .from('results')
      .insert(resultsToInsert)
      
    if (insertError) throw insertError
    
    // Lock moto
    const { error: updateError } = await supabase
      .from('motos')
      .update({ status: 'PROVISIONAL', is_published: true })
      .eq('id', moto.id)
      
    if (updateError) throw updateError
  }

  console.log('\n✅ All Quarter Final results populated successfully!')
}

main().catch(console.error)
