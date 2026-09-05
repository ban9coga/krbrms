import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in environment.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function run() {
  const { data: events } = await supabase.from('events').select('id, name').ilike('name', '%SHC Test%').limit(1)
  const event = events?.[0]
  if (!event) { console.error('Event not found'); return }

  const { data: cats } = await supabase.from('categories').select('id, label').eq('event_id', event.id).ilike('label', '%2021 Boys%').limit(1)
  const category = cats?.[0]
  if (!category) { console.error('Category not found'); return }

  const { data: motos } = await supabase.from('motos').select('id, moto_name').eq('category_id', category.id).ilike('moto_name', 'Moto 2 - Batch 6')
  const moto = motos?.[0]
  if (!moto) { console.error('Moto 2 Batch 6 not found'); return }

  const { data: riders } = await supabase.from('moto_riders').select('rider_id').eq('moto_id', moto.id)
  if (!riders || riders.length < 8) { console.error('Not enough riders in Moto 2 Batch 6', riders?.length); return }

  // Assign results: 2 DNS, 2 DNF, 4 FINISH
  const updates = [
    { rider_id: riders[0].rider_id, result_status: 'DNS', finish_order: null },
    { rider_id: riders[1].rider_id, result_status: 'DNS', finish_order: null },
    { rider_id: riders[2].rider_id, result_status: 'DNF', finish_order: null },
    { rider_id: riders[3].rider_id, result_status: 'DNF', finish_order: null },
    { rider_id: riders[4].rider_id, result_status: 'FINISH', finish_order: 1 },
    { rider_id: riders[5].rider_id, result_status: 'FINISH', finish_order: 2 },
    { rider_id: riders[6].rider_id, result_status: 'FINISH', finish_order: 3 },
    { rider_id: riders[7].rider_id, result_status: 'FINISH', finish_order: 4 },
  ]

  console.log('Clearing old results...')
  await supabase.from('results').delete().eq('moto_id', moto.id)

  console.log('Inserting new results...')
  const insertData = updates.map(u => ({
    event_id: event.id,
    moto_id: moto.id,
    rider_id: u.rider_id,
    result_status: u.result_status,
    finish_order: u.finish_order
  }))

  const { error } = await supabase.from('results').insert(insertData)
  if (error) {
    console.error('Failed to insert results:', error)
  } else {
    // Lock the moto
    await supabase.from('motos').update({ status: 'LOCKED' }).eq('id', moto.id)
    console.log('Moto 2 Batch 6 has been populated with 2 DNS and 2 DNF and locked successfully!')
  }
}

run()
