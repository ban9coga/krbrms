import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..')
const applyChanges = process.argv.includes('--apply')

const loadEnvFile = async (filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const separator = line.indexOf('=')
      if (separator <= 0) continue
      const key = line.slice(0, separator).trim()
      if (!key || process.env[key]) continue
      let value = line.slice(separator + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

const assertOk = (result) => {
  if (result.error) throw new Error(result.error.message)
  return result.data ?? []
}

const captureSnapshot = async (adminClient, event) => {
  const [settings, categories, motos, riders, results, participation, penalties, rules] = await Promise.all([
    adminClient.from('event_settings').select('event_id, event_logo_url, sponsor_logo_urls, display_theme, race_format_settings, business_settings, registration_open').eq('event_id', event.id).maybeSingle(),
    adminClient.from('categories').select('id, event_id, year, year_min, year_max, capacity, gender, label, enabled, sequence_order').eq('event_id', event.id).order('sequence_order', { ascending: true }),
    adminClient.from('motos').select('id, event_id, category_id, moto_name, moto_order, status, is_published, published_at, provisional_at, checker_prep_ready_at').eq('event_id', event.id).order('moto_order', { ascending: true }),
    adminClient.from('riders').select('id, event_id, name, rider_nickname, primary_category_id, gender, no_plate_display, club, photo_url, photo_thumbnail_url').eq('event_id', event.id),
    adminClient.from('results').select('moto_id, rider_id, finish_order, result_status').eq('event_id', event.id),
    adminClient.from('rider_participation_status').select('moto_id, rider_id, participation_status').eq('event_id', event.id),
    adminClient.from('rider_penalties').select('id, rider_id, moto_id, stage, rule_code, penalty_point, note, created_at').eq('event_id', event.id),
    adminClient.from('event_penalty_rules').select('code, description, penalty_point, applies_to_stage, is_active').eq('event_id', event.id),
  ])

  const categoryRows = assertOk(categories)
  const motoRows = assertOk(motos)
  const penaltyRows = assertOk(penalties)
  if (settings.error) throw new Error(settings.error.message)
  const motoIds = motoRows.map((row) => row.id)
  const categoryIds = categoryRows.map((row) => row.id)
  const penaltyIds = penaltyRows.map((row) => row.id)
  const [motoRiders, gates, stageResults, approvals] = await Promise.all([
    motoIds.length ? adminClient.from('moto_riders').select('moto_id, rider_id, created_at').in('moto_id', motoIds) : Promise.resolve({ data: [], error: null }),
    motoIds.length ? adminClient.from('moto_gate_positions').select('moto_id, rider_id, gate_position').in('moto_id', motoIds) : Promise.resolve({ data: [], error: null }),
    categoryIds.length ? adminClient.from('race_stage_result').select('category_id, rider_id, stage, final_class, batch_id, position, points').in('category_id', categoryIds) : Promise.resolve({ data: [], error: null }),
    penaltyIds.length ? adminClient.from('rider_penalty_approvals').select('penalty_id, approval_status, approved_at, approved_by').in('penalty_id', penaltyIds) : Promise.resolve({ data: [], error: null }),
  ])

  const payload = {
    event,
    settings: settings.data ?? null,
    categories: categoryRows,
    motos: motoRows,
    riders: assertOk(riders),
    moto_riders: assertOk(motoRiders),
    moto_gate_positions: assertOk(gates),
    results: assertOk(results),
    rider_participation_status: assertOk(participation),
    race_stage_result: assertOk(stageResults),
    rider_penalties: penaltyRows,
    rider_penalty_approvals: assertOk(approvals),
    event_penalty_rules: assertOk(rules),
  }

  if (!applyChanges) return payload
  const { error } = await adminClient.from('event_public_snapshots').upsert({
    event_id: event.id,
    schema_version: 1,
    payload,
    captured_at: new Date().toISOString(),
  }, { onConflict: 'event_id' })
  if (error) throw new Error(error.message)
  return payload
}

const main = async () => {
  await loadEnvFile(path.join(REPO_ROOT, '.env.local'))
  await loadEnvFile(path.join(REPO_ROOT, '.env'))
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')

  const adminClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const events = assertOk(await adminClient
    .from('events')
    .select('id, name, location, event_date, status, is_public, created_at, updated_at')
    .eq('status', 'FINISHED')
    .neq('is_public', false)
    .order('event_date', { ascending: true }))
  const existing = assertOk(await adminClient.from('event_public_snapshots').select('event_id'))
  const existingIds = new Set(existing.map((row) => row.event_id))
  const pending = events.filter((event) => !existingIds.has(event.id))

  console.log(`Mode              : ${applyChanges ? 'APPLY' : 'DRY RUN'}`)
  console.log(`Finished public   : ${events.length}`)
  console.log(`Already archived  : ${existingIds.size}`)
  console.log(`To archive        : ${pending.length}`)

  for (const [index, event] of pending.entries()) {
    process.stdout.write(`[${index + 1}/${pending.length}] ${event.name} ... `)
    const snapshot = await captureSnapshot(adminClient, event)
    console.log(`${applyChanges ? 'saved' : 'ready'} (${snapshot.riders.length} riders, ${snapshot.motos.length} motos)`)
  }
}

main().catch((error) => {
  console.error(`Fatal: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
