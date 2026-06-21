import CheckInClient from './CheckInClient'

export default async function RegistrationCheckInPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <CheckInClient eventId={eventId} />
}
