'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import CheckerTopbar from '../../components/CheckerTopbar'
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
  category_id?: string
}

type CategoryItem = {
  id: string
  label: string
}

export default function JCSelectorPage() {
  const router = useRouter()
  const [events, setEvents] = useState<EventItem[]>([])
  const [motos, setMotos] = useState<MotoItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [eventId, setEventId] = useState('')
  const [motoId, setMotoId] = useState('')
  const [singleLiveEventId, setSingleLiveEventId] = useState<string | null>(null)
  const [didAutoRedirect, setDidAutoRedirect] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c.label])), [categories])

  const getToken = async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session?.access_token) return data.session.access_token
    const refreshed = await supabase.auth.refreshSession()
    return refreshed.data.session?.access_token ?? null
  }

  const apiFetch = async (url: string, options: RequestInit = {}, retryUnauthorized = true) => {
    const token = await getToken()
    const headers: Record<string, string> = {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...((options.headers ?? {}) as Record<string, string>),
    }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 401 && retryUnauthorized) {
        return apiFetch(url, options, false)
      }
      if (res.status === 401) {
        throw new Error('Session login habis. Silakan login ulang.')
      }
      throw new Error(json?.error || 'Request failed')
    }
    return json
  }

  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true)
      setErrorMessage(null)
      try {
        const res = await apiFetch('/api/jury/events?status=LIVE,UPCOMING')
        const list = (res.data ?? []) as EventItem[]
        setEvents(list)
        const liveEvents = list.filter((ev) => String(ev.status).toUpperCase() === 'LIVE')
        setSingleLiveEventId(liveEvents.length === 1 ? liveEvents[0].id : null)
        if (!eventId && list.length) {
          setEventId((liveEvents[0] ?? list[0]).id)
        }
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Gagal memuat event JC.')
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
      setErrorMessage(null)
      try {
        const [motoRes, categoryRes] = await Promise.all([
          fetch(`/api/motos?event_id=${eventId}`),
          fetch(`/api/events/${eventId}/categories`),
        ])
        const motoJson = await motoRes.json()
        const categoryJson = await categoryRes.json()
        const list = (motoJson.data ?? []) as MotoItem[]
        setCategories((categoryJson.data ?? []) as CategoryItem[])
        list.sort((a, b) => a.moto_order - b.moto_order)
        setMotos(list)
        const liveMotos = list.filter((m) => isMotoLive(m.status))
        if (!motoId && list.length) {
          setMotoId((liveMotos[0] ?? list[0]).id)
        }
        if (
          !didAutoRedirect &&
          singleLiveEventId &&
          eventId === singleLiveEventId &&
          liveMotos.length === 1
        ) {
          setDidAutoRedirect(true)
          router.replace(`/jc/${eventId}/${liveMotos[0].id}`)
        }
      } catch (err: unknown) {
        setErrorMessage(err instanceof Error ? err.message : 'Gagal memuat moto.')
      } finally {
        setLoading(false)
      }
    }
    loadMotos()
  }, [didAutoRedirect, eventId, motoId, router, singleLiveEventId])

  return (
    <div className="public-page">
      <CheckerTopbar title="Checker Panel" />
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
            {errorMessage && (
              <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                {errorMessage}
              </div>
            )}
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
                    {m.moto_order}. {categoryMap.get(m.category_id ?? '') ?? 'Category'} - {m.moto_name} - {m.status}
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
