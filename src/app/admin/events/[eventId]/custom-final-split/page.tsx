import CustomFinalSplitClient from './CustomFinalSplitClient'

export default async function AdminCustomFinalSplitPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <CustomFinalSplitClient eventId={eventId} />
}
