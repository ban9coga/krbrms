import { NextResponse } from 'next/server'
import { requireBackoffice } from '../../../../../../lib/auth'
import { GET as getLiveScore } from '../../../../public/events/[eventId]/live-score/route'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const auth = await requireBackoffice(req.headers.get('authorization'), eventId)
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sourceUrl = new URL(req.url)
  const categoryId = sourceUrl.searchParams.get('category_id')
  if (!categoryId) return NextResponse.json({ error: 'category_id required' }, { status: 400 })

  const recapUrl = new URL(req.url)
  recapUrl.searchParams.set('include_upcoming', '1')
  recapUrl.searchParams.set('include_photos', '0')

  return getLiveScore(new Request(recapUrl, req), { params: Promise.resolve({ eventId }) })
}
