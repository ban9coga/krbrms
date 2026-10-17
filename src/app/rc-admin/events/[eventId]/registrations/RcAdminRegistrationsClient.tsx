'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/src/lib/supabaseClient'

type RegistrationItem = {
  id: string
  rider_name: string
  rider_nickname?: string | null
  date_of_birth: string
  gender: 'BOY' | 'GIRL'
  club: string | null
  primary_category_id: string | null
  requested_plate_number: string | null
  requested_plate_suffix: string | null
  photo_url?: string | null
}
type Registration = {
  id: string
  registration_code?: string | null
  community_name: string | null
  contact_name: string
  contact_phone: string
  contact_email: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  total_amount: number
  created_at: string
  registration_items: RegistrationItem[]
  registration_payments: Array<{ id: string; amount: number; bank_name: string | null; account_name: string | null; proof_url: string; status: 'PENDING' | 'APPROVED' | 'REJECTED' }>
  registration_documents: Array<{ id: string; registration_item_id: string | null; document_type: string; file_url: string }>
}
type Category = { id: string; label: string }
type Status = Registration['status']

const statusLabels: Record<Status, string> = { PENDING: 'Menunggu', APPROVED: 'Disetujui', REJECTED: 'Ditolak' }
const statusClasses: Record<Status, string> = {
  PENDING: 'border-amber-200 bg-amber-50 text-amber-900',
  APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  REJECTED: 'border-rose-200 bg-rose-50 text-rose-800',
}

