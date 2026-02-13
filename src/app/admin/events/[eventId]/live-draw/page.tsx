import LiveDrawClient from './LiveDrawClient'

export default async function AdminLiveDrawPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <LiveDrawClient eventId={eventId} />
}
