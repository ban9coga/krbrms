import SettingsClient from './SettingsClient'

export default async function AdminEventSettingsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <SettingsClient eventId={eventId} />
}
