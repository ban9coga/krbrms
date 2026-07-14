'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import PublicTopbar from '../../../components/PublicTopbar'
import { useHighVisibility } from '../../../hooks/useHighVisibility'
import { supabase } from '../../../lib/supabaseClient'

const MC_REFRESH_INTERVAL_MS = 10000

type MotoInfo = {
  id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'READY' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
  is_published: boolean | null
}

type RankingRow = {
  rider_id: string
  finish_order: number | null
  base_point: number | null
  penalty_total: number | null
  penalty_breakdown?: Array<{ code: string; points: number }>
  total_point: number | null
  rider_name: string
  rider_nickname?: string | null
  plate: string
  club?: string | null
  gate_position?: number | null
  status: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'READY' | 'PENDING' | 'ABSENT'
}

type NextMotoRiderRow = {
  rider_id: string
  rider_name: string
  rider_nickname?: string | null
  plate: string
  club?: string | null
  gate_position?: number | null
  penalty_total?: number | null
  penalty_breakdown?: Array<{ code: string; points: number }>
  status: 'READY' | 'ABSENT' | 'DNS' | 'PENDING'
}

type NextMotoInfo = {
  id: string
  moto_name: string
  moto_label: string
  moto_order: number
  status: 'UPCOMING' | 'READY' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
  category: string | null
  batch: string | null
}

type McResponse = {
  data: {
    under_review: boolean
    event_name?: string | null
    review_moto?: MotoInfo | null
    moto?: MotoInfo | null
    now_moto?: MotoInfo | null
    category?: string | null
    now_category?: string | null
    batch?: string | null
    now_batch?: string | null
    ranking?: RankingRow[]
    next_moto_riders?: NextMotoRiderRow[]
    next_moto?: NextMotoInfo | null
  }
}

const statusBadge = (moto?: MotoInfo | null) => {
  if (!moto) return { label: 'NO MOTO', className: 'border-slate-300 bg-slate-100 text-slate-700' }
  if (moto.status === 'LIVE') return { label: 'Race Berlangsung', className: 'border-emerald-300 bg-emerald-50 text-emerald-700' }
  if (moto.status === 'READY') return { label: 'Ready Start', className: 'border-emerald-300 bg-emerald-50 text-emerald-700' }
  if (moto.status === 'UPCOMING') return { label: 'Menunggu Start', className: 'border-slate-300 bg-slate-100 text-slate-700' }
  if (moto.status === 'PROVISIONAL') return { label: 'Hasil Sementara', className: 'border-amber-300 bg-amber-50 text-amber-700' }
  if (moto.status === 'LOCKED' || moto.status === 'FINISHED') return { label: 'Moto Selesai', className: 'border-sky-300 bg-sky-50 text-sky-700' }
  return { label: 'Menunggu Start', className: 'border-slate-300 bg-slate-100 text-slate-700' }
}

const resultStatusBadge = (status: RankingRow['status']) => {
  if (status === 'READY') return 'border-sky-300 bg-sky-50 text-sky-700'
  if (status === 'ABSENT') return 'border-rose-300 bg-rose-50 text-rose-700'
  if (status === 'DQ') return 'border-red-400 bg-red-100 text-red-800'
  if (status === 'DNF') return 'border-amber-300 bg-amber-50 text-amber-700'
  if (status === 'DNS') return 'border-rose-300 bg-rose-50 text-rose-700'
  if (status === 'PENDING') return 'border-slate-300 bg-slate-100 text-slate-700'
  return 'border-emerald-300 bg-emerald-50 text-emerald-700'
}

const nextMotoStatusBadge = (status: NextMotoRiderRow['status']) => {
  if (status === 'READY') return 'border-emerald-300 bg-emerald-50 text-emerald-700'
  if (status === 'ABSENT') return 'border-rose-300 bg-rose-50 text-rose-700'
  if (status === 'DNS') return 'border-amber-300 bg-amber-50 text-amber-700'
  return 'border-slate-300 bg-slate-100 text-slate-700'
}

const riderDisplayName = (row: RankingRow) => row.rider_nickname?.trim() || row.rider_name
const nextMotoRiderDisplayName = (row: NextMotoRiderRow) => row.rider_nickname?.trim() || row.rider_name
const isResultReady = (motoStatus?: MotoInfo['status']) => motoStatus === 'PROVISIONAL' || motoStatus === 'LOCKED' || motoStatus === 'FINISHED'
const mcRankLabel = (readyToAnnounce: boolean, index: number) => (readyToAnnounce ? String(index + 1) : '-')
const mcStatusLabel = (status: RankingRow['status']) =>
  status === 'PENDING'
    ? 'Belum Dicek'
    : status === 'READY'
      ? 'Ready'
      : status === 'ABSENT'
        ? 'Absent'
      : status === 'FINISH'
        ? 'Finish'
        : status
