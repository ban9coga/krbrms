'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useApiFetch } from '@/src/hooks/useApiFetch'
import type { EventBundleOffer, PublicRacepackItem, RegistrationBundleOption } from '../../../../../lib/eventService'

const panel = 'admin-card grid gap-4 p-5'
const field = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900'
const price = (amount: number) => `Rp ${new Intl.NumberFormat('id-ID').format(amount)}`
const freshId = () => globalThis.crypto?.randomUUID?.() ?? `opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export default function RegistrationOptionsClient({ eventId }: { eventId: string }) {
  const apiFetch = useApiFetch()
  const [bundles, setBundles] = useState<RegistrationBundleOption[]>([])
  const [racepackItems, setRacepackItems] = useState<PublicRacepackItem[]>([])
  const [eventBundleOffer, setEventBundleOffer] = useState<EventBundleOffer | null>(null)
  const [availableEvents, setAvailableEvents] = useState<Array<{ id: string; name: string; event_date: string | null; status: string | null }>>([])
  const [newRacepackName, setNewRacepackName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const response = await apiFetch(`/api/events/${eventId}/registration-options`)
      setBundles(Array.isArray(response.data?.registration_bundles) ? response.data.registration_bundles : [])
      setRacepackItems(Array.isArray(response.data?.public_racepack_items) ? response.data.public_racepack_items : [])
      setEventBundleOffer(response.data?.event_bundle_offer ?? null)
      setAvailableEvents(Array.isArray(response.data?.available_events) ? response.data.available_events : [])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memuat pilihan pendaftaran.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [eventId])

  const updateBundle = (id: string, changes: Partial<RegistrationBundleOption>) =>
    setBundles((current) => current.map((bundle) => bundle.id === id ? { ...bundle, ...changes } : bundle))

  const addBundle = () => setBundles((current) => [...current, {
    id: freshId(), name: '', description: '', price: 0, enabled: true,
  }])

  const addRacepackItem = () => {
    const name = newRacepackName.trim()
    if (!name) return
    setRacepackItems((current) => [...current, { id: freshId(), name, included: true }])
    setNewRacepackName('')
  }

  const createEventBundleOffer = () => setEventBundleOffer({
    id: freshId(),
    name: '',
    paired_event_id: '',
    bundle_base_price_per_rider: 0,
    enabled: false,
  })

  const save = async () => {
    if (bundles.some((bundle) => !bundle.name.trim() || !Number.isSafeInteger(Number(bundle.price)) || Number(bundle.price) < 0)) {
      setMessage('Isi nama dan harga bundling dengan benar. Harga boleh 0.')
      return
    }
    if (eventBundleOffer && (!eventBundleOffer.name.trim() || !eventBundleOffer.paired_event_id || !Number.isSafeInteger(Number(eventBundleOffer.bundle_base_price_per_rider)) || Number(eventBundleOffer.bundle_base_price_per_rider) <= 0)) {
      setMessage('Lengkapi nama paket, event pasangan, dan harga paket per rider.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      await apiFetch(`/api/events/${eventId}/registration-options`, {
        method: 'PATCH',
        body: JSON.stringify({
          registration_bundles: bundles.map((bundle) => ({ ...bundle, name: bundle.name.trim(), price: Number(bundle.price) })),
          public_racepack_items: racepackItems.map((item) => ({ ...item, name: item.name.trim() })),
          event_bundle_offer: eventBundleOffer ? { ...eventBundleOffer, name: eventBundleOffer.name.trim(), bundle_base_price_per_rider: Number(eventBundleOffer.bundle_base_price_per_rider) } : null,
        }),
      })
      setMessage('Pengaturan bundling dan racepack berhasil disimpan.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menyimpan pengaturan.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="admin-compact-page grid max-w-4xl gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="admin-kicker">Pendaftaran event</p>
          <h1 className="admin-heading text-2xl">Bundling & Racepack</h1>
          <p className="admin-muted mt-1 max-w-2xl text-sm">Atur bundling tambahan yang dapat dipilih per rider saat mendaftar dan daftar isi racepack yang ditampilkan ke publik.</p>
        </div>
        <Link href={`/admin/events/${eventId}/settings`} className="admin-outline-button">Event Settings</Link>
      </div>

      {message && <div className="admin-card-muted p-3 text-sm font-bold">{message}</div>}
      {loading ? <div className="admin-card p-5">Memuat pengaturan…</div> : <>
        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="admin-heading text-lg">Pilihan bundling</h2>
              <p className="admin-muted mt-1 text-sm">Biaya bundling ditambahkan per rider di atas biaya daftar dan upclass. Wali dapat memilih satu bundling untuk setiap rider.</p>
            </div>
            <button type="button" onClick={addBundle} className="admin-outline-button">Tambah Bundling</button>
          </div>
          {bundles.length === 0 ? <p className="admin-card-muted p-4 text-sm font-semibold">Belum ada bundling. Pendaftaran tetap memakai biaya daftar dan upclass seperti biasa.</p> : (
            <div className="grid gap-3">
              {bundles.map((bundle) => <article key={bundle.id} className="admin-card-muted grid gap-3 p-4">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_190px_auto]">
                  <label className="grid gap-1 text-xs font-bold">Nama bundling<input className={field} value={bundle.name} onChange={(event) => updateBundle(bundle.id, { name: event.target.value })} placeholder="Contoh: Racepack Premium" maxLength={100} /></label>
                  <label className="grid gap-1 text-xs font-bold">Biaya tambahan / rider<input className={field} type="number" min="0" step="1000" value={bundle.price} onChange={(event) => updateBundle(bundle.id, { price: Number(event.target.value) })} /></label>
                  <label className="flex min-h-10 items-center gap-2 self-end text-sm font-bold"><input type="checkbox" checked={bundle.enabled} onChange={(event) => updateBundle(bundle.id, { enabled: event.target.checked })} />Aktif</label>
                </div>
                <label className="grid gap-1 text-xs font-bold">Keterangan<textarea className={field} value={bundle.description ?? ''} onChange={(event) => updateBundle(bundle.id, { description: event.target.value })} placeholder="Jelaskan isi atau keuntungan paket" maxLength={240} rows={2} /></label>
                <div className="flex items-center justify-between gap-3 text-xs font-semibold"><span>Tambahan saat dipilih: {price(Number(bundle.price) || 0)} per rider</span><button type="button" onClick={() => setBundles((current) => current.filter((item) => item.id !== bundle.id))} className="admin-danger-button">Hapus</button></div>
              </article>)}
            </div>
          )}
        </section>

        <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="admin-heading text-lg">Paket event pasangan</h2>
              <p className="admin-muted mt-1 max-w-2xl text-sm">Wali mendaftar dari event ini, lalu dapat menambahkan satu event pasangan. Harga paket menggantikan biaya daftar dasar kedua event; biaya upclass dan bundling rider tetap mengikuti pengaturan masing-masing event.</p>
            </div>
            {!eventBundleOffer && <button type="button" onClick={createEventBundleOffer} disabled={availableEvents.length === 0} className="admin-outline-button">Buat Paket Event</button>}
          </div>
          {!eventBundleOffer ? (
            <p className="admin-card-muted p-4 text-sm font-semibold">Belum ada paket event. Event ini tetap bisa didaftarkan sendiri seperti biasa.</p>
          ) : (
            <div className="admin-card-muted grid gap-3 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs font-bold">Nama paket<input className={field} value={eventBundleOffer.name} onChange={(event) => setEventBundleOffer((current) => current ? { ...current, name: event.target.value } : current)} placeholder="Contoh: Paket Race Weekend" maxLength={100} /></label>
                <label className="grid gap-1 text-xs font-bold">Event pasangan<select className={field} value={eventBundleOffer.paired_event_id} onChange={(event) => setEventBundleOffer((current) => current ? { ...current, paired_event_id: event.target.value } : current)}>
                  <option value="">Pilih event publik</option>
                  {availableEvents.map((event) => <option key={event.id} value={event.id}>{event.name}{event.event_date ? ` — ${event.event_date}` : ''}</option>)}
                </select></label>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                <label className="grid gap-1 text-xs font-bold">Harga dasar paket / rider<input className={field} type="number" min="1" step="1000" value={eventBundleOffer.bundle_base_price_per_rider} onChange={(event) => setEventBundleOffer((current) => current ? { ...current, bundle_base_price_per_rider: Number(event.target.value) } : current)} /></label>
                <label className="flex min-h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" checked={eventBundleOffer.enabled} onChange={(event) => setEventBundleOffer((current) => current ? { ...current, enabled: event.target.checked } : current)} />Aktif</label>
                <button type="button" onClick={() => setEventBundleOffer(null)} className="admin-danger-button">Hapus Paket</button>
              </div>
              <p className="text-xs font-semibold text-slate-600">Harga ini untuk biaya daftar dasar kedua event per rider. Upclass dan pilihan bundling tambahan tetap ditambahkan dari masing-masing event.</p>
            </div>
          )}
        </section>

        <section className={panel}>
          <div>
            <h2 className="admin-heading text-lg">Isi racepack yang ditampilkan</h2>
            <p className="admin-muted mt-1 text-sm">Tambahkan hanya item yang sudah dipastikan panitia. Centang item agar muncul di informasi publik event dan halaman pendaftaran.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input className={field} value={newRacepackName} onChange={(event) => setNewRacepackName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addRacepackItem() } }} placeholder="Nama item racepack" maxLength={120} />
            <button type="button" onClick={addRacepackItem} className="admin-outline-button">Tambah Item</button>
          </div>
          {racepackItems.length > 0 && <div className="grid gap-2">
            {racepackItems.map((item) => <div key={item.id} className="admin-card-muted flex flex-wrap items-center gap-3 p-3">
              <input aria-label={`Tampilkan ${item.name}`} type="checkbox" checked={item.included} onChange={(event) => setRacepackItems((current) => current.map((row) => row.id === item.id ? { ...row, included: event.target.checked } : row))} />
              <input className={`${field} min-w-[180px] flex-1`} value={item.name} onChange={(event) => setRacepackItems((current) => current.map((row) => row.id === item.id ? { ...row, name: event.target.value } : row))} maxLength={120} />
              <button type="button" onClick={() => setRacepackItems((current) => current.filter((row) => row.id !== item.id))} className="admin-danger-button">Hapus</button>
            </div>)}
          </div>}
        </section>
      </>}

      <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur">
        <span className="text-xs font-semibold text-slate-600">Paket yang sudah dipilih rider lama tetap menyimpan harga saat pendaftaran.</span>
        <button type="button" disabled={loading || saving} onClick={() => void save()} className="admin-primary-button">{saving ? 'Menyimpan…' : 'Simpan Pengaturan'}</button>
      </div>
    </main>
  )
}
