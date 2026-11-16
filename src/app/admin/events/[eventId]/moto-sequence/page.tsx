import { redirect } from 'next/navigation'

type PageProps = {
  params: Promise<{ eventId: string }>
}

export const metadata = {
  title: 'Moto Sequence',
}

export default async function MotoSequencePage({ params }: PageProps) {
  const { eventId } = await params
  redirect(`/admin/events/${eventId}/motos?tab=sequence`)
}
