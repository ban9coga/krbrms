import MotosClient from './MotosClient'

export default async function AdminMotosPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <MotosClient eventId={eventId} />
}
