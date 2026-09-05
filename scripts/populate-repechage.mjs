import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase URL or Key.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  const { data: events } = await supabase.from('events').select('id, name').ilike('name', '%SHC Test%').limit(1)
  const event = events?.[0]
  if (!event) { console.error('Event not found'); return }

  const { data: cats } = await supabase.from('categories').select('id, label').eq('event_id', event.id).ilike('label', '%2021 Boys%').limit(1)
  const category = cats?.[0]
  if (!category) { console.error('Category not found'); return }

  const EVENT_ID = event.id
  const CATEGORY_ID = category.id

  console.log('Finding Repechage Moto for category 2021 Boys...')
  
  // Find the repechage moto
  const { data: motos, error: motoError } = await supabase
    .from('motos')
    .select('id, moto_name, status')
    .eq('event_id', EVENT_ID)
    .eq('category_id', CATEGORY_ID)
    .ilike('moto_name', 'Repechage%')
    
  if (motoError) throw motoError
  
  if (!motos || motos.length === 0) {
    console.error('No Repechage moto found. Please make sure you have computed the stage.')
    return
  }
  
  const repechageMoto = motos[0]
  console.log(`Found Repechage Moto: ${repechageMoto.moto_name} (${repechageMoto.id})`)
  
  // Get riders in this moto
  const { data: riders, error: riderError } = await supabase
    .from('moto_riders')
    .select('rider_id, riders(name)')
    .eq('moto_id', repechageMoto.id)
    
  if (riderError) throw riderError
  
  if (!riders || riders.length === 0) {
    console.error('No riders found in the Repechage moto.')
    return
  }
  
  console.log(`Found ${riders.length} riders in Repechage.`)
  
  // Clear existing results just in case
  await supabase.from('results').delete().eq('moto_id', repechageMoto.id)
  
  // We will assign 1 DNS, and the rest Finish (rank 1, 2, 3...)
  const resultsToInsert = []
  
  for (let i = 0; i < riders.length; i++) {
    const rider = riders[i]
    
    // First rider gets DNS
    if (i === 0) {
      resultsToInsert.push({
        event_id: EVENT_ID,
        moto_id: repechageMoto.id,
        rider_id: rider.rider_id,
        finish_order: null,
        result_status: 'DNS',
      })
      console.log(`- ${rider.riders.name} -> DNS`)
    } else {
      resultsToInsert.push({
        event_id: EVENT_ID,
        moto_id: repechageMoto.id,
        rider_id: rider.rider_id,
        finish_order: i, // i=1 -> rank 1, i=2 -> rank 2, etc.
        result_status: 'FINISH',
      })
      console.log(`- ${rider.riders.name} -> FINISH (Rank ${i})`)
    }
  }
  
  const { error: insertError } = await supabase
    .from('results')
    .insert(resultsToInsert)
    
  if (insertError) throw insertError
  
  // Update moto status to PROVISIONAL or LOCKED
  const { error: updateError } = await supabase
    .from('motos')
    .update({ status: 'PROVISIONAL', is_published: true })
    .eq('id', repechageMoto.id)
    
  if (updateError) throw updateError
  
  console.log('✅ Repechage results populated successfully!')
}

main().catch(console.error)
