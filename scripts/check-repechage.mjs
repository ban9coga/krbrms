import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in environment.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function run() {
  // 1. Find event
  const { data: events } = await supabase.from('events').select('id, name').ilike('name', '%SHC Test%').limit(1)
  const event = events?.[0]
  if (!event) { console.error('Event not found'); return }

  // 2. Find category
  const { data: cats } = await supabase.from('categories').select('id, label').eq('event_id', event.id).ilike('label', '%2021 Boys%').limit(1)
  const category = cats?.[0]
  if (!category) { console.error('Category not found'); return }

  // 3. Find Repechage motos
  const { data: repechageMotos } = await supabase.from('motos').select('id, moto_name, status').eq('category_id', category.id).ilike('moto_name', '%repechage%')
  console.log('\n=== REPECHAGE MOTOS ===')
  console.log(repechageMotos)

  if (!repechageMotos || repechageMotos.length === 0) {
    console.log('No repechage motos found.')
    return
  }

  // 4. Check who's in the Repechage motos
  for (const moto of repechageMotos) {
    const { data: motoRiders } = await supabase.from('moto_riders').select('rider_id').eq('moto_id', moto.id)
    const riderIds = motoRiders?.map(r => r.rider_id) ?? []
    if (riderIds.length === 0) { console.log(`  ${moto.moto_name}: (empty)`); continue }
    const { data: riders } = await supabase.from('riders').select('id, name, plate_number').in('id', riderIds)
    console.log(`\n  ${moto.moto_name} [${moto.status}] - ${riderIds.length} riders:`)
    riders?.forEach(r => console.log(`    - ${r.name} (${r.plate_number})`))
  }

  // 5. Check stage seeds for Darren
  const { data: darren } = await supabase.from('riders').select('id, name').ilike('name', '%DARREN%').limit(1)
  if (darren?.[0]) {
    const { data: seeds } = await supabase.from('stage_seeds').select('*').eq('rider_id', darren[0].id).eq('category_id', category.id)
    console.log(`\n=== SEEDS FOR DARREN (${darren[0].name}) ===`)
    console.log(seeds)
  }
}

run()