export default function RcAdminRegistrationsClient() {
  const { eventId } = useParams<{ eventId: string }>()
  const [rows, setRows] = useState<Registration[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [eventName, setEventName] = useState('')
  const [counts, setCounts] = useState<Record<Status, number>>({ PENDING: 0, APPROVED: 0, REJECTED: 0 })
  const [status, setStatus] = useState<Status>('PENDING')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [photoRequired, setPhotoRequired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({})

  const token = async () => {
    const { data } = await supabase.auth.getSession()
    const value = data.session?.access_token
    if (!value) throw new Error('Sesi login berakhir. Silakan login kembali.')
    return value
  }

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const accessToken = await token()
      const headers = { Authorization: `Bearer ${accessToken}` }
      const [listResponse, categoryResponse, settingsResponse, eventResponse, ...countResponses] = await Promise.all([
        fetch(`/api/admin/events/${eventId}/registrations?status=${status}&page=${page}&page_size=10`, { headers }),
        fetch(`/api/events/${eventId}/categories`),
        fetch(`/api/events/${eventId}/settings`),
        fetch(`/api/rc-admin/events/${eventId}`, { headers }),
        ...(['PENDING', 'APPROVED', 'REJECTED'] as Status[]).map((value) => fetch(`/api/admin/events/${eventId}/registrations?status=${value}&page=1&page_size=1`, { headers })),
      ])
      const [listJson, categoryJson, settingsJson, eventJson, ...countJson] = await Promise.all([
        listResponse.json(), categoryResponse.json(), settingsResponse.json(), eventResponse.json(), ...countResponses.map((response) => response.json()),
      ])
      if (!listResponse.ok) throw new Error(listJson.error ?? 'Gagal memuat pendaftaran.')
      if (!categoryResponse.ok) throw new Error(categoryJson.error ?? 'Gagal memuat kategori event.')
      if (!settingsResponse.ok) throw new Error(settingsJson.error ?? 'Gagal memuat pengaturan event.')
      if (!eventResponse.ok) throw new Error(eventJson.error ?? 'Gagal memuat event.')
      setRows(listJson.data ?? [])
      setTotalPages(listJson.meta?.total_pages ?? 1)
      setCategories(categoryJson.data ?? [])
      setPhotoRequired(settingsJson.data?.business_settings?.registration_rider_photo_enabled === true)
      setEventName(eventJson.data?.event?.name ?? '')
      setCounts({ PENDING: countJson[0]?.meta?.total ?? 0, APPROVED: countJson[1]?.meta?.total ?? 0, REJECTED: countJson[2]?.meta?.total ?? 0 })
    } catch (err) { setError(err instanceof Error ? err.message : 'Gagal memuat pendaftaran.') }
    finally { setLoading(false) }
  }, [eventId, page, status])

  useEffect(() => { void load() }, [load])

  const resolveFile = async (path: string) => {
    if (/^https?:\/\//i.test(path)) return path
    const accessToken = await token()
    const response = await fetch('/api/admin/storage/signed-url', {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, path }),
    })
    const json = await response.json()
    if (!response.ok) throw new Error(json.error ?? 'File tidak dapat dibuka.')
    return json.data?.signedUrl as string | undefined
  }

  const openFile = async (path: string) => {
    try {
      const url = await resolveFile(path)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      else throw new Error('Link file tidak tersedia.')
    } catch (err) { setError(err instanceof Error ? err.message : 'File tidak dapat dibuka.') }
  }

  const updatePayment = async (registration: Registration, paymentId: string) => {
    setSaving(`payment:${paymentId}`); setError(''); setNotice('')
    try {
      const accessToken = await token()
      const response = await fetch(`/api/admin/events/${eventId}/registrations/${registration.id}/payments/${paymentId}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'APPROVED' }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? 'Pembayaran gagal diperbarui.')
      setNotice('Pembayaran ditandai disetujui.'); await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Pembayaran gagal diperbarui.') }
    finally { setSaving('') }
  }

  const decideRegistration = async (registration: Registration, decision: 'APPROVED' | 'REJECTED') => {
    const note = rejectNotes[registration.id]?.trim() ?? ''
    if (decision === 'REJECTED' && !note) { setError('Isi alasan penolakan terlebih dahulu.'); return }
    if (decision === 'APPROVED') {
      const docsByItem = new Map<string, number>()
      for (const doc of registration.registration_documents ?? []) if (doc.registration_item_id) docsByItem.set(doc.registration_item_id, (docsByItem.get(doc.registration_item_id) ?? 0) + 1)
      const missing = registration.registration_items.find((item) => !item.club?.trim() || !item.primary_category_id || !item.requested_plate_number || !docsByItem.get(item.id) || (photoRequired && !item.photo_url))
      if (missing) { setError(`Data ${missing.rider_name} belum lengkap. Periksa komunitas, kategori, plate, dokumen${photoRequired ? ', dan foto' : ''}.`); return }
      if (!registration.registration_payments.some((payment) => payment.status === 'APPROVED')) { setError('Setujui minimal satu pembayaran sebelum approve pendaftaran.'); return }
    }
    setSaving(`registration:${registration.id}`); setError(''); setNotice('')
    try {
      const accessToken = await token()
      const body = decision === 'APPROVED'
        ? { status: decision, items: registration.registration_items.map((item) => ({ id: item.id, plate_number: item.requested_plate_number, plate_suffix: item.requested_plate_suffix })) }
        : { status: decision, notes: note }
      const response = await fetch(`/api/admin/events/${eventId}/registrations/${registration.id}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? 'Status pendaftaran gagal diperbarui.')
      setNotice(decision === 'APPROVED' ? 'Pendaftaran disetujui dan rider masuk ke roster event.' : 'Pendaftaran ditolak.')
      setRejectNotes((current) => ({ ...current, [registration.id]: '' }))
      await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Status pendaftaran gagal diperbarui.') }
    finally { setSaving('') }
  }

  const categoryName = (id: string | null) => categories.find((category) => category.id === id)?.label ?? 'Kategori belum dipilih'
  const formatDate = (value: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  const formatMoney = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value || 0)

  return <main className="min-h-screen bg-slate-50 text-slate-950">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0"><p className="text-xs font-black uppercase text-amber-800">RC Admin</p><h1 className="truncate text-base font-extrabold">{eventName || 'Workspace Komunitas'}</h1></div>
        <div className="flex items-center gap-2"><a href="/guides/PANDUAN_RC_ADMIN.pdf" download className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold hover:border-amber-500 hover:bg-amber-50">Panduan PDF</a><Link href={`/rc-admin/events/${eventId}`} className="rounded-md bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">Kembali ke event</Link></div>
      </div>
    </header>
    <div className="mx-auto grid max-w-6xl gap-5 px-4 py-5 sm:px-6 sm:py-7">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-xs font-black uppercase text-amber-800">Setup event · tahap 3</p><h2 className="mt-1 text-2xl font-black">Pendaftaran rider</h2><p className="mt-1 text-sm text-slate-600">Tinjau kelengkapan pendaftaran sebelum rider disahkan masuk ke roster event.</p></div>
        <button type="button" onClick={() => void load()} disabled={loading} className="min-h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold hover:border-amber-500 disabled:opacity-50">{loading ? 'Memuat...' : 'Refresh'}</button>
      </section>

      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        {(['PENDING', 'APPROVED', 'REJECTED'] as Status[]).map((value) => <button key={value} type="button" onClick={() => { setStatus(value); setPage(1) }} className={`min-h-20 rounded-lg border p-3 text-left transition-colors ${status === value ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}><span className="block text-xs font-bold text-slate-600">{statusLabels[value]}</span><span className="mt-1 block text-2xl font-black">{counts[value]}</span></button>)}
      </section>

      {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{notice}</p>}

      <section className="grid gap-3">
        {loading ? <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500">Memuat pendaftaran...</div> : rows.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center"><h3 className="font-extrabold">Tidak ada pendaftaran {statusLabels[status].toLowerCase()}</h3><p className="mt-1 text-sm text-slate-600">Pendaftaran dari peserta akan tampil di daftar ini.</p></div> : rows.map((registration) => {
          const itemDocs = registration.registration_documents ?? []
          const approvedPayment = registration.registration_payments?.some((payment) => payment.status === 'APPROVED')
          const ready = registration.registration_items.length > 0 && registration.registration_items.every((item) => item.club?.trim() && item.primary_category_id && item.requested_plate_number && itemDocs.some((doc) => doc.registration_item_id === item.id) && (!photoRequired || item.photo_url)) && approvedPayment
          return <article key={registration.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4 sm:px-5">
              <div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusClasses[registration.status]}`}>{statusLabels[registration.status]}</span><span className="text-xs font-bold text-slate-500">{registration.registration_code || 'Tanpa kode'}</span></div><h3 className="mt-2 text-lg font-extrabold">{registration.community_name || 'Pendaftaran rider'}</h3><p className="mt-1 text-sm text-slate-700">{registration.contact_name} · <a className="font-semibold underline decoration-slate-300 underline-offset-2" href={`https://wa.me/${registration.contact_phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">{registration.contact_phone}</a>{registration.contact_email ? ` · ${registration.contact_email}` : ''}</p></div>
              <div className="text-left sm:text-right"><p className="text-xs text-slate-500">{formatDate(registration.created_at)}</p><p className="mt-1 text-sm font-extrabold">{formatMoney(registration.total_amount)}</p></div>
            </div>
            <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(250px,.75fr)]">
              <div className="grid gap-3">
                <h4 className="text-xs font-black uppercase text-slate-500">Rider ({registration.registration_items.length})</h4>
                {registration.registration_items.map((item) => {
                  const docs = itemDocs.filter((doc) => doc.registration_item_id === item.id)
                  return <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-extrabold">{item.rider_name}{item.rider_nickname ? <span className="ml-2 text-sm font-semibold text-slate-600">“{item.rider_nickname}”</span> : null}</p><p className="mt-1 text-xs text-slate-600">Lahir {item.date_of_birth} · {item.gender === 'BOY' ? 'Boys' : 'Girls'} · {item.club || 'Komunitas belum diisi'}</p></div><span className="rounded bg-white px-2 py-1 text-xs font-extrabold">Plate {item.requested_plate_number || '-'}{item.requested_plate_suffix || ''}</span></div>
                    <p className="mt-2 text-xs font-semibold text-slate-600">{categoryName(item.primary_category_id)} · Dokumen {docs.length ? `${docs.length} file` : 'belum ada'}{photoRequired ? ` · Foto ${item.photo_url ? 'ada' : 'belum ada'}` : ''}</p>
                    {docs.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{docs.map((doc) => <button key={doc.id} type="button" onClick={() => void openFile(doc.file_url)} className="rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold hover:border-amber-500">Buka {doc.document_type}</button>)}</div>}
                  </div>
                })}
              </div>
              <div className="grid content-start gap-3">
                <h4 className="text-xs font-black uppercase text-slate-500">Pembayaran</h4>
                {(registration.registration_payments ?? []).length === 0 ? <p className="rounded-md border border-slate-200 p-3 text-sm text-slate-600">Belum ada pembayaran.</p> : registration.registration_payments.map((payment) => <div key={payment.id} className="rounded-md border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><span className="font-extrabold">{formatMoney(payment.amount)}</span><span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${statusClasses[payment.status]}`}>{statusLabels[payment.status]}</span></div><p className="mt-1 text-xs text-slate-600">{payment.bank_name || 'Transfer'}{payment.account_name ? ` · ${payment.account_name}` : ''}</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => void openFile(payment.proof_url)} className="rounded border border-slate-300 px-2.5 py-1.5 text-xs font-bold hover:border-amber-500">Lihat bukti</button>{registration.status === 'PENDING' && payment.status === 'PENDING' && <button type="button" onClick={() => void updatePayment(registration, payment.id)} disabled={saving === `payment:${payment.id}`} className="rounded bg-emerald-700 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{saving === `payment:${payment.id}` ? 'Menyimpan...' : 'Setujui pembayaran'}</button>}</div></div>)}
                {registration.status === 'PENDING' && <div className="grid gap-2 border-t border-slate-200 pt-3"><p className={`text-xs font-bold ${ready ? 'text-emerald-800' : 'text-amber-800'}`}>{ready ? 'Kelengkapan minimum terpenuhi.' : 'Lengkapi data rider, dokumen, plate, dan setujui pembayaran sebelum approve.'}</p><button type="button" onClick={() => void decideRegistration(registration, 'APPROVED')} disabled={!ready || Boolean(saving)} className="min-h-10 rounded-md bg-emerald-700 px-3 text-sm font-extrabold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40">{saving === `registration:${registration.id}` ? 'Memproses...' : 'Approve pendaftaran'}</button><textarea value={rejectNotes[registration.id] ?? ''} onChange={(event) => setRejectNotes((current) => ({ ...current, [registration.id]: event.target.value }))} rows={2} className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-rose-400" placeholder="Alasan penolakan (wajib jika reject)"/><button type="button" onClick={() => void decideRegistration(registration, 'REJECTED')} disabled={Boolean(saving)} className="min-h-10 rounded-md border border-rose-300 bg-white px-3 text-sm font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-50">Tolak pendaftaran</button></div>}
              </div>
            </div>
          </article>
        })}
        {!loading && rows.length > 0 && <div className="flex items-center justify-between"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold disabled:opacity-40">Sebelumnya</button><span className="text-xs font-bold text-slate-600">Halaman {page} dari {totalPages}</span><button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-bold disabled:opacity-40">Berikutnya</button></div>}
      </section>
    </div>
  </main>
}
