import YearClient from './YearClient'
import { getPublicFinishedEventArchive } from '../../../../../services/publicFinishedEventArchive'

export default async function RaceCategoryPage({
  params,
}: {
  params: Promise<{ eventId: string; year: string }>
}) {
  const { eventId, year } = await params
  const archive = await getPublicFinishedEventArchive(eventId)
  return <YearClient eventId={eventId} year={year} initialArchive={archive} />
}
