import { redirect } from 'next/navigation'

export default async function AdminEventIndexPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  redirect(`/admin/events/${eventId}/riders`)
}
