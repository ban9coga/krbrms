import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in environment.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Rider IDs that have DNS history from qualification
const DNS_HISTORY_RIDER_IDS = new Set([
  '9ced9677-0b07-4fe1-be69-c177cc131397', // ZAYN AL AMIN AREZTA (Batch 2)
  '82c8cbfd-3ce3-4cc5-a83f-18984e5b684f', // Archello qaddafa muhibat (Batch 1)
  '93fe3287-135b-49d4-aa2d-73bec02bd458', // Elfathan Kalief Rizki (Batch 1)
])

function shuffle(array) {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

async function main() {
  const { data: events } = await supabase.from('events').select('id,name').ilike('name', '%SHC Test%').limit(1)
  const event = events[0]

  const { data: cats } = await supabase.from('categories').select('id,label').eq('event_id', event.id).ilike('label', '%2021 Boys%').limit(1)
  const cat = cats[0]

  const EVENT_ID = event.id

  console.log(`Populating Semi Final results for category: ${cat.label}`)

  const { data: semiMotos } = await supabase
    .from('motos')
    .select('id,moto_name')
    .eq('category_id', cat.id)
    .ilike('moto_name', 'Semi Final%')
    .order('moto_name')

  if (!semiMotos || semiMotos.length === 0) {
    console.error('No Semi Final motos found. Compute the stage first.')
    return
  }

  for (const moto of semiMotos) {
    console.log(`\nProcessing ${moto.moto_name}...`)

    // Clear existing results
    await supabase.from('results').delete().eq('moto_id', moto.id)

    // Get riders in this moto
    const { data: riderRows } = await supabase
      .from('moto_riders')
      .select('rider_id, riders(name)')
      .eq('moto_id', moto.id)

    if (!riderRows || riderRows.length === 0) {
      console.log('  No riders, skipping.')
      continue
    }

    const NUM_DNS = 3

    // Separate riders with DNS history from clean riders
    const dnsHistoryRiders = riderRows.filter(r => DNS_HISTORY_RIDER_IDS.has(r.rider_id))
    const cleanRiders = riderRows.filter(r => !DNS_HISTORY_RIDER_IDS.has(r.rider_id))

    // Pick DNS riders: 1 must come from DNS history (if any in this batch), rest random from clean
    const dnsRiders = []

    // Force 1 rider with DNS history into DNS slot
    if (dnsHistoryRiders.length > 0) {
      const picked = shuffle(dnsHistoryRiders)[0]
      dnsRiders.push(picked)
      console.log(`  [FORCE DNS - has history] ${picked.riders.name}`)
    }

    // Fill remaining DNS slots from clean riders (shuffled)
    const shuffledClean = shuffle(cleanRiders)
    while (dnsRiders.length < NUM_DNS && shuffledClean.length > 0) {
      const picked = shuffledClean.shift()
      dnsRiders.push(picked)
      console.log(`  [DNS - random] ${picked.riders.name}`)
    }

    // Remaining riders get FINISH
    const dnsIds = new Set(dnsRiders.map(r => r.rider_id))
    const finishRiders = riderRows.filter(r => !dnsIds.has(r.rider_id))

    const resultsToInsert = []

    for (const r of dnsRiders) {
      resultsToInsert.push({
        event_id: EVENT_ID,
        moto_id: moto.id,
        rider_id: r.rider_id,
        finish_order: null,
        result_status: 'DNS',
      })
    }

    let rank = 1
    for (const r of finishRiders) {
      resultsToInsert.push({
        event_id: EVENT_ID,
        moto_id: moto.id,
        rider_id: r.rider_id,
        finish_order: rank++,
        result_status: 'FINISH',
      })
      console.log(`  [FINISH Rank ${rank - 1}] ${r.riders.name}`)
    }

    const { error: insertError } = await supabase.from('results').insert(resultsToInsert)
    if (insertError) throw insertError

    const { error: updateError } = await supabase
      .from('motos')
      .update({ status: 'PROVISIONAL', is_published: true })
      .eq('id', moto.id)
    if (updateError) throw updateError
  }

  console.log('\n✅ Semi Final results populated!')
  console.log('\nRider DNS history summary:')
  console.log('  - ZAYN AL AMIN AREZTA  → DNS di Moto 1 Batch 3 (Kualifikasi)')
  console.log('  - Archello qaddafa muhibat → DNS di Moto 1 Batch 5 (Kualifikasi)')
  console.log('  - Elfathan Kalief Rizki → DNS di Moto 1 Batch 6 (Kualifikasi)')
  console.log('\nSekarang klik Compute Stage dan cek posisi mereka di Final!')
}

main().catch(console.error)
