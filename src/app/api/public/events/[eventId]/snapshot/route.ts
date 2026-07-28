import { NextResponse } from 'next/server'
import { adminClient } from '../../../../../../lib/auth'

type SnapshotPayload = {
  event?: { is_public?: boolean | null; status?: string | null }
  categories?: Array<{
    id: string
    year: number
    year_min?: number | null
    year_max?: number | null
    capacity?: number | null
    gender: 'BOY' | 'GIRL' | 'MIX'
    label: string
    enabled: boolean
    sequence_order?: number | null
  }>
  riders?: Array<{ primary_category_id?: string | null }>
}

const ARCHIVE_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=31536000, s-maxage=31536000, immutable',
}

/**
 * Small, CDN-cacheable view of a finished event archive.
 * The complete snapshot stays server-side; public event detail only needs
 * category availability and rider totals.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const { data: snapshot, error } = await adminClient
    .from('event_public_snapshots')
    .select('payload, captured_at')
    .eq('event_id', eventId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!snapshot?.payload || typeof snapshot.payload !== 'object') {
    return NextResponse.json({ error: 'Arsip event belum tersedia.' }, { status: 404 })
  }

  const payload = snapshot.payload as SnapshotPayload
  if (payload.event?.status !== 'FINISHED' || payload.event?.is_public === false) {
    return NextResponse.json({ error: 'Arsip event tidak tersedia.' }, { status: 404 })
  }

  const riderCountByCategory = new Map<string, number>()
  for (const rider of payload.riders ?? []) {
    if (!rider.primary_category_id) continue
    riderCountByCategory.set(
      rider.primary_category_id,
      (riderCountByCategory.get(rider.primary_category_id) ?? 0) + 1
    )
  }

  const categories = (payload.categories ?? []).map((category) => {
    const filled = riderCountByCategory.get(category.id) ?? 0
    const capacity = typeof category.capacity === 'number' ? category.capacity : null
    return {
      ...category,
      filled,
      remaining: capacity === null ? null : Math.max(0, capacity - filled),
      is_full: capacity !== null && filled >= capacity,
    }
  })

  return NextResponse.json(
    {
      data: {
        categories,
        rider_total: (payload.riders ?? []).length,
        captured_at: snapshot.captured_at,
      },
    },
    { headers: ARCHIVE_CACHE_HEADERS }
  )
}
