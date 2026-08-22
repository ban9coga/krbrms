import DrawSettingsClient from './DrawSettingsClient'

export default async function DrawSettingsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <DrawSettingsClient eventId={eventId} />
}
