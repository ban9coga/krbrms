import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in environment.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function run() {
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('id, name')
    .ilike('name', '%SHC Test%')

  if (eventError || !events || events.length === 0) {
    console.error('Event not found.', eventError)
    return
  }

  const event = events[0]
  console.log(`Found Event: ${event.name} (ID: ${event.id})`)

  const { data: categories } = await supabase
    .from('categories')
    .select('id, label')
    .eq('event_id', event.id)
    .ilike('label', '%2021 Boys%')

  if (!categories || categories.length === 0) {
    console.error('Category 2021 Boys not found.')
    return
  }
  const category = categories[0]
  console.log(`Found Category: ${category.label} (ID: ${category.id})`)

  const { data: motos } = await supabase
    .from('motos')
    .select('id, moto_name, status')
    .eq('event_id', event.id)
    .eq('category_id', category.id)
    .ilike('moto_name', 'Moto 2%')

  if (!motos || motos.length === 0) {
    console.log('No Moto 2 found for this category.')
    return
  }

  console.log(`Found ${motos.length} Moto 2 batches.`)

  for (const moto of motos) {
    console.log(`\nProcessing ${moto.moto_name} (ID: ${moto.id})`)
    
    // Fetch riders
    const { data: riders } = await supabase
      .from('moto_riders')
      .select('rider_id')
      .eq('moto_id', moto.id)

    if (!riders || riders.length === 0) {
      console.log(`  -> No riders in this moto, skipping.`)
      continue
    }

    console.log(`  -> Found ${riders.length} riders.`)

    // Shuffle riders
    const shuffled = [...riders].sort(() => Math.random() - 0.5)
    
    const payload = []
    let rank = 1

    for (let i = 0; i < shuffled.length; i++) {
      const riderId = shuffled[i].rider_id
      
      let resultStatus = 'FINISH'
      let finishOrder = rank
      
      // Give 2 DNF and 1 DNS if there are enough riders
      if (riders.length >= 4) {
        if (i === riders.length - 1) {
          resultStatus = 'DNS'
          finishOrder = null
        } else if (i === riders.length - 2 || i === riders.length - 3) {
          resultStatus = 'DNF'
          finishOrder = null
        } else {
          rank++
        }
      } else {
        rank++
      }

      payload.push({
        event_id: event.id,
        moto_id: moto.id,
        rider_id: riderId,
        finish_order: finishOrder,
        result_status: resultStatus,
      })
    }

    // Insert results
    const { error: insertError } = await supabase
      .from('results')
      .upsert(payload, { onConflict: 'moto_id,rider_id' })

    if (insertError) {
      console.error(`  -> Failed to insert results:`, insertError.message)
      continue
    }

    // Lock moto
    const { error: lockError } = await supabase
      .from('motos')
      .update({ status: 'LOCKED' })
      .eq('id', moto.id)

    if (lockError) {
      console.error(`  -> Failed to lock moto:`, lockError.message)
    } else {
      console.log(`  -> Results inserted and moto LOCKED.`)
    }
  }

  console.log('\nAll done!')
}

run()
