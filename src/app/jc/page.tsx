'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import PublicTopbar from '../../components/PublicTopbar'
import { isMotoLive } from '../../lib/motoStatus'
import { supabase } from '../../lib/supabaseClient'

type EventItem = {
  id: string
  name: string
  status: string
}

type MotoItem = {
  id: string
  moto_name: string
  moto_order: number
  status: string
}

export default function JCSelectorPage() {
  const router = useRouter()
  const [events, setEvents] = useState<EventItem[]>([])
  const [motos, setMotos] = useState<MotoItem[]>([])
  const [eventId, setEventId] = useState('')
  const [motoId, setMotoId] = useState('')
  const [loading, setLoading] = useState(false)

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Request failed')
    return json
  }

  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true)
      try {
        const res = await apiFetch('/api/jury/events?status=LIVE,UPCOMING')
        setEvents(res.data ?? [])
        if (!eventId && res.data?.length) setEventId(res.data[0].id)
      } finally {
        setLoading(false)
      }
    }
    loadEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const loadMotos = async () => {
      if (!eventId) return
      setLoading(true)
      try {
        const motoRes = await fetch(`/api/motos?event_id=${eventId}`)
        const motoJson = await motoRes.json()
        const list = (motoJson.data ?? []) as MotoItem[]
        list.sort((a, b) => a.moto_order - b.moto_order)
        setMotos(list)
        if (!motoId && list.length) {
          const live = list.find((m) => isMotoLive(m.status))
          setMotoId((live ?? list[0]).id)
        }
      } finally {
        setLoading(false)
      }
    }
    loadMotos()
  }, [eventId, motoId])

  return (
    <div className="public-page">
      <PublicTopbar />
      <main className="public-main">
        <section className="public-hero">
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-rose-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
          <div className="relative z-10 grid gap-2">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-rose-300">Jury Control</p>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">JC Gate Selector</h1>
            <p className="max-w-2xl text-sm font-semibold text-slate-200 sm:text-base">
              Pilih event dan moto yang akan dikontrol.
            </p>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[620px] rounded-[1.5rem] border border-slate-200 bg-white/95 p-5 shadow-[0_16px_36px_rgba(15,23,42,0.12)] sm:p-6">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Event</label>
              <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="public-filter">
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name} - {ev.status}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Moto</label>
              <select value={motoId} onChange={(e) => setMotoId(e.target.value)} className="public-filter">
                {motos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.moto_order}. {m.moto_name} - {m.status}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              disabled={!eventId || !motoId || loading}
              onClick={() => router.push(`/jc/${eventId}/${motoId}`)}
              className="inline-flex items-center justify-center rounded-xl bg-rose-500 px-4 py-3 text-sm font-extrabold uppercase tracking-[0.12em] text-white transition-colors hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-rose-300"
            >
              {loading ? 'Loading...' : 'Buka Gate Screen'}
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
