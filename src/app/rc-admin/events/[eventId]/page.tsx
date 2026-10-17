'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '@/src/lib/supabaseClient'

type ChecklistItem = {
  key: string
  step: number
  label: string
  description: string
  detail: string
  status: 'done' | 'warning' | 'todo'
  required: boolean
}

type EventInfo = { id: string; name: string; location: string | null; event_date: string; status: string }

const stateLabel = { done: 'Selesai', warning: 'Perlu dicek', todo: 'Belum mulai' }
const stateStyle = {
  done: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  todo: 'border-slate-200 bg-white text-slate-600',
}

export default function RcAdminEventPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const [event, setEvent] = useState<EventInfo | null>(null)
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Sesi login berakhir. Silakan login kembali.')
      const response = await fetch(`/api/rc-admin/events/${eventId}`, { headers: { Authorization: `Bearer ${token}` } })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? 'Gagal memuat kesiapan event.')
      setEvent(json.data.event)
      setItems(json.data.checklist ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat kesiapan event.')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => { void load() }, [load])

  const required = items.filter((item) => item.required)
  const complete = required.filter((item) => item.status === 'done').length
  const percent = required.length ? Math.round((complete / required.length) * 100) : 0

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/rc-admin" className="text-sm font-extrabold text-slate-800 hover:text-amber-800">&larr; Event komunitas</Link>
          <div className="flex items-center gap-2">
            <a href="/guides/PANDUAN_RC_ADMIN.pdf" download className="rounded-md border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:border-amber-500 hover:bg-amber-50">Unduh panduan</a>
            <span className="hidden rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 sm:inline">RC Admin</span>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl gap-5 px-4 py-6 sm:px-6 sm:py-8">
        {loading ? (
          <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500">Memuat kesiapan event...</div>
        ) : error ? (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 font-semibold text-rose-800">{error}</div>
        ) : event ? (
          <>
            <section className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
              <p className="text-xs font-black uppercase text-amber-800">Ringkasan event</p>
              <h1 className="mt-1 text-2xl font-black">{event.name}</h1>
              <p className="mt-1 text-sm text-slate-600">{new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(new Date(event.event_date))}{event.location ? ` - ${event.location}` : ''}</p>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-bold">Persiapan wajib</span>
                <span className="font-black">{complete}/{required.length} - {percent}%</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percent}%` }} />
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-3">
              <Link href={`/rc-admin/events/${eventId}/categories`} className="rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-amber-400 hover:bg-amber-50">
                <span className="text-xs font-black uppercase text-amber-800">Setup 1</span>
                <span className="mt-1 block font-extrabold">Kategori event</span>
                <span className="mt-1 block text-sm text-slate-600">Atur kategori lomba dan sinkronkan dari rider.</span>
              </Link>
              <Link href={`/rc-admin/events/${eventId}/rules`} className="rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-amber-400 hover:bg-amber-50">
                <span className="text-xs font-black uppercase text-amber-800">Setup 2</span>
                <span className="mt-1 block font-extrabold">Aturan race</span>
                <span className="mt-1 block text-sm text-slate-600">Atur multi-stage, kapasitas race, dan poin DNS/DNF.</span>
              </Link>
              <Link href={`/rc-admin/events/${eventId}/registrations`} className="rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-amber-400 hover:bg-amber-50">
                <span className="text-xs font-black uppercase text-amber-800">Setup 3</span>
                <span className="mt-1 block font-extrabold">Pendaftaran rider</span>
                <span className="mt-1 block text-sm text-slate-600">Review data, dokumen, pembayaran, dan approve rider.</span>
              </Link>
            </section>

            <section className="grid gap-3">
              <h2 className="font-extrabold">Tahapan persiapan</h2>
              {items.map((item) => (
                <article key={item.key} className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:p-4">
                  <span className={`grid h-9 w-9 place-items-center rounded-full text-sm font-black ${item.status === 'done' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                    {item.status === 'done' ? 'OK' : item.step}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-extrabold">{item.label}{!item.required ? <span className="ml-2 text-xs font-semibold text-slate-500">Opsional</span> : null}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{item.description}</span>
                    <span className="mt-1 block text-sm text-slate-700">{item.detail}</span>
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${stateStyle[item.status]}`}>{stateLabel[item.status]}</span>
                </article>
              ))}
            </section>
          </>
        ) : null}
      </div>
    </main>
  )
}
