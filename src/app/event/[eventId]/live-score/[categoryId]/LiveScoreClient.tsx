'use client'

import { useEffect, useState } from 'react'
import { getEventById, type EventItem } from '../../../../../lib/eventService'
import Link from 'next/link'
import EmptyState from '../../../../../components/EmptyState'
import LoadingState from '../../../../../components/LoadingState'
import PublicTopbar from '../../../../../components/PublicTopbar'

type Row = {
  rider_id: string
  gate_moto1: number | null
  gate_moto2: number | null
  gate_moto3: number | null
  name: string
  no_plate: string
  club: string
  photo_thumbnail_url?: string | null
  point_moto1: number | null
  point_moto2: number | null
  point_moto3: number | null
  penalty_total: number | null
  total_point: number | null
  rank_point: number | null
  class_label?: string | null
}

type Batch = {
  batch_index: number
  moto1_id: string
  moto2_id: string | null
  moto3_id?: string | null
  rows: Row[]
}

type StageRow = {
  rider_id: string
  gate: number | null
  name: string
  no_plate: string
  club: string | null
  photo_thumbnail_url?: string | null
  point: number | null
  status: 'FINISH' | 'DNF' | 'DNS' | 'PENDING'
}

type StageGroup = {
  title: string
  moto_id: string
  rows: StageRow[]
}

