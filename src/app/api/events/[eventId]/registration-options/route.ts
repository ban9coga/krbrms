import { NextResponse } from 'next/server'
import { adminClient, requireAdmin } from '../../../../../lib/auth'

type Bundle = { id: string; name: string; description: string | null; price: number; enabled: boolean }
type RacepackItem = { id: string; name: string; included: boolean }
type EventBundleOffer = { id: string; name: string; paired_event_id: string; bundle_base_price_per_rider: number; enabled: boolean }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const normalizeOptions = (value: unknown) => {
  if (!isRecord(value)) return null
  const bundlesRaw = value.registration_bundles
  const racepackRaw = value.public_racepack_items
  const offerRaw = value.event_bundle_offer
  if (!Array.isArray(bundlesRaw) || !Array.isArray(racepackRaw)) return null
  if (bundlesRaw.length > 20 || racepackRaw.length > 40) return null

  const bundles: Bundle[] = []
  for (const item of bundlesRaw) {
    if (!isRecord(item)) return null
    const id = typeof item.id === 'string' ? item.id.trim().slice(0, 80) : ''
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    const description = typeof item.description === 'string' ? item.description.trim().slice(0, 240) : ''
    const price = Number(item.price)
    if (!id || !name || name.length > 100 || !Number.isSafeInteger(price) || price < 0 || price > 1_000_000_000) return null
    bundles.push({ id, name, description: description || null, price, enabled: item.enabled === true })
  }

  const racepackItems: RacepackItem[] = []
  for (const item of racepackRaw) {
    if (!isRecord(item)) return null
    const id = typeof item.id === 'string' ? item.id.trim().slice(0, 80) : ''
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!id || !name || name.length > 120) return null
    racepackItems.push({ id, name, included: item.included === true })
  }

  let eventBundleOffer: EventBundleOffer | null = null
  if (offerRaw != null) {
    if (!isRecord(offerRaw)) return null
    const id = typeof offerRaw.id === 'string' ? offerRaw.id.trim().slice(0, 80) : ''
    const name = typeof offerRaw.name === 'string' ? offerRaw.name.trim() : ''
    const pairedEventId = typeof offerRaw.paired_event_id === 'string' ? offerRaw.paired_event_id.trim() : ''
    const packagePrice = Number(offerRaw.bundle_base_price_per_rider)
    if (
      !id || !name || name.length > 100 ||
      !/^[0-9a-f-]{36}$/i.test(pairedEventId) ||
      !Number.isSafeInteger(packagePrice) || packagePrice <= 0 || packagePrice > 1_000_000_000
    ) return null
    eventBundleOffer = {
      id,
      name,
      paired_event_id: pairedEventId,
      bundle_base_price_per_rider: packagePrice,
      enabled: offerRaw.enabled === true,
    }
  }

  return { bundles, racepackItems, eventBundleOffer }
}

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [{ data, error }, { data: events, error: eventsError }] = await Promise.all([
    adminClient.from('event_settings').select('business_settings').eq('event_id', eventId).maybeSingle(),
    adminClient.from('events').select('id, name, event_date, status').eq('is_public', true).neq('id', eventId).neq('status', 'FINISHED').order('event_date', { ascending: true }),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 400 })
  const settings = isRecord(data?.business_settings) ? data.business_settings : {}
  return NextResponse.json({
    data: {
      registration_bundles: Array.isArray(settings.registration_bundles) ? settings.registration_bundles : [],
      public_racepack_items: Array.isArray(settings.public_racepack_items) ? settings.public_racepack_items : [],
      event_bundle_offer: isRecord(settings.event_bundle_offer) ? settings.event_bundle_offer : null,
      available_events: events ?? [],
    },
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const options = normalizeOptions(body)
  if (!options) return NextResponse.json({ error: 'Daftar bundling atau racepack tidak valid.' }, { status: 400 })

  if (options.eventBundleOffer) {
    if (options.eventBundleOffer.paired_event_id === eventId) {
      return NextResponse.json({ error: 'Event tujuan paket harus berbeda dari event ini.' }, { status: 400 })
    }
    const { data: pairedEvent, error: pairedEventError } = await adminClient
      .from('events')
      .select('id, is_public, status')
      .eq('id', options.eventBundleOffer.paired_event_id)
      .maybeSingle()
    if (pairedEventError) return NextResponse.json({ error: pairedEventError.message }, { status: 400 })
    if (!pairedEvent || pairedEvent.is_public === false || (options.eventBundleOffer.enabled && pairedEvent.status === 'FINISHED')) {
      return NextResponse.json({ error: 'Event pasangan tidak ditemukan atau tidak tersedia untuk publik.' }, { status: 400 })
    }
    if (options.eventBundleOffer.enabled) {
      const [sourcePriceResult, pairedPriceResult] = await Promise.all([
        adminClient.from('event_settings').select('base_price').eq('event_id', eventId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        adminClient.from('event_settings').select('base_price').eq('event_id', options.eventBundleOffer.paired_event_id).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      if (sourcePriceResult.error || pairedPriceResult.error) {
        return NextResponse.json({ error: sourcePriceResult.error?.message ?? pairedPriceResult.error?.message }, { status: 400 })
      }
      const sourceBase = Number(sourcePriceResult.data?.base_price) > 0 ? Number(sourcePriceResult.data?.base_price) : 250000
      const pairedBase = Number(pairedPriceResult.data?.base_price) > 0 ? Number(pairedPriceResult.data?.base_price) : 250000
      if (options.eventBundleOffer.bundle_base_price_per_rider >= sourceBase + pairedBase) {
        return NextResponse.json({ error: 'Harga dasar paket harus lebih rendah daripada total biaya daftar normal kedua event.' }, { status: 400 })
      }
    }
  }

  const { data: existing, error: readError } = await adminClient.from('event_settings').select('business_settings').eq('event_id', eventId).maybeSingle()
  if (readError) return NextResponse.json({ error: readError.message }, { status: 400 })
  const current = isRecord(existing?.business_settings) ? existing.business_settings : {}
  const { error } = await adminClient.from('event_settings').upsert({
    event_id: eventId,
    business_settings: {
      ...current,
      registration_bundles: options.bundles,
      public_racepack_items: options.racepackItems,
      event_bundle_offer: options.eventBundleOffer,
    },
  }, { onConflict: 'event_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ data: { ...options, available_events: [] } })
}
