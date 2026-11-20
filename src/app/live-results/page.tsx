import { redirect } from 'next/navigation'
import { adminClient } from '../../lib/auth'
import { getLiveEvent } from '../../lib/liveEvent'

export const dynamic = 'force-dynamic'

export default async function LiveResultsPage() {
  const liveEvent = await getLiveEvent()
  if (!liveEvent) redirect('/jadwal-race-pushbike')

  const { data: categories } = await adminClient
    .from('categories')
    .select('id, enabled')
    .eq('event_id', liveEvent.id)
    .order('sequence_order', { ascending: true })
    .order('year_min', { ascending: true })
    .order('gender', { ascending: true })

  const category = categories?.find((item) => item.enabled !== false) ?? categories?.[0]
  if (!category) redirect(`/event/${liveEvent.id}`)

  redirect(`/event/${liveEvent.id}/live-score/${encodeURIComponent(category.id)}`)
}
