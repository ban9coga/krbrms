import PenaltiesClient from './PenaltiesClient'

export default async function PenaltiesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <PenaltiesClient eventId={eventId} />
}
