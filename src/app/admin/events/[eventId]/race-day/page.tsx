import { redirect } from 'next/navigation'

export default async function AdminRaceDayPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  redirect(`/admin/events/${eventId}/motos`)
}

