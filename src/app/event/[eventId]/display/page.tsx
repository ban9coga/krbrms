import LiveDisplayClient from './LiveDisplayClient'

export default async function LiveDisplayPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <LiveDisplayClient eventId={eventId} />
}
