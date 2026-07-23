'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CheckerTopbar from '../../components/CheckerTopbar'
import { supabase } from '../../lib/supabaseClient'

type EventRow = {
  id: string
  name: string
  status: 'UPCOMING' | 'READY' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
  event_date: string
}

type QueueMoto = {
  moto_id: string
  moto_name: string
  moto_order: number
  global_order: number
  status: 'UPCOMING' | 'READY' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
  category_label: string
  rows: Array<{
    rider_id: string
    gate: number | null
    name: string
    no_plate: string
    club: string
  }>
}

const statusBadgeClasses = (status: QueueMoto['status']) => {
  if (status === 'LIVE') return 'border-emerald-300 bg-emerald-100 text-emerald-800'
  if (status === 'READY') return 'border-lime-300 bg-lime-100 text-lime-800'
  if (status === 'UPCOMING') return 'border-amber-300 bg-amber-100 text-amber-800'
  return 'border-slate-300 bg-slate-100 text-slate-700'
}

const queueSlotMeta = (index: number) => {
  if (index === 0) {
    return {
      label: 'Current Global Moto',
      chipClass: 'border-emerald-300 bg-emerald-100 text-emerald-800',
      panelClass: 'border-emerald-200 bg-emerald-50/70',
      accentClass: 'border-l-emerald-500',
    }
  }
  if (index === 1) {
    return {
      label: 'Next Global Moto',
      chipClass: 'border-amber-300 bg-amber-100 text-amber-800',
      panelClass: 'border-amber-200 bg-amber-50/80',
      accentClass: 'border-l-amber-500',
    }
  }
  return {
    label: 'On Deck',
    chipClass: 'border-sky-300 bg-sky-100 text-sky-800',
    panelClass: 'border-sky-200 bg-sky-50/80',
    accentClass: 'border-l-sky-500',
  }
}

