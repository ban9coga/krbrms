'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import PublicTopbar from '../../../components/PublicTopbar'
import { supabase } from '../../../lib/supabaseClient'

type MotoInfo = {
  id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
  is_published: boolean | null
}

type RankingRow = {
  rider_id: string
  finish_order: number | null
  total_point: number | null
  rider_name: string
  plate: string
}

type McResponse = {
  data: {
    under_review: boolean
    review_moto?: MotoInfo | null
    moto?: MotoInfo | null
    category?: string | null
    batch?: string | null
    ranking?: RankingRow[]
  }
}

const statusBadge = (moto?: MotoInfo | null) => {
  if (!moto) return { label: 'NO MOTO', className: 'border-slate-300 bg-slate-100 text-slate-700' }
  if (moto.status === 'LIVE') return { label: 'LIVE', className: 'border-emerald-300 bg-emerald-50 text-emerald-700' }
  if (moto.status === 'PROVISIONAL') return { label: 'PROVISIONAL', className: 'border-amber-300 bg-amber-50 text-amber-700' }
  if (moto.status === 'LOCKED') return { label: 'LOCKED', className: 'border-sky-300 bg-sky-50 text-sky-700' }
  return { label: moto.status, className: 'border-slate-300 bg-slate-100 text-slate-700' }
}

export default function McLivePage() {
  const params = useParams()
  const eventId = String(params?.eventId ?? '')
  const [data, setData] = useState<McResponse['data'] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

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

  const load = async (silent = false) => {
    if (!eventId) return
    if (!silent) setLoading(true)
    setError(null)
    try {
      const json = (await apiFetch(`/api/internal/events/${eventId}/mc-live`)) as McResponse
      setData(json.data ?? null)
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => load(true), 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const ranking = useMemo(() => (data?.ranking ?? []).slice(0, 8), [data])

  if (data?.under_review) {
    return (
      <div className="grid min-h-screen place-items-center bg-rose-700 px-6 text-center text-white">
        <div className="max-w-3xl">
          <div className="text-4xl font-black uppercase tracking-[0.12em] md:text-6xl">Under Protest Review</div>
          <div className="mt-4 text-base font-semibold text-rose-100 md:text-xl">
            {data.review_moto?.moto_name ?? 'Moto sedang di review'}
          </div>
          <div className="mt-3 text-sm font-semibold text-rose-100/90">Ranking disembunyikan sampai review selesai.</div>
        </div>
      </div>
    )
  }

  const badge = statusBadge(data?.moto ?? null)
  return (
    <div className="public-page">
      <PublicTopbar />
      <main className="public-main max-w-[1100px]">
        <section className="public-hero">
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-rose-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-rose-300">MC Live Board</p>
              <h1 className="text-2xl font-black tracking-tight text-white md:text-4xl">
                {data?.category ?? 'Kategori'} | {data?.batch ?? '-'} | {data?.moto?.moto_name ?? 'Moto'}
              </h1>
              <p className="text-sm font-semibold text-slate-300">Event {eventId}</p>
            </div>
            <div className={`rounded-full border px-4 py-2 text-sm font-extrabold uppercase tracking-[0.12em] ${badge.className}`}>
              {badge.label}
            </div>
          </div>
        </section>

        <section className="public-panel-light">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-xl font-black tracking-tight text-slate-900">Ranking (Top 8)</h2>
            <button
              type="button"
              onClick={() => load()}
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

          {!loading && ranking.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-600">
              Belum ada hasil.
            </div>
          )}

          {!loading && ranking.length > 0 && (
            <div className="public-table-wrap">
              <table className="public-table" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    {['Rank', 'Plate', 'Rider', 'Total Point'].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((row, idx) => (
                    <tr key={row.rider_id}>
                      <td className="font-extrabold text-slate-900">{idx + 1}</td>
                      <td>{row.plate}</td>
                      <td className="font-extrabold text-slate-900">{row.rider_name}</td>
                      <td className="font-extrabold text-sky-700">{row.total_point ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</div>}

          <div className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            Last updated: {lastUpdated ?? '-'}
          </div>
        </section>
      </main>
    </div>
  )
}
