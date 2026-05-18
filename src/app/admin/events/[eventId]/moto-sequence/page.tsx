import MotoSequenceClient from './MotoSequenceClient'

type PageProps = {
  params: Promise<{ eventId: string }>
}

export const metadata = {
  title: 'Moto Sequence',
}

export default async function MotoSequencePage({ params }: PageProps) {
  const { eventId } = await params
  return <MotoSequenceClient eventId={eventId} />
}
