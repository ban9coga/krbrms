import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in environment.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function main() {
  const { data: events } = await supabase.from('events').select('id').ilike('name','%SHC Test%').limit(1);
  const event = events[0];

  const { data: cats } = await supabase.from('categories').select('id,label').eq('event_id', event.id).ilike('label','%2021 Boys%').limit(1);
  const cat = cats[0];

  console.log(`Checking Final motos for category: ${cat.label}\n`);

  // Get all final motos
  const { data: finalMotos } = await supabase
    .from('motos')
    .select('id, moto_name')
    .eq('category_id', cat.id)
    .ilike('moto_name', 'Final%')
    .order('moto_name');

  if (!finalMotos || finalMotos.length === 0) {
    console.log('No Final motos found.');
    return;
  }

  // Get all previous DNS results for this category
  const { data: allCategoryMotos } = await supabase
    .from('motos')
    .select('id, moto_name')
    .eq('category_id', cat.id);
  const categoryMotoIds = allCategoryMotos.map(m => m.id);
  const motoNameMap = Object.fromEntries(allCategoryMotos.map(m => [m.id, m.moto_name]));

  const { data: dnsResults } = await supabase
    .from('results')
    .select('rider_id, moto_id')
    .in('moto_id', categoryMotoIds)
    .eq('result_status', 'DNS');

  // Map rider_id to an array of moto names where they DNS'd
  const dnsHistoryByRider = {};
  for (const result of dnsResults) {
    if (!dnsHistoryByRider[result.rider_id]) {
      dnsHistoryByRider[result.rider_id] = [];
    }
    dnsHistoryByRider[result.rider_id].push(motoNameMap[result.moto_id]);
  }

  // Analyze each final moto
  for (const moto of finalMotos) {
    console.log(`=== ${moto.moto_name} ===`);
    
    const { data: riders } = await supabase
      .from('moto_riders')
      .select('rider_id, riders(name)')
      .eq('moto_id', moto.id);
      
    // Get gate positions
    const { data: gatePositions } = await supabase
      .from('moto_gate_positions')
      .select('rider_id, gate_position')
      .eq('moto_id', moto.id);
      
    const gateMap = Object.fromEntries(gatePositions.map(g => [g.rider_id, g.gate_position]));

    const sortedRiders = riders.map(r => ({
      ...r,
      gate: gateMap[r.rider_id] ?? 99,
      dnsHistory: dnsHistoryByRider[r.rider_id] || []
    })).sort((a, b) => a.gate - b.gate);

    for (const r of sortedRiders) {
      const dnsInfo = r.dnsHistory.length > 0 
        ? `[DNS History: ${r.dnsHistory.join(', ')}]` 
        : '';
      console.log(`Gate ${r.gate}: ${r.riders.name} ${dnsInfo}`);
    }
    console.log();
  }
}

main().catch(console.error);
