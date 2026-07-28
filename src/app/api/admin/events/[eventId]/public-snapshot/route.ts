import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { adminClient, requireAdmin } from '../../../../../../lib/auth'
import { capturePublicEventSnapshot } from '../../../../../../services/publicEventSnapshot'
import { PUBLIC_FINISHED_EVENT_ARCHIVE_TAG } from '../../../../../../services/publicFinishedEventArchive'

const FINISHED_LIVE_SCORE_TAG = 'public-finished-live-score'

export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireAdmin(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (auth.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Hanya Central Admin yang dapat memperbarui arsip final.' }, { status: 403 })
  }

  const { data: event, error: eventError } = await adminClient
    .from('events')
    .select('id, name, status')
    .eq('id', eventId)
    .maybeSingle()
  if (eventError) return NextResponse.json({ error: eventError.message }, { status: 400 })
  if (!event) return NextResponse.json({ error: 'Event tidak ditemukan.' }, { status: 404 })
  if (event.status !== 'FINISHED') {
    return NextResponse.json({ error: 'Arsip final hanya dapat dibuat untuk event berstatus FINISHED.' }, { status: 409 })
  }

  try {
    const summary = await capturePublicEventSnapshot(eventId)
    revalidateTag(PUBLIC_FINISHED_EVENT_ARCHIVE_TAG, 'max')
    revalidateTag(FINISHED_LIVE_SCORE_TAG, 'max')
    return NextResponse.json({ data: summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gagal memperbarui arsip final.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
