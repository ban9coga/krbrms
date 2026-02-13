import RegisterClient from './RegisterClient'

export default async function EventRegisterPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <RegisterClient eventId={eventId} />
}
