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

  // Find Moto 2 - Batch 6
  const { data: motos } = await supabase
    .from('motos')
    .select('id, moto_name, status')
    .eq('event_id', event.id)
    .eq('category_id', category.id)
    .ilike('moto_name', 'Moto 2 - Batch 6%')
    .limit(1)

  const moto = motos?.[0]
  if (!moto) { console.error('Moto 2 - Batch 6 not found'); return }
  console.log(`Found: ${moto.moto_name} [${moto.status}] (${moto.id})`)

  const { data: riders } = await supabase
    .from('moto_riders').select('rider_id').eq('moto_id', moto.id)

  if (!riders || riders.length === 0) { console.error('No riders found'); return }
  console.log(`Riders: ${riders.length}`)

  // Scenario: 2 DNF + 2 DNS (sesuai simulasi diskusi)
  // Order: FINISH (riders 0..n-5), DNF (n-4, n-3), DNS (n-2, n-1)
  const shuffled = [...riders].sort(() => Math.random() - 0.5)
  const payload = []
  let rank = 1

  for (let i = 0; i < shuffled.length; i++) {
    const riderId = shuffled[i].rider_id
    let resultStatus = 'FINISH'
    let finishOrder = rank

    if (i === shuffled.length - 1 || i === shuffled.length - 2) {
      resultStatus = 'DNS'
      finishOrder = null
    } else if (i === shuffled.length - 3 || i === shuffled.length - 4) {
      resultStatus = 'DNF'
      finishOrder = null
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

  console.log('\nScenario:')
  payload.forEach(p => console.log(`  - Rider ${p.rider_id.slice(0,8)}... → ${p.result_status} ${p.finish_order ? `(pos ${p.finish_order})` : ''}`))

  // Upsert results (overwrite existing)
  const { error: insertError } = await supabase
    .from('results')
    .upsert(payload, { onConflict: 'moto_id,rider_id' })

  if (insertError) { console.error('Failed:', insertError.message); return }

  // Re-lock
  const { error: lockError } = await supabase.from('motos').update({ status: 'LOCKED' }).eq('id', moto.id)
  if (lockError) { console.error('Lock failed:', lockError.message); return }

  console.log('\n✅ Moto 2 - Batch 6 berhasil diisi ulang dengan 2 DNF + 2 DNS dan di-LOCKED.')
}

run()
