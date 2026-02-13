import { redirect } from 'next/navigation'

export default async function ResultDetailPage({
  params,
}: {
  params: Promise<{ eventId: string; year: string; raceCategory: string }>
}) {
  const { eventId, raceCategory } = await params
  redirect(`/event/${eventId}/live-score/${encodeURIComponent(raceCategory)}`)
}
