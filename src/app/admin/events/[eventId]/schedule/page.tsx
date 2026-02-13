import ScheduleClient from './ScheduleClient'

export default async function AdminSchedulePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <ScheduleClient eventId={eventId} />
}
