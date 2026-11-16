import MotoWorkspaceClient from './MotoWorkspaceClient'

type PageProps = {
  params: Promise<{ eventId: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function AdminMotosPage({ params, searchParams }: PageProps) {
  const { eventId } = await params
  const { tab } = await searchParams
  return <MotoWorkspaceClient eventId={eventId} initialTab={tab === 'sequence' ? 'sequence' : 'motos'} />
}
