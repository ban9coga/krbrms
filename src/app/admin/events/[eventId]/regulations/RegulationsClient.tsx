'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { appAlert } from '@/src/lib/appDialog'
import { useApiFetch } from '@/src/hooks/useApiFetch'
import type { PublicEventRegulation } from '@/src/lib/eventService'

type Category = { id: string; label: string; enabled: boolean }
type RegulationDraft = PublicEventRegulation
const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-200'

const STAGES: Array<{ value: NonNullable<PublicEventRegulation['stage']>; label: string }> = [
  { value: 'QUALIFICATION', label: 'Kualifikasi' },
  { value: 'QUARTER_FINAL', label: 'Quarter Final' },
  { value: 'REPECHAGE', label: 'Repechage' },
  { value: 'SEMI_FINAL', label: 'Semi Final' },
  { value: 'FINAL', label: 'Final' },
]

const newRegulation = (sortOrder: number): RegulationDraft => ({
  id: crypto.randomUUID(), scope: 'EVENT', category_id: null, stage: null,
  title: '', content: '', document_url: '', enabled: true, sort_order: sortOrder,
})

export default function RegulationsClient({ eventId }: { eventId: string }) {
  const apiFetch = useApiFetch()
  const [rows, setRows] = useState<RegulationDraft[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch(`/api/events/${eventId}/regulations`)
      setRows((response.data?.regulations ?? []) as RegulationDraft[])
      setCategories((response.data?.categories ?? []) as Category[])
    } catch (error) {
      appAlert(error instanceof Error ? error.message : 'Gagal memuat regulasi event.')
    } finally {
      setLoading(false)
    }
  }, [apiFetch, eventId])

  useEffect(() => { void load() }, [load])

  const update = (id: string, patch: Partial<RegulationDraft>) =>
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row))

  const changeScope = (row: RegulationDraft, scope: RegulationDraft['scope']) => {
    update(row.id, {
      scope,
      category_id: scope === 'EVENT' ? null : row.category_id || categories[0]?.id || null,
      stage: scope === 'STAGE' ? row.stage || 'QUALIFICATION' : null,
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      await apiFetch(`/api/events/${eventId}/regulations`, {
        method: 'PATCH',
        body: JSON.stringify({ regulations: rows.map((row, index) => ({ ...row, sort_order: index })) }),
      })
      appAlert('Regulasi event berhasil disimpan.')
    } catch (error) {
      appAlert(error instanceof Error ? error.message : 'Gagal menyimpan regulasi event.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-5xl gap-5 pb-10">
      <section className="admin-card grid gap-3 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="admin-kicker">Informasi publik</p>
            <h1 className="admin-heading mt-1 text-2xl">Regulasi Event</h1>
            <p className="admin-muted mt-2 max-w-2xl text-sm">Tulis ketentuan umum event, aturan kategori, dan penjelasan setiap stage. Hanya bagian aktif yang tampil ke publik.</p>
          </div>
          <Link href={`/event/${eventId}/regulations`} target="_blank" className="admin-outline-button">Lihat halaman publik</Link>
        </div>
      </section>

      {loading ? <div className="admin-card p-5">Memuat regulasi...</div> : rows.map((row, index) => (
        <section key={row.id} className="admin-card grid gap-3 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="admin-heading text-base">Regulasi {index + 1}</h2>
            <button type="button" className="admin-danger-button" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}>Hapus</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-bold text-slate-700">Ditampilkan untuk
              <select className={inputClass} value={row.scope} onChange={(event) => changeScope(row, event.target.value as RegulationDraft['scope'])}>
                <option value="EVENT">Seluruh event</option>
                <option value="CATEGORY">Kategori tertentu</option>
                <option value="STAGE">Stage dalam kategori</option>
              </select>
            </label>
            {row.scope !== 'EVENT' && <label className="grid gap-1 text-sm font-bold text-slate-700">Kategori
              <select className={inputClass} value={row.category_id ?? ''} onChange={(event) => update(row.id, { category_id: event.target.value || null })}>
                <option value="">Pilih kategori</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.label}{category.enabled ? '' : ' (nonaktif)'}</option>)}
              </select>
            </label>}
            {row.scope === 'STAGE' && <label className="grid gap-1 text-sm font-bold text-slate-700">Stage
              <select className={inputClass} value={row.stage ?? 'QUALIFICATION'} onChange={(event) => update(row.id, { stage: event.target.value as RegulationDraft['stage'] })}>
                {STAGES.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
              </select>
            </label>}
            <label className="grid gap-1 text-sm font-bold text-slate-700 sm:col-span-2">Judul
              <input className={inputClass} maxLength={120} value={row.title} onChange={(event) => update(row.id, { title: event.target.value })} placeholder="Contoh: Ketentuan peserta" />
            </label>
            <label className="grid gap-1 text-sm font-bold text-slate-700 sm:col-span-2">Isi regulasi
              <textarea className={`${inputClass} min-h-32`} maxLength={6000} value={row.content} onChange={(event) => update(row.id, { content: event.target.value })} placeholder="Tuliskan aturan dengan jelas. Baris baru akan dipertahankan di halaman publik." />
            </label>
            <label className="grid gap-1 text-sm font-bold text-slate-700 sm:col-span-2">Tautan dokumen (opsional)
              <input className={inputClass} type="url" value={row.document_url ?? ''} onChange={(event) => update(row.id, { document_url: event.target.value })} placeholder="https://..." />
            </label>
          </div>
          <label className="flex min-h-11 items-center gap-2 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={row.enabled} onChange={(event) => update(row.id, { enabled: event.target.checked })} />
            Tampilkan kepada publik
          </label>
        </section>
      ))}

      {!loading && rows.length === 0 && <section className="admin-card p-5 text-sm text-slate-600">Belum ada regulasi. Tambahkan aturan umum, aturan kategori, atau penjelasan stage.</section>}

      <div className="flex flex-wrap gap-3">
        <button type="button" className="admin-outline-button" onClick={() => setRows((current) => [...current, newRegulation(current.length)])}>Tambah regulasi</button>
        <button type="button" className="admin-primary-button" disabled={loading || saving} onClick={() => void save()}>{saving ? 'Menyimpan...' : 'Simpan Regulasi'}</button>
      </div>
    </main>
  )
}
