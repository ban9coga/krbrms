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
        aria-label="Kembali ke Moto"
        title="Kembali ke Moto"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </svg>
      </Link>
      <LiveDrawClient eventId={eventId} />
    </div>
  )
}
