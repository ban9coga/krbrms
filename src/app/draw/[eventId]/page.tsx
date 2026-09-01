import Link from 'next/link'
import LiveDrawClient from '../../admin/events/[eventId]/live-draw/LiveDrawClient'
import '../../admin/events/[eventId]/live-draw/live-draw.css'

export default async function DrawEventWorkspacePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return (
    <div className="ld-shell">
      <Link href="/draw" className="ld-exit-btn" aria-label="Keluar dari drawing">
        <span aria-hidden="true">⇥</span>
      </Link>
      <LiveDrawClient eventId={eventId} />
    </div>
  )
}
