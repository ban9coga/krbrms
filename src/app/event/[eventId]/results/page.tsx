import ResultsClient from './ResultsClient'

export default async function EventResultsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <ResultsClient eventId={eventId} />
}
