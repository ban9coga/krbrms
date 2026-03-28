'use client'

import { useEffect, useMemo, useState } from 'react'

type ChecklistItem = {
  id: string
  label: string
}

type ChecklistSection = {
  title: string
  items: ChecklistItem[]
}

const STORAGE_KEY = 'krb_uat_checklist_v1'

const sections: ChecklistSection[] = [
  {
    title: '1. Pre-Flight',
    items: [
      { id: '1.1', label: 'Aplikasi bisa diakses tanpa error (/, /login, /admin)' },
      { id: '1.2', label: 'Semua role test tersedia (Central Admin, Operator Admin, Race Control, Checker, Finisher, Race Director, MC)' },
      { id: '1.3', label: 'Storage foto/dokumen bisa upload' },
      { id: '1.4', label: 'Build terakhir sukses (local/vercel)' },
    ],
  },
  {
    title: '2. Public Flow',
    items: [
      { id: '2.1', label: 'Landing menampilkan daftar event publik' },
      { id: '2.2', label: 'Klik event membuka halaman detail event yang benar' },
      { id: '2.3', label: 'Tombol register mengarah ke /event/[eventId]/register' },
      { id: '2.4', label: 'Validasi form rider wajib berjalan' },
      { id: '2.5', label: 'Kategori otomatis terdeteksi dari DOB + gender' },
      { id: '2.6', label: 'Upload foto rider berhasil' },
      { id: '2.7', label: 'Upload dokumen KK/Akte berhasil' },
      { id: '2.8', label: 'Submit registrasi berhasil' },
      { id: '2.9', label: 'Anti duplikasi plate bekerja' },
    ],
  },
  {
    title: '3. Admin Setup Event',
    items: [
      { id: '3.1', label: 'Operator Admin login berhasil' },
      { id: '3.2', label: 'Buat event baru berhasil' },
      { id: '3.3', label: 'Buat kategori berhasil' },
      { id: '3.4', label: 'Buat/cek moto berhasil' },
      { id: '3.5', label: 'Schedule race tersimpan' },
      { id: '3.6', label: 'Settings event tersimpan' },
      { id: '3.7', label: 'Status event bisa diubah ke LIVE/FINISHED' },
    ],
  },
  {
    title: '4. Admin Registrations & Riders',
    items: [
      { id: '4.1', label: 'Daftar registrasi tampil' },
      { id: '4.2', label: 'Detail bukti file bisa dibuka' },
      { id: '4.3', label: 'Approve registrasi membuat rider di event' },
      { id: '4.4', label: 'Reject registrasi simpan alasan' },
      { id: '4.5', label: 'Tambah rider manual berhasil' },
      { id: '4.6', label: 'Edit rider berhasil' },
      { id: '4.7', label: 'Hapus rider (saat belum LIVE) berhasil' },
      { id: '4.8', label: 'Font dan kontras halaman admin terbaca jelas' },
    ],
  },
  {
    title: '5. Checker / Jury Start',
    items: [
      { id: '5.1', label: 'Login role Checker berhasil' },
      { id: '5.2', label: 'Topbar menampilkan user/role yang benar' },
      { id: '5.3', label: 'Gate selector menampilkan event LIVE' },
      { id: '5.4', label: 'Auto-redirect jalan saat syarat terpenuhi' },
      { id: '5.5', label: 'Pilih moto manual berjalan normal' },
      { id: '5.6', label: 'Data rider di gate sesuai moto' },
      { id: '5.7', label: 'Aksi checker tersimpan' },
    ],
  },
  {
    title: '6. Finisher / Jury Finish',
    items: [
      { id: '6.1', label: 'Login role Finisher berhasil' },
      { id: '6.2', label: 'Event dan moto terload benar' },
      { id: '6.3', label: 'Input urutan finish bisa disimpan' },
      { id: '6.4', label: 'Ganti event tidak membawa data stale' },
      { id: '6.5', label: 'Refresh data rider hasil berfungsi' },
    ],
  },
  {
    title: '7. Race Director',
    items: [
      { id: '7.1', label: 'Login role Race Director berhasil' },
      { id: '7.2', label: 'Daftar approval tampil' },
      { id: '7.3', label: 'Approve hasil moto berhasil' },
      { id: '7.4', label: 'Reject/override penalty berhasil' },
      { id: '7.5', label: 'Lock/unlock moto sesuai rule berjalan' },
    ],
  },
  {
    title: '8. Race Control',
    items: [
      { id: '8.1', label: 'Login role Race Control berhasil' },
      { id: '8.2', label: 'Queue/flow race tampil sesuai event LIVE' },
      { id: '8.3', label: 'Update dari checker/finisher terbaca di race control' },
    ],
  },
  {
    title: '9. MC',
    items: [
      { id: '9.1', label: 'Login role MC berhasil' },
      { id: '9.2', label: 'MC diarahkan ke /mc (bukan /admin)' },
      { id: '9.3', label: 'Halaman /mc menampilkan daftar event' },
      { id: '9.4', label: 'Halaman /mc/[eventId] menampilkan live board' },
    ],
  },
  {
    title: '10. Security & Access',
    items: [
      { id: '10.1', label: 'Central Admin bisa akses /admin/users' },
      { id: '10.2', label: 'Role non-admin tidak bisa masuk /admin' },
      { id: '10.3', label: 'Logout menghapus session dan kembali ke login' },
    ],
  },
]

const allItems = sections.flatMap((section) => section.items)

export default function AdminUatChecklistPage() {
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return {}
      return JSON.parse(raw) as Record<string, boolean>
    } catch {
      return {}
    }
  })

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(checked))
  }, [checked])

  const total = allItems.length
  const done = useMemo(() => allItems.filter((item) => checked[item.id]).length, [checked])
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const toggle = (id: string) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const resetAll = () => {
    if (!window.confirm('Reset semua checklist?')) return
    setChecked({})
  }

  return (
    <div style={{ maxWidth: 1080 }}>
      <section className="public-hero">
        <p
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: '#fda4af',
          }}
        >
          Simulation
        </p>
        <h1 style={{ margin: '8px 0 0 0', fontSize: 38, fontWeight: 950, color: '#f8fafc' }}>UAT Checklist</h1>
        <div style={{ marginTop: 10, color: '#cbd5e1', fontWeight: 700 }}>
          Progress: {done}/{total} ({pct}%)
        </div>
      </section>

      <div style={{ marginTop: 16, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ color: '#e2e8f0', fontWeight: 800 }}>Klik checkbox untuk centang item test.</div>
        <button
          type="button"
          onClick={resetAll}
          style={{
            padding: '8px 12px',
            borderRadius: 12,
            border: '1px solid #fca5a5',
            background: '#ffe4e6',
            color: '#be123c',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          Reset
        </button>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {sections.map((section) => (
          <div
            key={section.title}
            style={{
              borderRadius: 16,
              border: '1px solid #cbd5e1',
              background: '#fff',
              padding: 14,
              color: '#0f172a',
            }}
          >
            <div style={{ fontWeight: 950, fontSize: 18, marginBottom: 10 }}>{section.title}</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {section.items.map((item) => (
                <label
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    background: checked[item.id] ? '#ecfdf5' : '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(checked[item.id])}
                    onChange={() => toggle(item.id)}
                    style={{ marginTop: 2 }}
                  />
                  <div style={{ display: 'grid', gap: 2 }}>
                    <div style={{ fontWeight: 900, fontSize: 12, color: '#475569' }}>{item.id}</div>
                    <div style={{ fontWeight: 700 }}>{item.label}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