export default function RaceControlPage() {
  const [events, setEvents] = useState<EventRow[]>([])
  const [eventId, setEventId] = useState('')
  const [loading, setLoading] = useState(false)
  const [queue, setQueue] = useState<QueueMoto[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [highVisibility, setHighVisibility] = useState(false)
  const scrollRestoreRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const loadEvents = async () => {
      const res = await fetch('/api/events')
      const json = await res.json()
      const data = (json.data ?? []) as EventRow[]
      const sorted = [...data].sort((a, b) => {
        if (a.status === b.status) return a.event_date.localeCompare(b.event_date)
        if (a.status === 'LIVE') return -1
        if (b.status === 'LIVE') return 1
        if (a.status === 'UPCOMING') return -1
        if (b.status === 'UPCOMING') return 1
        return 0
      })
      setEvents(sorted)
      if (sorted.length > 0) setEventId((current) => current || sorted[0].id)
    }
    loadEvents()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = window.localStorage.getItem('race-control-high-visibility')
    setHighVisibility(saved === '1')
  }, [])

  const loadQueue = useCallback(async (id: string) => {
    if (!id) return
    setLoading(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const res = await fetch(`/api/race-control/events/${id}/queue`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const json = await res.json()
      setQueue((json.data?.motos ?? []) as QueueMoto[])
    } finally {
      setLoading(false)
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!eventId) return
    if (typeof window !== 'undefined') {
      scrollRestoreRef.current = { x: window.scrollX, y: window.scrollY }
    }
    setRefreshing(true)
    try {
      await loadQueue(eventId)
    } finally {
      setRefreshing(false)
    }
  }, [eventId, loadQueue])

  useEffect(() => {
    if (typeof window === 'undefined' || refreshing) return
    const restore = scrollRestoreRef.current
    if (!restore) return
    scrollRestoreRef.current = null
    window.requestAnimationFrame(() => {
      window.scrollTo({ left: restore.x, top: restore.y, behavior: 'instant' })
    })
  }, [queue, refreshing])

  useEffect(() => {
    void loadQueue(eventId)
  }, [eventId, loadQueue])

  // Removed automatic polling per user request

  const toggleHighVisibility = useCallback(() => {
    setHighVisibility((current) => {
      const next = !current
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('race-control-high-visibility', next ? '1' : '0')
      }
      return next
    })
  }, [])

  const activeQueue = useMemo(() => queue.filter((m) => m.status === 'LIVE' || m.status === 'READY' || m.status === 'UPCOMING'), [queue])
  const visibleQueue = useMemo(() => activeQueue.slice(0, 3), [activeQueue])

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-100 text-slate-900">
      <CheckerTopbar title="Race Control" />
      <main className="public-main max-w-[1350px]">
        <section className="public-hero">
          <div className="pointer-events-none absolute -bottom-16 left-0 h-64 w-64 rounded-full bg-amber-300/20 blur-3xl" />
          <div className="pointer-events-none absolute -top-20 right-0 h-72 w-72 rounded-full bg-emerald-300/12 blur-3xl" />
          <div className="relative z-10 grid gap-3">
            <div className="public-chip w-fit border-amber-300/40 bg-white/10 text-amber-200">Race Control</div>
            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="grid gap-2">
                <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">Waiting Zone & Calling Queue</h1>
                <p className="max-w-3xl text-sm font-semibold text-slate-200 sm:text-base">
                  Urutan race mengikuti moto per batch. Gunakan halaman ini untuk memanggil rider berikutnya
                  dengan cepat di tablet atau smartphone tanpa tabel pecah.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="public-panel-light">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
            <label className="grid gap-2">
              <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Event</span>
              <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="public-filter">
                {events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name} ({event.status})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing || !eventId}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.1em] text-slate-800 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={toggleHighVisibility}
              className={`inline-flex items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.1em] transition-colors ${
                highVisibility
                  ? 'border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200'
                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
              }`}
            >
              {highVisibility ? 'Mode Besar Aktif' : 'Mode Besar'}
            </button>
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="public-panel-light">
            <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Active Queue</div>
            <div className="mt-2 text-3xl font-black tracking-tight text-slate-900">{activeQueue.length}</div>
            <div className="mt-1 text-sm font-semibold text-slate-500">Menampilkan 3 moto aktif teratas</div>
          </div>
          <div className="public-panel-light">
            <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Current Event</div>
            <div className="mt-2 text-lg font-black tracking-tight text-slate-900">
              {events.find((event) => event.id === eventId)?.name ?? '-'}
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-500">
              {events.find((event) => event.id === eventId)?.event_date ?? '-'}
            </div>
          </div>
          <div className="public-panel-light">
            <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Operator Hint</div>
            <div className="mt-2 text-sm font-bold text-slate-700">
              Fokus ke 3 moto teratas: sekarang, berikutnya, lalu satu moto cadangan sesudahnya.
            </div>
          </div>
        </div>

        {!loading && visibleQueue.length > 0 && (
          <section className="grid gap-3 lg:grid-cols-3">
            {visibleQueue.map((moto, index) => {
              const slot = queueSlotMeta(index)
              return (
                <article
                  key={`spotlight-${moto.moto_id}`}
                  className={`rounded-[20px] border px-4 py-4 shadow-sm ${slot.panelClass}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid gap-1">
                      <div className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] ${slot.chipClass}`}>
                        {slot.label}
                      </div>
                      <div className={`${highVisibility ? 'text-2xl sm:text-3xl' : 'text-xl'} font-black tracking-tight text-slate-900`}>
                        {moto.moto_name}
                      </div>
                      <div className={`${highVisibility ? 'text-base sm:text-lg' : 'text-sm'} font-extrabold text-slate-700`}>
                        {moto.category_label}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Global</div>
                      <div className={`${highVisibility ? 'text-3xl' : 'text-2xl'} font-black text-slate-900`}>#{moto.global_order}</div>
                    </div>
                  </div>
                </article>
              )
            })}
          </section>
        )}

        <section className="grid gap-4">
          {loading && (
            <div className="public-panel-light">
              <div className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-600">Loading...</div>
            </div>
          )}

          {!loading && activeQueue.length === 0 && (
            <div className="public-panel-light">
              <div className="text-sm font-bold text-slate-700">Tidak ada batch UPCOMING/LIVE.</div>
            </div>
          )}

          {visibleQueue.map((moto, index) => {
            const slot = queueSlotMeta(index)
            const leadGates = moto.rows
              .filter((row) => row.gate !== null)
              .slice(0, 3)
              .map((row) => `G${row.gate} ${row.no_plate}`)
              .join(' • ')

            return (
            <article key={moto.moto_id} className={`public-panel-light border-l-4 ${slot.accentClass}`}>
              <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] ${slot.chipClass}`}>
                      {slot.label}
                    </div>
                    <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">
                      Global #{moto.global_order}
                    </div>
                  </div>
                  <div className={`${highVisibility ? 'text-3xl sm:text-4xl' : 'text-2xl sm:text-3xl'} font-black tracking-tight text-slate-900`}>
                    {moto.moto_name}
                  </div>
                  <div className={`${highVisibility ? 'text-xl sm:text-2xl' : 'text-lg sm:text-xl'} font-extrabold text-slate-700`}>
                    {moto.category_label}
                  </div>
                </div>
                <div className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em] ${statusBadgeClasses(moto.status)}`}>
                  {moto.status}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Global Order</div>
                  <div className={`${highVisibility ? 'text-4xl' : 'text-3xl'} mt-2 font-black tracking-tight text-slate-900`}>#{moto.global_order}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Ready Riders</div>
                  <div className={`${highVisibility ? 'text-4xl' : 'text-3xl'} mt-2 font-black tracking-tight text-slate-900`}>{moto.rows.length}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Callout</div>
                  <div className="mt-2 text-sm font-bold text-slate-700">
                    {leadGates || 'Gate dan komunitas sudah siap untuk announcer.'}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="table-mobile-hint">Geser kiri/kanan untuk lihat semua kolom.</div>
                <div className="public-table-wrap">
                  <table className="public-table" style={{ minWidth: highVisibility ? 640 : 520 }}>
                    <thead>
                      <tr>
                        <th>Gate</th>
                        <th>Nama Rider</th>
                        <th>No Plate</th>
                        <th>Komunitas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {moto.rows.map((row) => (
                        <tr key={row.rider_id} className={row.gate === 1 ? 'bg-amber-50/60' : undefined}>
                          <td className={`${highVisibility ? 'text-lg sm:text-xl' : ''} font-extrabold text-slate-900`}>{row.gate ?? '-'}</td>
                          <td className={`${highVisibility ? 'text-base sm:text-lg' : ''} font-extrabold text-slate-900`}>{row.name}</td>
                          <td className={highVisibility ? 'text-base' : ''}>{row.no_plate}</td>
                          <td className={highVisibility ? 'text-base' : ''}>{row.club || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </article>
          )})}
        </section>
      </main>
    </div>
  )
}
