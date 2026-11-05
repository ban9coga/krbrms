import RaceDayClient from './RaceDayClient'

export default async function AdminRaceDayPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <RaceDayClient eventId={eventId} />
}

