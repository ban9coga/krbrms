import YearClient from './YearClient'

export default async function RaceCategoryPage({
  params,
}: {
  params: Promise<{ eventId: string; year: string }>
}) {
  const { eventId, year } = await params
  return <YearClient eventId={eventId} year={year} />
}
