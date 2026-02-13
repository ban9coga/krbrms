import RidersClient from './RidersClient'

export default async function AdminRidersPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <RidersClient eventId={eventId} />
}
