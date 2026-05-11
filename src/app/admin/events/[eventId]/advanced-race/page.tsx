import { redirect } from 'next/navigation'

export default async function AdminAdvancedRacePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  redirect(`/admin/events/${eventId}/settings?section=advanced`)
}
