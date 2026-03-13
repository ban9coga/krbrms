'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import PublicTopbar from '../../components/PublicTopbar'
import { supabase } from '../../lib/supabaseClient'

type EventItem = {
  id: string
  name: string
  location: string | null
  event_date: string
  status: 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
}

export default function McHomePage() {
  const router = useRouter()
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Request failed')
    return json
  }

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const json = await apiFetch('/api/internal/mc/events')
      setEvents((json.data ?? []) as EventItem[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat event MC')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const liveEvents = useMemo(() => events.filter((event) => event.status === 'LIVE'), [events])

  useEffect(() => {
    if (liveEvents.length === 1) {
      router.replace(`/mc/${liveEvents[0].id}`)
    }
  }, [liveEvents, router])

  return (
    <div className="public-page">
      <PublicTopbar />
      <main className="public-main">
        <section className="public-hero">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-300">MC Control</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-4xl">Pilih Event MC</h1>
          <p className="mt-2 text-sm font-semibold text-slate-300">
            Jika hanya ada satu event LIVE, halaman ini akan redirect otomatis.
          </p>
        </section>

        <section className="public-panel-light">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-xl font-black tracking-tight text-slate-900">Event List</h2>
            <button
              type="button"
              onClick={load}
              className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-700 transition-colors hover:bg-slate-200"
            >
              Refresh
            </button>
          </div>

          {loading && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-600">
              Loading...
            </div>
          )}

          {!loading && events.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-600">
              Belum ada event LIVE/UPCOMING untuk MC.
            </div>
          )}

          {!loading && events.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {events.map((event) => (
                <div key={event.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-lg font-black tracking-tight text-slate-900">{event.name}</div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.1em] ${
                        event.status === 'LIVE'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {event.status}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-slate-600">
                    {event.location || '-'} | {event.event_date}
                  </div>
                  <div className="mt-3">
                    <Link
                      href={`/mc/${event.id}`}
                      className="inline-flex items-center justify-center rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.12em] text-white transition-colors hover:bg-amber-300"
                    >
                      Buka MC Live
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-700">{error}</div>}
        </section>
      </main>
    </div>
  )
}