export default function LiveScoreClient({ eventId, categoryId }: { eventId: string; categoryId: string }) {
  const [loading, setLoading] = useState(false)
  const [event, setEvent] = useState<EventItem | null>(null)
  const [categoryLabel, setCategoryLabel] = useState('')
  const [batches, setBatches] = useState<Batch[]>([])
  const [stages, setStages] = useState<StageGroup[]>([])
  const [sortMode, setSortMode] = useState<'GATE' | 'RANK'>('RANK')
  const [refreshing, setRefreshing] = useState(false)

  const loadLiveScore = async () => {
    const res = await fetch(
      `/api/public/events/${eventId}/live-score?category_id=${encodeURIComponent(categoryId)}&include_upcoming=1`
    )
    const json = await res.json()
    setCategoryLabel(json.data?.category ?? '')
    setBatches(json.data?.batches ?? [])
    setStages(json.data?.stages ?? [])
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const eventData = await getEventById(eventId)
        setEvent(eventData)
        await loadLiveScore()
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, categoryId])

  const refresh = async () => {
    setRefreshing(true)
    try {
      await loadLiveScore()
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    const interval = setInterval(() => {
      refresh()
    }, 10000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, categoryId])

  const business = event?.business_settings ?? null
  const publicEventTitle = business?.public_event_title?.trim() || event?.name || 'Live Score'
  const publicBrandName = business?.public_brand_name?.trim() || ''
  const publicTagline = business?.public_tagline?.trim() || ''
  const operatingCommitteeLabel = business?.operating_committee_label?.trim() || business?.operating_committee_name?.trim() || ''
  const scoringSupportLabel = business?.scoring_support_label?.trim() || business?.scoring_support_name?.trim() || ''
  const showOperatingCommittee = Boolean(business?.show_operating_committee_publicly && operatingCommitteeLabel)
  const showScoringSupport = Boolean(business?.show_scoring_support_publicly && scoringSupportLabel)

  const riderPhotoCell = (name: string, noPlate: string, photoUrl?: string | null) => {
    if (photoUrl) {
      return (
        <img
          src={photoUrl}
          alt={name}
          className="h-9 w-9 rounded-full border border-slate-300 object-cover"
          loading="lazy"
        />
      )
    }
    return (
      <div className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-[10px] font-black text-slate-700">
        {noPlate || '-'}
      </div>
    )
  }

  return (
    <div className="public-page">
      <PublicTopbar />
      <main className="public-main">
        <section className="public-hero">
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-amber-400/15 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
          <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
            <div className="grid gap-2">
              <Link
                href={`/event/${eventId}#race-categories`}
                className="inline-flex w-fit items-center rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.12em] text-white transition-colors hover:bg-white/20"
              >
                Back to Race Categories
              </Link>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-amber-300">{publicBrandName || 'Live Score'}</p>
              <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">{publicEventTitle}</h1>
              <p className="text-sm font-semibold text-slate-200 sm:text-base">{categoryLabel || 'Category'}</p>
              {(publicTagline || showOperatingCommittee || showScoringSupport) && (
                <div className="grid gap-2">
                  {publicTagline && <p className="text-sm font-semibold text-slate-300">{publicTagline}</p>}
                  <div className="flex flex-wrap gap-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-300">
                    {showOperatingCommittee && <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">Operator: {operatingCommitteeLabel}</span>}
                    {showScoringSupport && <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">Scoring: {scoringSupportLabel}</span>}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(['GATE', 'RANK'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSortMode(mode)}
                  className={`rounded-full border px-3 py-2 text-xs font-extrabold uppercase tracking-[0.12em] transition-colors sm:text-sm ${
                    sortMode === mode
                      ? 'border-amber-300 bg-amber-400 text-white'
                      : 'border-white/25 bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  Sort {mode}
                </button>
              ))}
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                className="rounded-full border border-emerald-300/70 bg-emerald-50 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.12em] text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70 sm:text-sm"
              >
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>
        </section>

        {loading && <LoadingState />}
        {!loading && batches.length === 0 && <EmptyState label="Belum ada batch." />}

        <section className="grid gap-4">
          {batches.map((batch) => {
            const rows =
              sortMode === 'RANK'
                ? [...batch.rows].sort((a, b) => (a.rank_point ?? 9999) - (b.rank_point ?? 9999))
                : [...batch.rows].sort((a, b) => (a.gate_moto1 ?? 9999) - (b.gate_moto1 ?? 9999))
            return (
              <article key={batch.batch_index} className="public-panel-dark">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-lg font-black uppercase tracking-[0.08em] text-white">
                    Batch {batch.batch_index}
                  </h2>
                  <span className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-200">
                    Kualifikasi Moto
                  </span>
                </div>
                <div className="table-mobile-hint">Geser kiri/kanan untuk lihat semua kolom.</div>
                <div className="public-table-wrap">
                  <table className="public-table min-w-[860px] text-[11px] sm:text-xs md:text-sm">
                    <thead>
                      <tr>
                        {[
                          'Gate M1',
                          'Gate M2',
                          'Gate M3',
                          'Foto',
                          'Nama Peserta',
                          'No Plat',
                          'Komunitas',
                          'Point M1',
                          'Point M2',
                          'Point M3',
                          'Penalty',
                          'Total',
                          'Rank',
                          'Class',
                        ].map((h) => (
                          <th key={h} className="whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.rider_id}>
                          <td>{row.gate_moto1 ?? '-'}</td>
                          <td>{row.gate_moto2 ?? '-'}</td>
                          <td>{row.gate_moto3 ?? '-'}</td>
                          <td>{riderPhotoCell(row.name, row.no_plate, row.photo_thumbnail_url)}</td>
                          <td className="whitespace-nowrap font-extrabold text-slate-900">{row.name}</td>
                          <td>{row.no_plate}</td>
                          <td className="whitespace-nowrap">{row.club || '-'}</td>
                          <td>{row.point_moto1 ?? '-'}</td>
                          <td>{row.point_moto2 ?? '-'}</td>
                          <td>{row.point_moto3 ?? '-'}</td>
                          <td className="font-extrabold text-amber-600">{row.penalty_total ?? '-'}</td>
                          <td className="font-extrabold text-sky-700">{row.total_point ?? '-'}</td>
                          <td className="font-extrabold text-emerald-700">{row.rank_point ?? '-'}</td>
                          <td className="whitespace-nowrap">{row.class_label || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            )
          })}
        </section>

        {stages.length > 0 && (
          <section className="grid gap-4">
            {stages.map((stage) => (
              <article key={stage.moto_id} className="public-panel-dark">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-lg font-black uppercase tracking-[0.08em] text-white">{stage.title}</h2>
                  <span className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-200">
                    Advanced Stage
                  </span>
                </div>
                <div className="table-mobile-hint">Geser kiri/kanan untuk lihat semua kolom.</div>
                <div className="public-table-wrap">
                  <table className="public-table min-w-[680px] text-[11px] sm:text-xs md:text-sm">
                    <thead>
                      <tr>
                        {['Gate', 'Foto', 'Nama Peserta', 'No Plat', 'Komunitas', 'Point', 'Status'].map((h) => (
                          <th key={h} className="whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stage.rows.map((row) => (
                        <tr key={row.rider_id}>
                          <td>{row.gate ?? '-'}</td>
                          <td>{riderPhotoCell(row.name, row.no_plate, row.photo_thumbnail_url)}</td>
                          <td className="whitespace-nowrap font-extrabold text-slate-900">{row.name}</td>
                          <td>{row.no_plate}</td>
                          <td className="whitespace-nowrap">{row.club || '-'}</td>
                          <td className="font-extrabold text-sky-700">{row.point ?? '-'}</td>
                          <td className="whitespace-nowrap font-extrabold">{row.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  )
}
