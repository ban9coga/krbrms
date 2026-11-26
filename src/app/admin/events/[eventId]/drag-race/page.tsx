import DragRaceAdminClient from './DragRaceAdminClient'

export default async function DragRaceAdminPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <DragRaceAdminClient eventId={eventId} />
}
