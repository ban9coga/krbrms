'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import LogoutButton from '@/src/components/LogoutButton'
import { supabase } from '@/src/lib/supabaseClient'

type EventItem = {
  id: string
  name: string
  location: string | null
  event_date: string
  status: string
  is_public: boolean
}

const dateLabel = (value: string) => new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date(value))

export default function RcAdminHome() {
  const router = useRouter()
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [eventDate, setEventDate] = useState('')

  const getToken = async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Sesi login berakhir. Silakan login kembali.')
      const response = await fetch('/api/rc-admin/events', { headers: { Authorization: `Bearer ${token}` } })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? 'Gagal memuat event.')
      setEvents(json.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat event.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadEvents() }, [loadEvents])

  const createEvent = async (formEvent: React.FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault()
    setCreating(true)
    setError('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Sesi login berakhir. Silakan login kembali.')
      const response = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: name.trim(), location: location.trim() || null, event_date: eventDate,
          status: 'UPCOMING', is_public: true, event_scope: 'PUBLIC', draw_mode: 'internal_live_draw',
        }),
      })
      const json = await response.json()
      if (!response.ok) throw new Error(json.error ?? 'Event gagal dibuat.')
      router.push(`/rc-admin/events/${json.data.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Event gagal dibuat.')
    } finally {
      setCreating(false)
    }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    document.cookie = 'sb-access-token=; Path=/; Max-Age=0; SameSite=Lax'
    window.location.href = '/login'
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs font-black uppercase text-amber-700">RacePushbike</p>
            <h1 className="text-lg font-extrabold">Workspace Komunitas</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 sm:inline">RC Admin</span>
            <LogoutButton onClick={logout} />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-8">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-black uppercase text-slate-500">Event komunitas Anda</p>
            <h2 className="mt-1 text-2xl font-black">Kelola event</h2>
            <p className="mt-1 max-w-xl text-sm text-slate-600">Buat event dan pantau persiapannya dari satu tempat.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/guides/PANDUAN_RC_ADMIN.pdf" download className="inline-flex min-h-10 items-center rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:border-amber-500 hover:bg-amber-50">
              Unduh panduan PDF
            </a>
            <button type="button" onClick={() => setShowForm((value) => !value)} className="min-h-10 rounded-md bg-slate-950 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800">
              {showForm ? 'Tutup form' : 'Buat event'}
            </button>
          </div>
        </section>

        {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}

        {showForm && (
          <form onSubmit={createEvent} className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-2 sm:p-5">
            <h3 className="text-base font-extrabold sm:col-span-2">Informasi event</h3>
            <label className="grid gap-1.5 text-sm font-bold sm:col-span-2">
              Nama event
              <input required value={name} onChange={(event) => setName(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2.5 font-medium outline-none focus:border-amber-500" placeholder="Contoh: Kejuaraan Pushbike Kota" />
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              Tanggal
              <input required type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2.5 font-medium outline-none focus:border-amber-500" />
            </label>
            <label className="grid gap-1.5 text-sm font-bold">
              Lokasi
              <input value={location} onChange={(event) => setLocation(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2.5 font-medium outline-none focus:border-amber-500" placeholder="Kota atau venue" />
            </label>
            <button disabled={creating} className="rounded-md bg-amber-400 px-4 py-2.5 text-sm font-extrabold text-slate-950 disabled:opacity-60 sm:col-span-2">
              {creating ? 'Membuat event...' : 'Buat dan lanjutkan'}
            </button>
          </form>
        )}

        <section className="grid gap-3">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold">Daftar event</h3>
            {!loading && <span className="text-xs font-bold text-slate-500">{events.length} event</span>}
          </div>
          {loading ? (
            <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500">Memuat event...</div>
          ) : events.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {events.map((event) => (
                <article key={event.id} className="flex min-h-36 flex-col justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:p-5">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{event.status}</span>
                      <span className="text-xs font-semibold text-slate-500">{event.is_public ? 'Publik' : 'Internal'}</span>
                    </div>
                    <h4 className="mt-3 text-lg font-extrabold">{event.name}</h4>
                    <p className="mt-1 text-sm text-slate-600">{dateLabel(event.event_date)}{event.location ? ` - ${event.location}` : ''}</p>
                  </div>
                  <Link href={`/rc-admin/events/${event.id}`} className="inline-flex w-fit items-center rounded-md border border-slate-300 px-3 py-2 text-sm font-bold hover:border-amber-500 hover:bg-amber-50">
                    Lihat kesiapan event
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
              <h4 className="font-extrabold">Belum ada event</h4>
              <p className="mt-1 text-sm text-slate-600">Buat event pertama komunitas Anda untuk mulai menyiapkan race.</p>
              <button type="button" onClick={() => setShowForm(true)} className="mt-4 rounded-md bg-amber-400 px-4 py-2 text-sm font-extrabold">Buat event</button>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
