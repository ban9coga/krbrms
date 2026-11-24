import RegulationsClient from './RegulationsClient'

export default async function AdminEventRegulationsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <RegulationsClient eventId={eventId} />
}
