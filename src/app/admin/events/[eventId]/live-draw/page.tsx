import './live-draw.css'
import Link from 'next/link'
import LiveDrawClient from './LiveDrawClient'

export default async function AdminLiveDrawPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return (
    <div className="ld-shell">
      <Link
        href={`/admin/events/${eventId}/motos`}
        className="ld-exit-btn"
      >
        ✕ EXIT FULLSCREEN
      </Link>
      <LiveDrawClient eventId={eventId} />
    </div>
  )
}
