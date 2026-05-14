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
  rider_nickname?: string | null
  plate: string
  club?: string | null
  gate_position?: number | null
  status: 'FINISH' | 'DNF' | 'DNS' | 'PENDING'
}

type NextMotoInfo = {
  id: string
  moto_name: string
  moto_label: string
  moto_order: number
  status: 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
  category: string | null
  batch: string | null
}

type McResponse = {
  data: {
    under_review: boolean
    event_name?: string | null
    review_moto?: MotoInfo | null
    moto?: MotoInfo | null
    category?: string | null
    batch?: string | null
    ranking?: RankingRow[]
    finish_order?: RankingRow[]
    next_moto?: NextMotoInfo | null
  }
}

const statusBadge = (moto?: MotoInfo | null) => {
  if (!moto) return { label: 'NO MOTO', className: 'border-slate-300 bg-slate-100 text-slate-700' }
  if (moto.status === 'LIVE') return { label: 'Race Berlangsung', className: 'border-emerald-300 bg-emerald-50 text-emerald-700' }
  if (moto.status === 'UPCOMING') return { label: 'Menunggu Start', className: 'border-slate-300 bg-slate-100 text-slate-700' }
  if (moto.status === 'PROVISIONAL') return { label: 'Hasil Sementara', className: 'border-amber-300 bg-amber-50 text-amber-700' }
  if (moto.status === 'LOCKED' || moto.status === 'FINISHED') return { label: 'Moto Selesai', className: 'border-sky-300 bg-sky-50 text-sky-700' }
  return { label: 'Menunggu Start', className: 'border-slate-300 bg-slate-100 text-slate-700' }
}

const resultStatusBadge = (status: RankingRow['status']) => {
  if (status === 'DNF') return 'border-amber-300 bg-amber-50 text-amber-700'
  if (status === 'DNS') return 'border-rose-300 bg-rose-50 text-rose-700'
  if (status === 'PENDING') return 'border-slate-300 bg-slate-100 text-slate-700'
  return 'border-emerald-300 bg-emerald-50 text-emerald-700'
}

const riderDisplayName = (row: RankingRow) => row.rider_nickname?.trim() || row.rider_name

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
  const finishOrder = useMemo(() => (data?.finish_order ?? []).slice(0, 8), [data])

  if (data?.under_review) {
    return (
      <div className="grid min-h-screen place-items-center bg-amber-700 px-6 text-center text-white">
        <div className="max-w-3xl">
          <div className="text-4xl font-black uppercase tracking-[0.12em] md:text-6xl">Under Protest Review</div>
          <div className="mt-4 text-base font-semibold text-amber-100 md:text-xl">
            {data.review_moto?.moto_name ?? 'Moto sedang di review'}
          </div>
          <div className="mt-3 text-sm font-semibold text-amber-100/90">Ranking disembunyikan sampai review selesai.</div>
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
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-amber-400/15 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-300">MC Live Board</p>
              <h1 className="text-2xl font-black tracking-tight text-white md:text-4xl">
                {data?.category ?? 'Kategori'} | {data?.batch ?? '-'} | {data?.moto?.moto_name ?? 'Moto'}
              </h1>
              <p className="text-lg font-extrabold text-slate-200">{data?.event_name ?? 'Event'}</p>
              <p className="text-sm font-semibold text-slate-300">
                {data?.next_moto
                  ? `Next: ${data.next_moto.category ?? '-'} | ${data.next_moto.batch ?? '-'} | ${data.next_moto.moto_label}`
                  : 'Belum ada moto berikutnya'}
              </p>
            </div>
            <div className={`rounded-full border px-4 py-2 text-sm font-extrabold uppercase tracking-[0.12em] ${badge.className}`}>
              {badge.label}
            </div>
          </div>
        </section>

        <section className="public-panel-light">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="grid gap-1">
              <h2 className="text-xl font-black tracking-tight text-slate-900">Ranking (Top 8)</h2>
              <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Auto refresh aktif tiap 5 detik</div>
            </div>
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
            <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
              <div className="grid gap-2">
                <div className="table-mobile-hint">Geser kiri/kanan untuk lihat semua kolom.</div>
                <div className="public-table-wrap">
                  <table className="public-table" style={{ minWidth: 760 }}>
                    <thead>
                      <tr>
                        {['Rank', 'Plate', 'Rider', 'Komunitas', 'Total Point', 'Status'].map((label) => (
                          <th key={label}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((row, idx) => (
                        <tr key={row.rider_id}>
                          <td className="text-lg font-black text-slate-900 md:text-2xl">{idx + 1}</td>
                          <td className="text-base font-extrabold md:text-xl">{row.plate}</td>
                          <td>
                            <div className="text-lg font-black text-slate-900 md:text-2xl">{riderDisplayName(row)}</div>
                            {row.rider_nickname?.trim() && (
                              <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500 md:text-sm">
                                {row.rider_name}
                              </div>
                            )}
                          </td>
                          <td className="text-sm font-extrabold text-slate-700 md:text-lg">{row.club || '-'}</td>
                          <td className="text-xl font-black text-sky-700 md:text-3xl">{row.total_point ?? '-'}</td>
                          <td>
                            {row.status !== 'FINISH' ? (
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em] ${resultStatusBadge(
                                  row.status
                                )}`}
                              >
                                {row.status === 'PENDING' ? 'Starter' : row.status}
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-emerald-700">
                                Finish
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 text-lg font-black tracking-tight text-slate-900 md:text-2xl">Finish Order Moto Terkini</div>
                <div className="grid gap-2">
                  {finishOrder.length === 0 && (
                    <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-600">
                      Belum ada finish order.
                    </div>
                  )}
                  {finishOrder.map((row, idx) => (
                    <div
                      key={`finish-${row.rider_id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-500">
                          {row.status === 'FINISH'
                            ? `Finish #${row.finish_order ?? idx + 1}`
                            : row.status === 'PENDING'
                            ? `Gate ${row.gate_position ?? '-'}`
                            : row.status}
                        </div>
                        <div className="truncate text-base font-black text-slate-900 md:text-xl">
                          {row.plate} - {riderDisplayName(row)}
                        </div>
                        <div className="truncate text-sm font-bold text-slate-500 md:text-base">{row.club || '-'}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {row.status !== 'FINISH' && (
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] ${resultStatusBadge(
                              row.status
                            )}`}
                          >
                            {row.status === 'PENDING' ? 'Starter' : row.status}
                          </span>
                        )}
                        <div className="text-lg font-black text-sky-700 md:text-2xl">{row.total_point ?? '-'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-700">{error}</div>}

          <div className="mt-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
            Last updated: {lastUpdated ?? '-'}
          </div>
        </section>
      </main>
    </div>
  )
}
