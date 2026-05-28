'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import PublicTopbar from '../../../components/PublicTopbar'
import { useHighVisibility } from '../../../hooks/useHighVisibility'
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
  base_point: number | null
  penalty_total: number | null
  total_point: number | null
  rider_name: string
  rider_nickname?: string | null
  plate: string
  club?: string | null
  gate_position?: number | null
  status: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING'
}

type NextMotoRiderRow = {
  rider_id: string
  rider_name: string
  rider_nickname?: string | null
  plate: string
  club?: string | null
  gate_position?: number | null
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
    next_moto_riders?: NextMotoRiderRow[]
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
  if (status === 'DQ') return 'border-red-400 bg-red-100 text-red-800'
  if (status === 'DNF') return 'border-amber-300 bg-amber-50 text-amber-700'
  if (status === 'DNS') return 'border-rose-300 bg-rose-50 text-rose-700'
  if (status === 'PENDING') return 'border-slate-300 bg-slate-100 text-slate-700'
  return 'border-emerald-300 bg-emerald-50 text-emerald-700'
}

const riderDisplayName = (row: RankingRow) => row.rider_nickname?.trim() || row.rider_name
const nextMotoRiderDisplayName = (row: NextMotoRiderRow) => row.rider_nickname?.trim() || row.rider_name
const isResultReady = (motoStatus?: MotoInfo['status']) => motoStatus === 'PROVISIONAL' || motoStatus === 'LOCKED' || motoStatus === 'FINISHED'
const mcStatusLabel = (status: RankingRow['status']) => (status === 'PENDING' ? 'Starter' : status === 'FINISH' ? 'Finish' : status)
const mcCueText = (moto?: MotoInfo | null, nextMoto?: NextMotoInfo | null) => {
  if (!moto) return 'Menunggu data moto dari sistem.'
  if (moto.status === 'LIVE') return 'Pandu suasana dan siapkan rider berikutnya ke area tunggu.'
  if (moto.status === 'UPCOMING') return 'Panggil rider ke gate sesuai urutan start.'
  if (moto.status === 'PROVISIONAL') return nextMoto ? 'Bacakan hasil sementara, lalu lanjut panggil starter moto berikutnya.' : 'Bacakan hasil sementara kepada penonton.'
  if (moto.status === 'LOCKED' || moto.status === 'FINISHED') return nextMoto ? 'Hasil sudah siap dibacakan. Lanjutkan calling rider untuk moto berikutnya.' : 'Hasil sudah final dan siap dibacakan.'
  return 'Pantau update dari juri dan race control.'
}

