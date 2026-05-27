'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../../../../../components/EmptyState'
import LoadingState from '../../../../../components/LoadingState'
import PublicTopbar from '../../../../../components/PublicTopbar'
import { getEventById, getEventCategories, type EventItem, type RiderCategory } from '../../../../../lib/eventService'

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
  moto1_status?: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING' | null
  moto2_status?: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING' | null
  moto3_status?: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING' | null
  penalty_total: number | null
  total_point: number | null
  rank_point: number | null
  status: 'FINISHED' | 'DNF' | 'DNS' | 'PENDING' | 'DQ'
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
  penalty_total: number | null
  rank: number | null
  status: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING'
  next_class_label?: string | null
}

type StageGroup = {
  title: string
  moto_id: string
  rows: StageRow[]
}

const finalStageDisplayOrder: Record<string, number> = {
  AMATEUR: 0,
  ACADEMY: 1,
  ROOKIE: 2,
  PRO: 3,
  NOVICE: 4,
  ELITE: 5,
  ADVANCED: 6,
  BEGINNER: 7,
}

const getStageGroupSortKey = (title: string) => {
  const normalized = title.trim().toUpperCase()
  if (normalized.startsWith('REPECHAGE')) return { stageOrder: 0, finalOrder: 0, heatOrder: normalized }
  if (normalized.startsWith('QUARTER FINAL')) return { stageOrder: 1, finalOrder: 0, heatOrder: normalized }
  if (normalized.startsWith('SEMI FINAL')) return { stageOrder: 2, finalOrder: 0, heatOrder: normalized }
  if (normalized.startsWith('FINAL ')) {
    const finalClass = normalized.replace(/^FINAL\s+/, '').trim()
    return {
      stageOrder: 3,
      finalOrder: finalStageDisplayOrder[finalClass] ?? 999,
      heatOrder: finalClass,
    }
  }
  return { stageOrder: 9, finalOrder: 999, heatOrder: normalized }
}

const isFinalStageTitle = (title: string) => title.trim().toUpperCase().startsWith('FINAL ')

const statusBadgeClass = (status: string) => {
  switch (status) {
    case 'DNF':
      return 'border-amber-300 bg-amber-50 text-amber-700'
    case 'DNS':
      return 'border-rose-300 bg-rose-50 text-rose-700'
    case 'DQ':
      return 'border-red-400 bg-red-100 text-red-800'
    case 'PENDING':
      return 'border-slate-300 bg-slate-100 text-slate-600'
    default:
      return 'border-emerald-300 bg-emerald-50 text-emerald-700'
  }
}

