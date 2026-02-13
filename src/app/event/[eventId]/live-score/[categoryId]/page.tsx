import LiveScoreClient from './LiveScoreClient'

export default async function LiveScorePage({
  params,
}: {
  params: Promise<{ eventId: string; categoryId: string }>
}) {
  const { eventId, categoryId } = await params
  return <LiveScoreClient eventId={eventId} categoryId={categoryId} />
}
