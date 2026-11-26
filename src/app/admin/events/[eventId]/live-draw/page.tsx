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
        aria-label="Tutup Drawing Batch dan kembali ke Moto"
        title="Tutup dan kembali ke Moto"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m18 6-12 12" />
          <path d="m6 6 12 12" />
        </svg>
      </Link>
      <LiveDrawClient eventId={eventId} />
    </div>
  )
}
