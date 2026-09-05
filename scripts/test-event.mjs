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
    .select('id, label, enabled')
    .eq('event_id', event.id)
    .eq('enabled', true)
    .order('sequence_order', { ascending: true })

  console.log(`\nFound ${categories?.length ?? 0} enabled categories:`)
  const categoryMap = new Map()
  for (const cat of categories ?? []) {
    categoryMap.set(cat.id, cat.label)
    console.log(`- ${cat.label} (ID: ${cat.id})`)
  }

  const { data: motos } = await supabase
    .from('motos')
    .select('id, moto_name, category_id, status')
    .eq('event_id', event.id)
    .order('category_id')

  const { data: riders } = await supabase
    .from('moto_riders')
    .select('moto_id, rider_id')
    
  console.log(`\nFound ${motos?.length ?? 0} motos:`)
  const motoMap = {}
  for (const moto of motos ?? []) {
    if (!motoMap[moto.category_id]) motoMap[moto.category_id] = []
    
    // Count riders in this moto
    const riderCount = riders?.filter(r => r.moto_id === moto.id).length ?? 0
    motoMap[moto.category_id].push(`${moto.moto_name} [${moto.status}] - ${riderCount} riders`)
  }
  
  for (const [catId, motolist] of Object.entries(motoMap)) {
    console.log(`\nCategory: ${categoryMap.get(catId) || catId}`)
    motolist.forEach(m => console.log(`  -> ${m}`))
  }
}

run()
