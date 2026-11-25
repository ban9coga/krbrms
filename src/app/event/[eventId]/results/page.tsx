import type { Metadata } from 'next'
import ResultsClient from './ResultsClient'
import { getPublicFinishedEventArchive } from '../../../../services/publicFinishedEventArchive'
import { canonicalMetadata } from '../../../../lib/seoMetadata'

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const { eventId } = await params
  return canonicalMetadata(`/event/${eventId}/results`)
}

export default async function EventResultsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const archive = await getPublicFinishedEventArchive(eventId)
  return <ResultsClient eventId={eventId} initialArchive={archive} />
}
