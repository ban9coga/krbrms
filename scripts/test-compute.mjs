import { createClient } from '@supabase/supabase-js'
import { loadStageMotos, loadMotoRiders, hasMotoResults } from './src/services/advancedRaceAuto.ts' // wait, this might be hard to run due to Next.js

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

  // Mocking the auto advance
  const res = await fetch(`http://localhost:3000/api/events/${event.id}/advanced-race/compute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoryId: category.id })
  })

  const json = await res.json()
  console.log('Compute Result:', json)
}

run()
