import CategoriesClient from './CategoriesClient'

export default async function AdminCategoriesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <CategoriesClient eventId={eventId} />
}