const nextMotoStatusLabel = (status: NextMotoRiderRow['status']) =>
  status === 'PENDING' ? 'Belum Dicek' : status === 'READY' ? 'Ready' : status === 'ABSENT' ? 'Absent' : status
const mcCueText = (nowMoto?: MotoInfo | null, resultMoto?: MotoInfo | null, nextMoto?: NextMotoInfo | null) => {
  if (!nowMoto && !resultMoto) return 'Menunggu data moto dari sistem.'
  if (resultMoto && isResultReady(resultMoto.status) && nowMoto && resultMoto.id !== nowMoto.id) {
    return nextMoto
      ? 'Bacakan hasil moto yang baru finish, sambil siapkan rider moto yang sedang live dan moto berikutnya.'
      : 'Bacakan hasil moto yang baru finish, lalu lanjutkan panduan start untuk race berikutnya.'
  }
  const moto = nowMoto ?? resultMoto
  if (!moto) return 'Menunggu data moto dari sistem.'
  if (moto.status === 'LIVE') return 'Pandu suasana dan siapkan rider berikutnya ke area tunggu.'
  if (moto.status === 'READY') return 'Moto sudah ready dari checker. Panggil rider ke gate dan siapkan start.'
  if (moto.status === 'UPCOMING') return 'Panggil rider ke gate sesuai urutan start.'
  if (moto.status === 'PROVISIONAL') return nextMoto ? 'Bacakan hasil sementara, lalu lanjut panggil starter moto berikutnya.' : 'Bacakan hasil sementara kepada penonton.'
  if (moto.status === 'LOCKED' || moto.status === 'FINISHED') return nextMoto ? 'Hasil sudah siap dibacakan. Lanjutkan calling rider untuk moto berikutnya.' : 'Hasil sudah final dan siap dibacakan.'
  return 'Pantau update dari juri dan race control.'
}

