import RegistrationsClient from './RegistrationsClient'

export default async function AdminRegistrationsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <RegistrationsClient eventId={eventId} />
}
