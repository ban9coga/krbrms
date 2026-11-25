import type { Metadata } from 'next'
import YearClient from './YearClient'
import { getPublicFinishedEventArchive } from '../../../../../services/publicFinishedEventArchive'
import { canonicalMetadata } from '../../../../../lib/seoMetadata'

export async function generateMetadata({ params }: { params: Promise<{ eventId: string; year: string }> }): Promise<Metadata> {
  const { eventId, year } = await params
  return canonicalMetadata(`/event/${eventId}/results/${year}`)
}

export default async function RaceCategoryPage({
  params,
}: {
  params: Promise<{ eventId: string; year: string }>
}) {
  const { eventId, year } = await params
  const archive = await getPublicFinishedEventArchive(eventId)
  return <YearClient eventId={eventId} year={year} initialArchive={archive} />
}
