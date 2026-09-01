import ResultsClient from './ResultsClient'
import { getPublicFinishedEventArchive } from '../../../../services/publicFinishedEventArchive'

export default async function EventResultsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const archive = await getPublicFinishedEventArchive(eventId)
  return <ResultsClient eventId={eventId} initialArchive={archive} />
}
