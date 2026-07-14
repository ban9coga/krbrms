import './live-draw.css'
import LiveDrawClient from './LiveDrawClient'

export default async function AdminLiveDrawPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return (
    <div className="ld-shell">
      <LiveDrawClient eventId={eventId} />
    </div>
  )
}