const PenaltyBadges = ({ items, compact = false }: { items?: Array<{ code: string; points: number }>; compact?: boolean }) => {
  if (!items?.length) return null
  const visible = items.slice(0, compact ? 2 : 3)
  const hiddenCount = items.length - visible.length
  return (
    <div className="mt-1 flex flex-wrap justify-center gap-1">
      {visible.map((item, index) => (
        <span
          key={`${item.code}-${item.points}-${index}`}
          className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-amber-700"
        >
          {item.code} +{item.points}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span className="inline-flex rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600">
          +{hiddenCount}
        </span>
      )}
    </div>
  )
}

export default function McLivePage() {
  const params = useParams()
  const eventId = String(params?.eventId ?? '')
  const [data, setData] = useState<McResponse['data'] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const refreshInFlightRef = useRef(false)
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
    if (refreshInFlightRef.current) return
    refreshInFlightRef.current = true
    if (!silent) setLoading(true)
    setError(null)
    try {
      const json = (await apiFetch(`/api/internal/events/${eventId}/mc-live`)) as McResponse
      setData(json.data ?? null)
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data')
    } finally {
      refreshInFlightRef.current = false
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => load(true), MC_REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const ranking = useMemo(() => (data?.ranking ?? []).slice(0, 8), [data])
  const nextMotoRiders = useMemo(() => (data?.next_moto_riders ?? []).slice(0, 8), [data])
  const readyToAnnounce = isResultReady(data?.moto?.status)
  const nowMoto = data?.now_moto ?? data?.moto ?? null
  const nowCategory = data?.now_category ?? data?.category ?? null
  const nowBatch = data?.now_batch ?? data?.batch ?? null
  const announcingDifferentMoto = !!(readyToAnnounce && data?.moto && nowMoto && data.moto.id !== nowMoto.id)

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

  const badge = statusBadge(nowMoto)
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
                {nowCategory ?? 'Kategori'} | {nowBatch ?? '-'} | {nowMoto?.moto_name ?? 'Moto'}
              </h1>
              <p className={`${highVisibility ? 'text-xl md:text-2xl' : 'text-lg'} font-extrabold text-slate-200`}>{data?.event_name ?? 'Event'}</p>
              <p className={`${highVisibility ? 'text-base md:text-lg' : 'text-sm'} font-semibold text-slate-300`}>
                {data?.next_moto
                  ? `Next: ${data.next_moto.category ?? '-'} | ${data.next_moto.batch ?? '-'} | ${data.next_moto.moto_label}`
                  : 'Belum ada moto berikutnya'}
              </p>
              {announcingDifferentMoto && data?.moto ? (
                <p className={`${highVisibility ? 'text-base md:text-lg' : 'text-sm'} font-bold text-amber-200`}>
                  Result To Announce: {data.category ?? '-'} | {data.batch ?? '-'} | {data.moto.moto_name}
                </p>
              ) : null}
              <p className={`${highVisibility ? 'text-base md:text-lg' : 'text-sm'} max-w-3xl font-semibold text-slate-200`}>
                {mcCueText(nowMoto, data?.moto ?? null, data?.next_moto ?? null)}
              </p>
            </div>
            <div className={`rounded-full border px-4 py-2 text-sm font-extrabold uppercase tracking-[0.12em] ${badge.className}`}>
              {badge.label}
            </div>
          </div>
          <div className="relative z-10 mt-4 flex flex-wrap gap-3">
            <Link
              href={`/mc/${eventId}/draw`}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm font-extrabold uppercase tracking-[0.12em] text-amber-300 transition-colors hover:bg-amber-400/20"
            >
              🎰 Live Draw
            </Link>
          </div>
        </section>

        <section className="grid gap-4">
          <article className="public-panel-light">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="grid gap-1">
                <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">Now Racing</div>
                <h2 className={`${highVisibility ? 'text-2xl md:text-3xl' : 'text-xl'} font-black tracking-tight text-slate-900`}>
                  {nowMoto?.moto_name ?? 'Belum ada moto'}
                </h2>
                <div className={`${highVisibility ? 'text-base md:text-lg' : 'text-sm'} font-bold text-slate-600`}>
                  {nowCategory ?? '-'} | {nowBatch ?? '-'}
                </div>
              </div>
              <div className="grid gap-2 text-right">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Cue</div>
                  <div className={`${highVisibility ? 'text-base md:text-lg' : 'text-sm'} mt-1 font-extrabold text-slate-900`}>
                    {readyToAnnounce ? 'Baca hasil' : nowMoto?.status === 'LIVE' ? 'Pandu race' : 'Panggil rider'}
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Kategori</div>
                <div className={`${highVisibility ? 'text-lg md:text-2xl' : 'text-base md:text-xl'} mt-1 font-black text-slate-900`}>{nowCategory ?? '-'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Batch</div>
                <div className={`${highVisibility ? 'text-lg md:text-2xl' : 'text-base md:text-xl'} mt-1 font-black text-slate-900`}>{nowBatch ?? '-'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Moto Berikutnya</div>
                <div className={`${highVisibility ? 'text-lg md:text-2xl' : 'text-base md:text-xl'} mt-1 font-black text-slate-900`}>
                  {data?.next_moto?.moto_label ?? '-'}
                </div>
              </div>
            </div>
          </article>
        </section>

        <section className="public-panel-light">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid gap-1">
              <h2 className={`${highVisibility ? 'text-2xl md:text-3xl' : 'text-xl'} font-black tracking-tight text-slate-900`}>
                {readyToAnnounce ? 'Result To Announce' : 'Status Rider / Hasil Sementara'}
              </h2>
              {announcingDifferentMoto && data?.moto ? (
                <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">
                  Moto hasil: {data.category ?? '-'} | {data.batch ?? '-'} | {data.moto.moto_name}
                </div>
              ) : null}
              <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">
                Auto refresh aktif tiap {MC_REFRESH_INTERVAL_MS / 1000} detik
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => load()}
                disabled={loading}
                className="rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.12em] text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Memuat...' : 'Refresh Sekarang'}
              </button>
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
                        {['Gate', 'Plate', 'Rider', 'Komunitas', 'Point', 'Penalty', 'Total', 'Rank', 'Status'].map((label) => (
                          <th key={label}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.map((row, idx) => (
                        <tr key={row.rider_id}>
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
                          <td className={`${highVisibility ? 'text-2xl md:text-4xl' : 'text-xl md:text-3xl'} font-black text-amber-600`}>
                            <div>{row.penalty_total ?? '-'}</div>
                            <PenaltyBadges items={row.penalty_breakdown} compact />
                          </td>
                          <td className={`${highVisibility ? 'text-2xl md:text-4xl' : 'text-xl md:text-3xl'} font-black text-sky-700`}>{row.total_point ?? '-'}</td>
                          <td className={`${highVisibility ? 'text-2xl md:text-3xl' : 'text-lg md:text-2xl'} font-black text-slate-900`}>
                            {mcRankLabel(readyToAnnounce, idx)}
                          </td>
                          <td>
                            {row.status !== 'FINISH' ? (
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em] ${resultStatusBadge(
                                  row.status
                                )}`}
                              >
                                {mcStatusLabel(row.status)}
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
                          : row.status === 'READY'
                            ? 'border-sky-200 bg-sky-50/60'
                          : row.status === 'PENDING'
                            ? 'border-slate-200 bg-white'
                            : 'border-amber-200 bg-amber-50/60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">Current Rider</div>
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
                      <div className="mt-4 grid grid-cols-4 gap-2">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Point</div>
                          <div className="mt-1 text-lg font-black text-sky-700">{row.base_point ?? '-'}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Penalty</div>
                          <div className="mt-1 text-lg font-black text-amber-600">{row.penalty_total ?? '-'}</div>
                          <PenaltyBadges items={row.penalty_breakdown} compact />
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Total</div>
                          <div className="mt-1 text-lg font-black text-slate-900">{row.total_point ?? '-'}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Rank</div>
                          <div className="mt-1 text-lg font-black text-slate-900">{mcRankLabel(readyToAnnounce, idx)}</div>
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

        <section className="rounded-[24px] border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">Call To Gate</div>
              {data?.next_moto ? (
                <div className="mt-1 text-xs font-black uppercase tracking-[0.14em] text-emerald-700">
                  {data.next_moto.category ?? 'Kategori -'}
                </div>
              ) : null}
              <div className={`${highVisibility ? 'text-2xl md:text-3xl' : 'text-xl'} font-black tracking-tight text-slate-900`}>
                {data?.next_moto ? `${data.next_moto.batch ?? '-'} | ${data.next_moto.moto_label}` : 'Belum ada next moto'}
              </div>
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-700">
              Rider Prep
            </div>
          </div>
          {nextMotoRiders.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-700">
                Total {nextMotoRiders.length}
              </span>
              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-emerald-700">
                Ready {nextMotoRiders.filter((row) => row.status === 'READY').length}
              </span>
              <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-700">
                Belum Dicek {nextMotoRiders.filter((row) => row.status === 'PENDING').length}
              </span>
              <span className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-rose-700">
                Absent {nextMotoRiders.filter((row) => row.status === 'ABSENT').length}
              </span>
            </div>
          )}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white md:block">
            {nextMotoRiders.length === 0 ? (
              <div className="p-3 text-sm font-semibold text-slate-600">
                Belum ada rider next moto.
              </div>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-100 text-left text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                    <th className="w-20 px-3 py-3">Gate</th>
                    <th className="w-24 px-3 py-3">Plate</th>
                    <th className="px-3 py-3">Rider</th>
                    <th className="px-3 py-3">Komunitas</th>
                    <th className="w-32 px-3 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {nextMotoRiders.map((row) => (
                    <tr key={`next-table-${row.rider_id}`} className="border-t border-slate-100">
                      <td className="px-3 py-3 text-2xl font-black text-slate-900">{row.gate_position ?? '-'}</td>
                      <td className="px-3 py-3 text-lg font-black text-slate-800">{row.plate}</td>
                      <td className="px-3 py-3">
                        <div className="font-black text-slate-900">{nextMotoRiderDisplayName(row)}</div>
                        {row.rider_nickname?.trim() ? (
                          <div className="mt-0.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-500">
                            {row.rider_name}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 font-bold text-slate-600">{row.club || '-'}</td>
                      <td className="px-3 py-3 text-right">
                        <span
                          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] ${nextMotoStatusBadge(
                            row.status
                          )}`}
                        >
                          {nextMotoStatusLabel(row.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="grid gap-2 md:hidden">
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
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] ${nextMotoStatusBadge(
                      row.status
                    )}`}
                  >
                    {nextMotoStatusLabel(row.status)}
                  </span>
                </div>
                {row.penalty_total ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-amber-700">
                      Penalty +{row.penalty_total}
                    </span>
                    <PenaltyBadges items={row.penalty_breakdown} />
                  </div>
                ) : null}
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
        </section>
      </main>
    </div>
  )
}
