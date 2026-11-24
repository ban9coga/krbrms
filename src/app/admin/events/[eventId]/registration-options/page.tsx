import RegistrationOptionsClient from './RegistrationOptionsClient'

export default async function RegistrationOptionsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <RegistrationOptionsClient eventId={eventId} />
}
