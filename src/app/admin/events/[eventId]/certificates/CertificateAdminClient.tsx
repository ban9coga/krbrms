'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useApiFetch } from '@/src/hooks/useApiFetch'

type CertificateRow = {
  id: string
  certificate_type: 'PARTICIPATION' | 'ACHIEVEMENT'
  certificate_code: string
  snapshot: { rider_name?: string; category?: string; plate?: string; achievement?: { label?: string } | null }
  issued_at: string
  revoked_at: string | null
  revoked_reason: string | null
}

export default function CertificateAdminClient({ eventId }: { eventId: string }) {
  const apiFetch = useApiFetch()
  const [rows, setRows] = useState<CertificateRow[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [target, setTarget] = useState<CertificateRow | null>(null)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const response = await apiFetch(`/api/admin/events/${eventId}/certificates`)
      setRows((response.data ?? []) as CertificateRow[])
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Gagal memuat sertifikat.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [eventId])

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('id-ID')
    if (!needle) return rows
    return rows.filter((row) => [row.certificate_code, row.snapshot.rider_name, row.snapshot.category, row.snapshot.plate].some((value) => String(value ?? '').toLocaleLowerCase('id-ID').includes(needle)))
  }, [query, rows])

  const updateCertificate = async (row: CertificateRow, action: 'revoke' | 'restore') => {
    setSaving(true)
    setNotice('')
    try {
      const response = await apiFetch(`/api/admin/events/${eventId}/certificates/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action, reason }),
      })
      const updated = response.data as CertificateRow
      setRows((previous) => previous.map((item) => (item.id === updated.id ? updated : item)))
      setTarget(null)
      setReason('')
      setNotice(action === 'revoke' ? 'Sertifikat telah dicabut. QR verifikasi akan menampilkan status tidak berlaku.' : 'Sertifikat dipulihkan dan kembali dapat diverifikasi.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Perubahan sertifikat gagal.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main style={{ maxWidth: 1180, margin: '0 auto', padding: '28px 18px 60px', display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 900, color: '#b45309', fontSize: 12, letterSpacing: '0.12em' }}>EVENT CERTIFICATES</div>
          <h1 style={{ margin: '5px 0 0', fontSize: 30 }}>Sertifikat terbit</h1>
          <p style={{ margin: '6px 0 0', color: '#475569', fontWeight: 600 }}>Riwayat Certificate ID, status verifikasi, dan pencabutan sertifikat event.</p>
        </div>
        <Link href={`/admin/events/${eventId}/settings`} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #334155', color: '#0f172a', fontWeight: 800, textDecoration: 'none' }}>Kembali ke Settings</Link>
      </header>
      <section style={{ display: 'grid', gap: 12, padding: 16, border: '1px solid #cbd5e1', borderRadius: 14, background: '#fff' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari Certificate ID, rider, plate, kategori..." style={{ flex: '1 1 300px', padding: 11, borderRadius: 10, border: '1px solid #94a3b8', fontWeight: 700 }} />
          <button type="button" onClick={() => void load()} disabled={loading} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #0f172a', background: '#fff', fontWeight: 900 }}>{loading ? 'Memuat...' : 'Muat ulang'}</button>
        </div>
        {notice && <div style={{ padding: 11, borderRadius: 10, background: '#fff7ed', color: '#9a3412', fontWeight: 800 }}>{notice}</div>}
        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>{filteredRows.length} sertifikat ditemukan.</div>
        <div style={{ display: 'grid', gap: 9 }}>
          {filteredRows.map((row) => (
            <article key={row.id} style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', padding: 14, border: `1px solid ${row.revoked_at ? '#fca5a5' : '#bbf7d0'}`, borderRadius: 12, background: row.revoked_at ? '#fff7f7' : '#f8fffa' }}>
              <div style={{ display: 'grid', gap: 3 }}>
                <strong>{row.snapshot.rider_name || 'Rider'}</strong>
                <span style={{ fontSize: 13 }}>{row.snapshot.category || '-'} | No. {row.snapshot.plate || '-'}</span>
                {row.snapshot.achievement?.label && <span style={{ color: '#b45309', fontWeight: 800, fontSize: 12 }}>{row.snapshot.achievement.label}</span>}
                <code style={{ fontSize: 12 }}>{row.certificate_code}</code>
                <span style={{ color: row.revoked_at ? '#b91c1c' : '#15803d', fontWeight: 800, fontSize: 12 }}>{row.revoked_at ? `DICABUT: ${row.revoked_reason || '-'}` : 'BERLAKU'}</span>
              </div>
              {row.revoked_at ? <button type="button" disabled={saving} onClick={() => void updateCertificate(row, 'restore')} style={{ padding: '9px 13px', borderRadius: 10, border: '1px solid #15803d', background: '#fff', color: '#15803d', fontWeight: 900 }}>Pulihkan</button> : <button type="button" disabled={saving} onClick={() => { setTarget(row); setReason('') }} style={{ padding: '9px 13px', borderRadius: 10, border: '1px solid #b91c1c', background: '#fff', color: '#b91c1c', fontWeight: 900 }}>Cabut sertifikat</button>}
            </article>
          ))}
          {!loading && filteredRows.length === 0 && <div style={{ padding: 24, border: '1px dashed #94a3b8', borderRadius: 12, color: '#64748b', fontWeight: 700 }}>Belum ada sertifikat yang diterbitkan untuk event ini.</div>}
        </div>
      </section>
      {target && <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'grid', placeItems: 'center', padding: 16, background: 'rgba(15,23,42,0.52)' }}>
        <section style={{ width: 'min(100%, 480px)', display: 'grid', gap: 12, padding: 20, borderRadius: 16, background: '#fff', boxShadow: '0 20px 60px rgba(15,23,42,.35)' }}>
          <h2 style={{ margin: 0 }}>Cabut sertifikat</h2>
          <p style={{ margin: 0, color: '#475569' }}>Certificate ID {target.certificate_code} tidak akan lolos halaman verifikasi setelah dicabut.</p>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Alasan pencabutan (opsional)" style={{ padding: 10, borderRadius: 10, border: '1px solid #94a3b8', resize: 'vertical' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={() => setTarget(null)} disabled={saving} style={{ padding: '9px 13px', borderRadius: 10, border: '1px solid #64748b', background: '#fff', fontWeight: 800 }}>Batal</button>
            <button type="button" onClick={() => void updateCertificate(target, 'revoke')} disabled={saving} style={{ padding: '9px 13px', borderRadius: 10, border: 0, background: '#b91c1c', color: '#fff', fontWeight: 900 }}>{saving ? 'Memproses...' : 'Cabut sekarang'}</button>
          </div>
        </section>
      </div>}
    </main>
  )
}
