import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function run() {
  const { data: events } = await supabase.from('events').select('id, name').ilike('name', '%SHC Test%')
  const event = events?.[0]
  if (!event) { console.error('Event not found'); return }
  console.log(`Event: ${event.name} (${event.id})\n`)

  const { data: categories } = await supabase
    .from('categories').select('id, label').eq('event_id', event.id).ilike('label', '%2021 Boys%')
  const category = categories?.[0]
  if (!category) { console.error('Category not found'); return }
  console.log(`Category: ${category.label}\n`)

  // Get all motos for this category
  const { data: motos } = await supabase
    .from('motos')
    .select('id, moto_name, status')
    .eq('event_id', event.id)
    .eq('category_id', category.id)
    .order('moto_order', { ascending: true })

  // Find qualification (Moto 1,2,3) and Repechage motos
  const qualMotos = motos?.filter(m => /^moto\s*\d+/i.test(m.moto_name)) ?? []
  const repechageMotos = motos?.filter(m => /^repechage/i.test(m.moto_name)) ?? []

  console.log(`Qualification motos: ${qualMotos.length}`)
  qualMotos.forEach(m => console.log(`  - ${m.moto_name} [${m.status}]`))

  console.log(`\nRepechage motos: ${repechageMotos.length}`)
  repechageMotos.forEach(m => console.log(`  - ${m.moto_name} [${m.status}]`))

  if (repechageMotos.length === 0) {
    console.log('\n>> Repechage belum dibuat. Lakukan Compute Stage terlebih dahulu setelah semua Moto selesai.')
    return
  }

  // Get moto_riders for repechage motos
  const repIds = repechageMotos.map(m => m.id)
  const { data: repRiders } = await supabase
    .from('moto_riders').select('moto_id, rider_id').in('moto_id', repIds)

  // Get gate positions for repechage motos
  const { data: repGates } = await supabase
    .from('moto_gate_positions').select('moto_id, rider_id, gate_position').in('moto_id', repIds).order('gate_position')

  // Get qual moto_riders to understand batch origin
  const qualIds = qualMotos.map(m => m.id)
  const { data: qualRiders } = await supabase
    .from('moto_riders').select('moto_id, rider_id').in('moto_id', qualIds)
  const { data: qualGates } = await supabase
    .from('moto_gate_positions').select('moto_id, rider_id, gate_position').in('moto_id', qualIds)

  // Build batch origin map
  const batchByRider = new Map()
  for (const row of qualRiders ?? []) {
    const moto = qualMotos.find(m => m.id === row.moto_id)
    // Only Moto 1 per batch is the canonical batch identifier
    if (moto && /moto\s*1/i.test(moto.moto_name)) {
      batchByRider.set(row.rider_id, moto.moto_name.replace(/moto\s*1\s*-\s*/i, 'Batch '))
    }
  }

  console.log('\n=== REPECHAGE GATE BREAKDOWN ===')
  for (const rep of repechageMotos) {
    const riders = repRiders?.filter(r => r.moto_id === rep.id) ?? []
    const gates = repGates?.filter(g => g.moto_id === rep.id) ?? []
    const gateMap = new Map(gates.map(g => [g.rider_id, g.gate_position]))

    console.log(`\n${rep.moto_name} (${riders.length} riders):`)
    riders.forEach(r => {
      const gate = gateMap.get(r.rider_id) ?? '?'
      const batch = batchByRider.get(r.rider_id) ?? 'unknown batch'
      console.log(`  Gate ${gate}: Rider ${r.rider_id.slice(0,8)}... (from ${batch})`)
    })

    // Check if carry-over pattern: each batch group is represented evenly
    const batchGroups = new Map()
    riders.forEach(r => {
      const batch = batchByRider.get(r.rider_id) ?? 'unknown'
      if (!batchGroups.has(batch)) batchGroups.set(batch, [])
      batchGroups.get(batch).push(r.rider_id)
    })
    const sizes = Array.from(batchGroups.values()).map(g => g.size || g.length)
    const allEqual = sizes.every(s => s === sizes[0])
    console.log(`\n  Batch asal yang terwakili: ${batchGroups.size} batch`)
    console.log(`  Jumlah rider per batch: ${sizes.join(', ')}`)
    console.log(`  Ukuran seragam? ${allEqual ? 'YA → kemungkinan pakai distributeCarryOverHeats' : 'TIDAK → kemungkinan pakai distributeSeededHeats (snake draft)'}`)
  }
}

run()
