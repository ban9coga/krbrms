import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'
import { requireJury } from '../../../../../../services/juryAuth'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await requireJury(req, ['RACE_DIRECTOR', 'super_admin'])
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { eventId } = await params

  const { data: requirements, error: reqError } = await adminClient
    .from('event_safety_requirements')
    .select('id, is_required')
    .eq('event_id', eventId)
    .eq('is_required', true)
  if (reqError) return NextResponse.json({ error: reqError.message }, { status: 400 })
  const requiredIds = new Set((requirements ?? []).map((r) => r.id))

  const { data: motos, error: motoError } = await adminClient
    .from('motos')
    .select('id, moto_name, moto_order, status')
    .eq('event_id', eventId)
    .in('status', ['LIVE', 'UPCOMING', 'PROVISIONAL', 'LOCKED'])
    .order('moto_order', { ascending: true })
  if (motoError) return NextResponse.json({ error: motoError.message }, { status: 400 })

  const motoIds = (motos ?? []).map((m) => m.id)
  if (motoIds.length === 0) return NextResponse.json({ data: [] })

  const { data: motoRiders, error: mrError } = await adminClient
    .from('moto_riders')
    .select('moto_id, rider_id')
    .in('moto_id', motoIds)
  if (mrError) return NextResponse.json({ error: mrError.message }, { status: 400 })

  const { data: statuses, error: stError } = await adminClient
    .from('rider_participation_status')
    .select('rider_id, participation_status')
    .eq('event_id', eventId)
  if (stError) return NextResponse.json({ error: stError.message }, { status: 400 })
  const statusMap = new Map((statuses ?? []).map((s) => [s.rider_id, s.participation_status]))

  const { data: checks, error: checkError } = await adminClient
    .from('rider_safety_checks')
    .select('moto_id, rider_id, requirement_id, is_checked')
    .in('moto_id', motoIds)
  if (checkError) return NextResponse.json({ error: checkError.message }, { status: 400 })

  const checkMap = new Map<string, Set<string>>() // key = motoId:riderId
  for (const row of checks ?? []) {
    if (!row.is_checked) continue
    const key = `${row.moto_id}:${row.rider_id}`
    const set = checkMap.get(key) ?? new Set<string>()
    set.add(row.requirement_id)
    checkMap.set(key, set)
  }

  const ridersByMoto = new Map<string, string[]>()
  for (const row of motoRiders ?? []) {
    const list = ridersByMoto.get(row.moto_id) ?? []
    list.push(row.rider_id)
    ridersByMoto.set(row.moto_id, list)
  }

  const data = (motos ?? []).map((m) => {
    const riders = ridersByMoto.get(m.id) ?? []
    let ready = 0
    let checked = 0
    let absent = 0
    let warnings = 0
    for (const riderId of riders) {
      const status = statusMap.get(riderId) ?? null
      if (status === 'ABSENT') {
        absent += 1
        checked += 1
        continue
      }
      if (status === 'DNS') {
        checked += 1
        continue
      }
      if (status !== 'ACTIVE') continue
      checked += 1
      ready += 1
      const key = `${m.id}:${riderId}`
      const set = checkMap.get(key) ?? new Set<string>()
      let ok = true
      for (const reqId of requiredIds) {
        if (!set.has(reqId)) {
          ok = false
          break
        }
      }
      if (!ok) warnings += 1
    }
    const total = riders.length
    const isReady = total > 0 && ready + absent === total
    const status = total === 0 ? 'WAITING' : checked === 0 ? 'WAITING' : isReady ? 'READY' : 'CHECKING'
    return {
      moto_id: m.id,
      moto_name: m.moto_name,
      status,
      total,
      ready,
      absent,
      warnings,
    }
  })

  return NextResponse.json({ data })
}
