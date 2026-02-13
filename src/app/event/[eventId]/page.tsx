import EventDetailClient from './EventDetailClient'

export default async function EventDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <EventDetailClient eventId={eventId} />
}
