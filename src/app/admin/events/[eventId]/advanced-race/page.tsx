import SettingsClient from '../settings/SettingsClient'

export default async function AdminAdvancedRacePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return <SettingsClient eventId={eventId} mode="advanced" />
}
