import LiveClient from './LiveClient'

export default async function AdminLiveResultPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <LiveClient eventId={eventId} />
}