const renderMotoResultCell = (
  point: number | null,
  status?: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING' | null
) => {
  const normalized = (status ?? 'PENDING').toUpperCase()
  if (normalized === 'DNF' || normalized === 'DNS' || normalized === 'DQ') {
    return (
      <div className="flex flex-col items-start gap-1">
        <span
          className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${statusBadgeClass(
            normalized
          )}`}
        >
          {normalized}
        </span>
        {point !== null ? <span className="text-[10px] font-black text-slate-500">{point}</span> : null}
      </div>
    )
  }
  return point ?? '-'
}

const renderSortButtons = (
  sortMode: 'GATE' | 'RANK',
  setSortMode: (mode: 'GATE' | 'RANK') => void
) => (
  <div className="flex flex-wrap items-center gap-2">
    {(['GATE', 'RANK'] as const).map((mode) => (
      <button
        key={mode}
        type="button"
        onClick={() => setSortMode(mode)}
        className={`rounded-full border px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.12em] transition-colors sm:text-xs ${
          sortMode === mode
            ? 'border-amber-300 bg-amber-400 text-white'
            : 'border-white/25 bg-white/10 text-white hover:bg-white/20'
        }`}
      >
        Sort {mode}
      </button>
    ))}
  </div>
)

export default function LiveScoreClient({ eventId, categoryId }: { eventId: string; categoryId: string }) {
  const [loading, setLoading] = useState(false)
  const [event, setEvent] = useState<EventItem | null>(null)
  const [categories, setCategories] = useState<RiderCategory[]>([])
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
        const [eventData, categoryData] = await Promise.all([
          getEventById(eventId),
          getEventCategories(eventId),
        ])
        setEvent(eventData)
        setCategories(categoryData.filter((category) => category.enabled))
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
  const mcName = business?.mc_name?.trim() || ''
  const showOperatingCommittee = Boolean(
    business?.show_operating_committee_publicly && operatingCommitteeLabel
  )
  const showScoringSupport = Boolean(
    business?.show_scoring_support_publicly && scoringSupportLabel
  )
  const showMc = Boolean(business?.show_mc_publicly && mcName)

  const sortedCategories = useMemo(() => {
    const genderOrder = { BOY: 0, GIRL: 1, MIX: 2 } as const
    return [...categories].sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year
      return genderOrder[a.gender] - genderOrder[b.gender]
    })
  }, [categories])

  const currentCategoryIndex = useMemo(
    () => sortedCategories.findIndex((category) => category.id === categoryId),
    [categoryId, sortedCategories]
  )

  const nextCategory = currentCategoryIndex >= 0 ? sortedCategories[currentCategoryIndex + 1] ?? null : null

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
  const showMoto3 = batches.length <= 1
  const showQualificationNextColumn = tableRowsByBatch.some((batch) =>
    batch.rows.some((row) => Boolean(row.class_label?.trim()))
  )
  const sortedStages = useMemo(
    () =>
      [...stages]
        .map((stage) => ({
          ...stage,
          rows: [...stage.rows].sort((a, b) => {
            if (sortMode === 'GATE') {
              const aGate = a.gate ?? Number.MAX_SAFE_INTEGER
              const bGate = b.gate ?? Number.MAX_SAFE_INTEGER
              if (aGate !== bGate) return aGate - bGate
              const aRank = a.rank ?? Number.MAX_SAFE_INTEGER
              const bRank = b.rank ?? Number.MAX_SAFE_INTEGER
              if (aRank !== bRank) return aRank - bRank
              return a.name.localeCompare(b.name)
            }

            const aRank = a.rank ?? Number.MAX_SAFE_INTEGER
            const bRank = b.rank ?? Number.MAX_SAFE_INTEGER
            if (aRank !== bRank) return aRank - bRank
            const aGate = a.gate ?? Number.MAX_SAFE_INTEGER
            const bGate = b.gate ?? Number.MAX_SAFE_INTEGER
            if (aGate !== bGate) return aGate - bGate
            return a.name.localeCompare(b.name)
          }),
        }))
        .sort((a, b) => {
          const keyA = getStageGroupSortKey(a.title)
          const keyB = getStageGroupSortKey(b.title)
          if (keyA.stageOrder !== keyB.stageOrder) return keyA.stageOrder - keyB.stageOrder
          if (keyA.finalOrder !== keyB.finalOrder) return keyA.finalOrder - keyB.finalOrder
          return keyA.heatOrder.localeCompare(keyB.heatOrder, undefined, { numeric: true })
        }),
    [sortMode, stages]
  )

  return (
    <div className="public-page">
      <PublicTopbar theme="dark" />
      <main className="public-main">
        <section className="public-hero !rounded-[28px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
          <div className="pointer-events-none absolute -bottom-16 -left-12 h-56 w-56 rounded-full bg-amber-400/15 blur-3xl sm:h-64 sm:w-64" />
          <div className="pointer-events-none absolute -top-20 right-0 h-56 w-56 rounded-full bg-sky-400/15 blur-3xl sm:h-64 sm:w-64" />
          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="grid gap-2 sm:gap-2.5">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/event/${eventId}#race-categories`}
                  className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-amber-300 bg-amber-400 px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-slate-950 shadow-[0_14px_32px_rgba(251,191,36,0.28)] transition-transform transition-colors hover:-translate-y-0.5 hover:bg-amber-300"
                >
                  Back to Categories
                </Link>
                {nextCategory ? (
                  <Link
                    href={`/event/${eventId}/live-score/${nextCategory.id}`}
                    className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-white/25 bg-white/12 px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_14px_32px_rgba(15,23,42,0.22)] transition-transform transition-colors hover:-translate-y-0.5 hover:bg-white/18"
                  >
                    Next Category: {nextCategory.label}
                  </Link>
                ) : (
                  <span className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-white/20 bg-white/8 px-4 py-3 text-sm font-black uppercase tracking-[0.12em] text-slate-300">
                    Last Category
                  </span>
                )}
              </div>
              <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-amber-300">
                {publicBrandName || 'Live Score'}
              </p>
              <h1 className="max-w-4xl text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-[3.2rem] lg:leading-none">
                {publicEventTitle}
              </h1>
              <p className="text-sm font-semibold text-slate-200 sm:text-base">
                {categoryLabel || 'Category'}
              </p>
              {(publicTagline || showOperatingCommittee || showScoringSupport || showMc) && (
                <div className="grid gap-2">
                  {publicTagline && <p className="text-sm font-semibold text-slate-300 sm:text-[15px]">{publicTagline}</p>}
                  <div className="flex flex-wrap gap-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-300 sm:text-[11px]">
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
                    {showMc && (
                      <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">MC: {mcName}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:max-w-[420px] lg:justify-end">
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
        {!loading && batches.length === 0 && stages.length === 0 && (
  <EmptyState label="Belum ada data." />
)}

        <section className="grid gap-4">
  {tableRowsByBatch.length === 0 && !loading && (
    <article className="public-panel-dark">
      <p className="text-slate-400 text-sm text-center py-8">Belum ada batch tersedia.</p>
    </article>
  )}
          {tableRowsByBatch.map((batch) => (
            <article key={batch.batch_index} className="public-panel-dark">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black uppercase tracking-[0.08em] text-white">
                    Batch {batch.batch_index}
                  </h2>
                  <span className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-200">
                    Kualifikasi Moto
                  </span>
                </div>
                {renderSortButtons(sortMode, setSortMode)}
              </div>
              <div className="table-mobile-hint">
                Geser kiri/kanan untuk lihat semua kolom.
              </div>
              <div className="public-table-wrap">
                <table className="public-table min-w-[940px] text-[11px] sm:text-xs md:text-sm">
                  <thead>
                    <tr>
                        {[
                          'Gate M1',
                          'Gate M2',
                          ...(showMoto3 ? ['Gate M3'] : []),
                          'Foto',
                          'Nama Peserta',
                          'No Plat',
                          'Komunitas',
                          'Point M1',
                          'Point M2',
                          ...(showMoto3 ? ['Point M3'] : []),
                          'Penalty',
                          'Total',
                          'Rank',
                          ...(showQualificationNextColumn ? ['Next'] : []),
                        ].map((h) => (
                        <th key={h} className="whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {batch.rows.map((row) => (
                      <tr key={row.rider_id}>
                        <td>{row.gate_moto1 ?? '-'}</td>
                        <td>{row.gate_moto2 ?? '-'}</td>
                        {showMoto3 && <td>{row.gate_moto3 ?? '-'}</td>}
                        <td>{riderPhotoCell(row.name, row.no_plate, row.photo_thumbnail_url)}</td>
                        <td className="whitespace-nowrap font-extrabold text-slate-900">{row.name}</td>
                        <td>{row.no_plate}</td>
                        <td className="whitespace-nowrap">{row.club || '-'}</td>
                        <td>{renderMotoResultCell(row.point_moto1, row.moto1_status)}</td>
                        <td>{renderMotoResultCell(row.point_moto2, row.moto2_status)}</td>
                        {showMoto3 && <td>{renderMotoResultCell(row.point_moto3, row.moto3_status)}</td>}
                        <td className="font-extrabold text-amber-600">{row.penalty_total ?? '-'}</td>
                        <td className="font-extrabold text-sky-700">{row.total_point ?? '-'}</td>
                        <td className="font-extrabold text-emerald-700">
                          <div className="flex flex-col gap-1">
                            <span>{row.rank_point ?? '-'}</span>
                            {(row.status === 'DQ' || row.status === 'PENDING') && (
                              <span
                                className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${statusBadgeClass(row.status)}`}
                              >
                                {row.status}
                              </span>
                            )}
                          </div>
                        </td>
                        {showQualificationNextColumn && <td className="whitespace-nowrap">{row.class_label || '-'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>

        {sortedStages.length > 0 && (
          <section className="grid gap-4">
            {sortedStages.map((stage) => (
              <article key={stage.moto_id} className="public-panel-dark">
                {(() => {
                  const showStageNextColumn = !isFinalStageTitle(stage.title)
                  return (
                    <>
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black uppercase tracking-[0.08em] text-white">{stage.title}</h2>
                    <span className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-200">
                      Advanced Stage
                    </span>
                  </div>
                  {renderSortButtons(sortMode, setSortMode)}
                </div>
                <div className="table-mobile-hint">Geser kiri/kanan untuk lihat semua kolom.</div>
                <div className="public-table-wrap">
                  <table className="public-table min-w-[680px] text-[11px] sm:text-xs md:text-sm">
                    <thead>
                      <tr>
                        {['Gate', 'Foto', 'Nama Peserta', 'No Plat', 'Komunitas', 'Point', 'Penalty', 'Rank', ...(showStageNextColumn ? ['Next'] : [])].map((h) => (
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
                          <td className="font-extrabold text-amber-600">{row.penalty_total ?? '-'}</td>
                          <td className="whitespace-nowrap font-extrabold text-emerald-700">
                            <div className="flex flex-col gap-1">
                              <span>{row.rank ?? '-'}</span>
                              {row.status !== 'FINISH' && (
                                <span
                                  className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${statusBadgeClass(row.status)}`}
                                >
                                  {row.status}
                                </span>
                              )}
                            </div>
                          </td>
                          {showStageNextColumn && <td className="whitespace-nowrap">{row.next_class_label || '-'}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                    </>
                  )
                })()}
              </article>
            ))}
          </section>
        )}
      </main>

    </div>
  )
}