export default function McLivePage() {
  const params = useParams()
  const eventId = String(params?.eventId ?? '')
  const [data, setData] = useState<McResponse['data'] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const { highVisibility, toggleHighVisibility } = useHighVisibility('mc-high-visibility')

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
  const nextMotoRiders = useMemo(() => (data?.next_moto_riders ?? []).slice(0, 8), [data])
  const readyToAnnounce = isResultReady(data?.moto?.status)

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
              <h1 className={`${highVisibility ? 'text-3xl md:text-5xl' : 'text-2xl md:text-4xl'} font-black tracking-tight text-white`}>
                {data?.category ?? 'Kategori'} | {data?.batch ?? '-'} | {data?.moto?.moto_name ?? 'Moto'}
              </h1>
              <p className={`${highVisibility ? 'text-xl md:text-2xl' : 'text-lg'} font-extrabold text-slate-200`}>{data?.event_name ?? 'Event'}</p>
              <p className={`${highVisibility ? 'text-base md:text-lg' : 'text-sm'} font-semibold text-slate-300`}>
                {data?.next_moto
                  ? `Next: ${data.next_moto.category ?? '-'} | ${data.next_moto.batch ?? '-'} | ${data.next_moto.moto_label}`
                  : 'Belum ada moto berikutnya'}
              </p>
              <p className={`${highVisibility ? 'text-base md:text-lg' : 'text-sm'} max-w-3xl font-semibold text-slate-200`}>
                {mcCueText(data?.moto ?? null, data?.next_moto ?? null)}
              </p>
            </div>
            <div className={`rounded-full border px-4 py-2 text-sm font-extrabold uppercase tracking-[0.12em] ${badge.className}`}>
              {badge.label}
            </div>
          </div>
        </section>

        <section className="grid gap-4">
          <article className="public-panel-light">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="grid gap-1">
                <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">Now Racing</div>
                <h2 className={`${highVisibility ? 'text-2xl md:text-3xl' : 'text-xl'} font-black tracking-tight text-slate-900`}>
                  {data?.moto?.moto_name ?? 'Belum ada moto'}
                </h2>
                <div className={`${highVisibility ? 'text-base md:text-lg' : 'text-sm'} font-bold text-slate-600`}>
                  {data?.category ?? '-'} | {data?.batch ?? '-'}
                </div>
              </div>
              <div className="grid gap-2 text-right">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Cue</div>
                  <div className={`${highVisibility ? 'text-base md:text-lg' : 'text-sm'} mt-1 font-extrabold text-slate-900`}>
                    {readyToAnnounce ? 'Baca hasil' : 'Panggil starter'}
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Kategori</div>
                <div className={`${highVisibility ? 'text-lg md:text-2xl' : 'text-base md:text-xl'} mt-1 font-black text-slate-900`}>{data?.category ?? '-'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Batch</div>
                <div className={`${highVisibility ? 'text-lg md:text-2xl' : 'text-base md:text-xl'} mt-1 font-black text-slate-900`}>{data?.batch ?? '-'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Moto Berikutnya</div>
                <div className={`${highVisibility ? 'text-lg md:text-2xl' : 'text-base md:text-xl'} mt-1 font-black text-slate-900`}>
                  {data?.next_moto?.moto_label ?? '-'}
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">Call To Gate</div>
                <div className={`${highVisibility ? 'text-2xl md:text-3xl' : 'text-xl'} font-black tracking-tight text-slate-900`}>
                  {data?.next_moto ? `${data.next_moto.batch ?? '-'} | ${data.next_moto.moto_label}` : 'Belum ada next moto'}
                </div>
              </div>
              <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-700">
                Starter
              </div>
            </div>
            <div className="grid gap-2">
              {nextMotoRiders.length === 0 && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-600">
                  Belum ada rider next moto.
                </div>
              )}
              {nextMotoRiders.map((row) => (
                <div
                  key={`next-${row.rider_id}`}
                  className="rounded-[22px] border border-slate-200 bg-white px-4 py-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Call To Gate</div>
                      <div className="mt-1 text-xl font-black text-slate-900">Gate {row.gate_position ?? '-'} | {row.plate}</div>
                    </div>
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-700">
                      Starter
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className={`truncate ${highVisibility ? 'text-lg md:text-2xl' : 'text-lg'} font-black leading-tight text-slate-900`}>
                      {nextMotoRiderDisplayName(row)}
                    </div>
                    {row.rider_nickname?.trim() ? (
                      <div
                        className={`truncate ${highVisibility ? 'text-sm md:text-lg' : 'text-xs md:text-sm'} mt-1 font-extrabold uppercase tracking-[0.08em] text-slate-700`}
                      >
                        {row.rider_name}
                      </div>
                    ) : null}
                    <div className={`truncate ${highVisibility ? 'text-base md:text-lg' : 'text-sm md:text-base'} mt-1 font-bold text-slate-500`}>
                      {row.club || '-'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="public-panel-light">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="grid gap-1">
              <h2 className={`${highVisibility ? 'text-2xl md:text-3xl' : 'text-xl'} font-black tracking-tight text-slate-900`}>
                {readyToAnnounce ? 'Result To Announce' : 'Starter / Hasil Sementara'}
              </h2>
              <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">
                Auto refresh aktif tiap 5 detik
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={toggleHighVisibility}
                className={`rounded-full border px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.12em] transition-colors ${
                  highVisibility
                    ? 'border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200'
                    : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {highVisibility ? 'Mode Besar Aktif' : 'Mode Besar'}
              </button>
              <button
                type="button"
                onClick={() => load()}
                className="rounded-full border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-700 transition-colors hover:bg-slate-200"
              >
                Refresh
              </button>
            </div>
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
            <div className="grid gap-4">
              <div className="grid gap-2">
                <div className="table-mobile-hint hidden md:block">Geser kiri/kanan untuk lihat semua kolom.</div>
                <div className="public-table-wrap hidden md:block">
                  <table className="public-table" style={{ minWidth: highVisibility ? 1100 : 900 }}>
                    <thead>
                      <tr>
                        {['Rank', 'Gate', 'Plate', 'Rider', 'Komunitas', 'Point', 'Penalty', 'Total', 'Status'].map((label) => (
                          <th key={label}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((row, idx) => (
                        <tr key={row.rider_id}>
                          <td className={`${highVisibility ? 'text-2xl md:text-3xl' : 'text-lg md:text-2xl'} font-black text-slate-900`}>{idx + 1}</td>
                          <td className={`${highVisibility ? 'text-lg md:text-2xl' : 'text-base md:text-xl'} font-extrabold text-slate-700`}>
                            {row.gate_position ?? '-'}
                          </td>
                          <td className={`${highVisibility ? 'text-lg md:text-2xl' : 'text-base md:text-xl'} font-extrabold`}>{row.plate}</td>
                          <td>
                            <div className={`${highVisibility ? 'text-2xl md:text-3xl' : 'text-lg md:text-2xl'} font-black text-slate-900`}>{riderDisplayName(row)}</div>
                            {row.rider_nickname?.trim() && (
                              <div className={`${highVisibility ? 'text-sm md:text-base' : 'text-xs md:text-sm'} font-bold uppercase tracking-[0.12em] text-slate-500`}>
                                {row.rider_name}
                              </div>
                            )}
                          </td>
                          <td className={`${highVisibility ? 'text-base md:text-xl' : 'text-sm md:text-lg'} font-extrabold text-slate-700`}>{row.club || '-'}</td>
                          <td className={`${highVisibility ? 'text-2xl md:text-4xl' : 'text-xl md:text-3xl'} font-black text-sky-700`}>{row.base_point ?? '-'}</td>
                          <td className={`${highVisibility ? 'text-2xl md:text-4xl' : 'text-xl md:text-3xl'} font-black text-amber-600`}>{row.penalty_total ?? '-'}</td>
                          <td className={`${highVisibility ? 'text-2xl md:text-4xl' : 'text-xl md:text-3xl'} font-black text-sky-700`}>{row.total_point ?? '-'}</td>
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
                <div className="grid gap-3 md:hidden">
                  {ranking.map((row, idx) => (
                    <article
                      key={`mc-current-mobile-${row.rider_id}`}
                      className={`rounded-[22px] border px-4 py-4 shadow-sm ${
                        row.status === 'FINISH'
                          ? 'border-emerald-200 bg-white'
                          : row.status === 'PENDING'
                            ? 'border-slate-200 bg-white'
                            : 'border-amber-200 bg-amber-50/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Rank {idx + 1}</div>
                          <div className="mt-1 text-xl font-black text-slate-900">
                            Gate {row.gate_position ?? '-'} | {row.plate}
                          </div>
                        </div>
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] ${resultStatusBadge(
                            row.status
                          )}`}
                        >
                          {mcStatusLabel(row.status)}
                        </span>
                      </div>
                      <div className="mt-3">
                        <div className="text-2xl font-black leading-tight text-slate-900">{riderDisplayName(row)}</div>
                        {row.rider_nickname?.trim() ? (
                          <div className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-slate-500">{row.rider_name}</div>
                        ) : null}
                        <div className="mt-1 text-sm font-bold text-slate-600">{row.club || '-'}</div>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Point</div>
                          <div className="mt-1 text-lg font-black text-sky-700">{row.base_point ?? '-'}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Penalty</div>
                          <div className="mt-1 text-lg font-black text-amber-600">{row.penalty_total ?? '-'}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Total</div>
                          <div className="mt-1 text-lg font-black text-slate-900">{row.total_point ?? '-'}</div>
                        </div>
                      </div>
                    </article>
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
