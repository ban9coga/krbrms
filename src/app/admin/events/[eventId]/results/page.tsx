import Link from 'next/link'

export default async function AdminResultsSummaryPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Results Summary</h1>
      <div style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
        Modul summary (standing akhir per category / export) akan kita lengkapi setelah flow live result stabil.
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <Link
          href={`/event/${eventId}/results`}
          style={{
            display: 'inline-block',
            padding: '12px 14px',
            borderRadius: 14,
            border: '2px solid #111',
            background: '#2ecc71',
            color: '#111',
            fontWeight: 950,
            textDecoration: 'none',
            width: 'fit-content',
          }}
        >
          Open Public Results
        </Link>
      </div>
    </div>
  )
}

