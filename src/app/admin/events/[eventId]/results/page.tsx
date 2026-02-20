import ResultsSummaryClient from './ResultsSummaryClient'

export default async function AdminResultsSummaryPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <ResultsSummaryClient eventId={eventId} />
}

