'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../../../../../components/EmptyState'
import LoadingState from '../../../../../components/LoadingState'
import PublicTopbar from '../../../../../components/PublicTopbar'
import ResultStoryCard, {
  generateResultStoryCardPngBlob,
  getPodiumBadge,
  getResultStoryCardFilename,
  type ResultStoryCardData,
} from '../../../../../components/ResultStoryCard'
import { getEventById, type EventItem } from '../../../../../lib/eventService'

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
  const [storyData, setStoryData] = useState<ResultStoryCardData | null>(null)
  const [storyDownloading, setStoryDownloading] = useState(false)

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
  const operatingCommitteeLabel =
    business?.operating_committee_label?.trim() || business?.operating_committee_name?.trim() || ''
  const scoringSupportLabel =
    business?.scoring_support_label?.trim() || business?.scoring_support_name?.trim() || ''
  const showOperatingCommittee = Boolean(
    business?.show_operating_committee_publicly && operatingCommitteeLabel
  )
  const showScoringSupport = Boolean(
    business?.show_scoring_support_publicly && scoringSupportLabel
  )

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

  const createStoryData = (row: Row): ResultStoryCardData => ({
    eventTitle: publicEventTitle,
    eventBrand: publicBrandName || publicEventTitle,
    eventDate: event?.event_date ?? null,
    eventLocation: event?.location ?? null,
    categoryLabel: categoryLabel || 'Category',
    classLabel: row.class_label ?? null,
    riderName: row.name,
    plateNumber: row.no_plate,
    rankNumber: row.rank_point ?? null,
    totalPoint: row.total_point ?? null,
    statusLabel: 'Official Result',
    operatorLabel: operatingCommitteeLabel || null,
    scoringSupportLabel: scoringSupportLabel || null,
  })

  const downloadStoryCard = async (data: ResultStoryCardData) => {
    setStoryDownloading(true)
    try {
      const pngBlob = await generateResultStoryCardPngBlob(data)
      const pngUrl = URL.createObjectURL(pngBlob)
      const link = document.createElement('a')
      link.href = pngUrl
      link.download = `${getResultStoryCardFilename(data)}.png`
      link.click()
      URL.revokeObjectURL(pngUrl)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal download story card.')
    } finally {
      setStoryDownloading(false)
    }
  }


  const tableRowsByBatch = useMemo(
    () =>
      batches.map((batch) => ({
        ...batch,
        rows:
          sortMode === 'RANK'
            ? [...batch.rows].sort((a, b) => (a.rank_point ?? 9999) - (b.rank_point ?? 9999))
            : [...batch.rows].sort((a, b) => (a.gate_moto1 ?? 9999) - (b.gate_moto1 ?? 9999)),
      })),
    [batches, sortMode]
  )

  return (
    <div className="public-page">
      <PublicTopbar theme="dark" />
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
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-amber-300">
                {publicBrandName || 'Live Score'}
              </p>
              <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">
                {publicEventTitle}
              </h1>
              <p className="text-sm font-semibold text-slate-200 sm:text-base">
                {categoryLabel || 'Category'}
              </p>
              {(publicTagline || showOperatingCommittee || showScoringSupport) && (
                <div className="grid gap-2">
                  {publicTagline && <p className="text-sm font-semibold text-slate-300">{publicTagline}</p>}
                  <div className="flex flex-wrap gap-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-300">
                    {showOperatingCommittee && (
                      <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
                        Operating Committee: {operatingCommitteeLabel}
                      </span>
                    )}
                    {showScoringSupport && (
                      <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
                        Scoring Support: {scoringSupportLabel}
                      </span>
                    )}
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
          {tableRowsByBatch.map((batch) => (
            <article key={batch.batch_index} className="public-panel-dark">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-lg font-black uppercase tracking-[0.08em] text-white">
                  Batch {batch.batch_index}
                </h2>
                <span className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-200">
                  Kualifikasi Moto
                </span>
              </div>
              <div className="table-mobile-hint">
                Geser kiri/kanan untuk lihat semua kolom. Tap Story Card untuk bikin PNG rider.
              </div>
              <div className="public-table-wrap">
                <table className="public-table min-w-[1040px] text-[11px] sm:text-xs md:text-sm">
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
                        'Share',
                      ].map((h) => (
                        <th key={h} className="whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {batch.rows.map((row) => {
                      const podiumBadge = getPodiumBadge(row.rank_point)
                      return (
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
                          <td>
                            <div className="grid gap-1">
                              <span className="font-extrabold text-emerald-700">{row.rank_point ?? '-'}</span>
                              {podiumBadge && (
                                <span className="inline-flex w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-amber-700">
                                  {podiumBadge}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="whitespace-nowrap">{row.class_label || '-'}</td>
                          <td>
                            <button
                              type="button"
                              onClick={() => setStoryData(createStoryData(row))}
                              className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-amber-700 transition-colors hover:bg-amber-100 sm:text-xs"
                            >
                              Story Card
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
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
                          <th key={h} className="whitespace-nowrap">
                            {h}
                          </th>
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

      {storyData && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(15,23,42,0.74)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
          }}
          onClick={() => setStoryData(null)}
        >
          <div
            style={{
              width: 'min(100%, 920px)',
              maxHeight: 'calc(100vh - 40px)',
              overflow: 'auto',
              background: '#fff',
              borderRadius: 24,
              padding: 20,
              display: 'grid',
              gap: 18,
              boxShadow: '0 24px 80px rgba(15,23,42,0.32)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 22, fontWeight: 950 }}>Share Result Story</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>
                  Download PNG untuk upload manual ke WhatsApp Story atau Instagram Story.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStoryData(null)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '2px solid #111',
                  background: '#fff',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>

            <div
              className="story-preview-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 360px) minmax(0, 1fr)',
                gap: 20,
                alignItems: 'start',
              }}
            >
              <ResultStoryCard data={storyData} />
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ padding: 14, borderRadius: 16, border: '2px solid #111', background: '#f8fafc' }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 900,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: '#475569',
                    }}
                  >
                    Story Info
                  </div>
                  <div style={{ marginTop: 10, display: 'grid', gap: 6, fontWeight: 800 }}>
                    <div>Rider: {storyData.riderName}</div>
                    <div>Category: {storyData.categoryLabel}</div>
                    <div>Class: {storyData.classLabel || '-'}</div>
                    <div>Rank: {storyData.rankNumber != null ? `#${storyData.rankNumber}` : '-'}</div>
                    <div>Total Point: {storyData.totalPoint ?? '-'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => downloadStoryCard(storyData)}
                    disabled={storyDownloading}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 12,
                      border: '2px solid #111',
                      background: '#fbbf24',
                      color: '#111',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    {storyDownloading ? 'Generating PNG...' : 'Download PNG'}
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Direct share sedang disiapkan"
                    style={{
                      padding: '12px 16px',
                      borderRadius: 12,
                      border: '2px solid #cbd5e1',
                      background: '#f8fafc',
                      color: '#64748b',
                      fontWeight: 900,
                      cursor: 'not-allowed',
                      opacity: 0.75,
                    }}
                  >
                    Share Soon
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @media (max-width: 860px) {
          .story-preview-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
