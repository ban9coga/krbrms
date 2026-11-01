'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import EmptyState from '../../../../../components/EmptyState'
import LoadingState from '../../../../../components/LoadingState'
import PublicTopbar from '../../../../../components/PublicTopbar'
import RiderNotificationButton from '../../../../../components/RiderNotificationButton'
import { type EventItem, type RiderCategory } from '../../../../../lib/eventService'
import { FINAL_MOTO_DISPLAY_ORDER } from '../../../../../lib/motoDisplayOrder'
import { usePublicLiveScoreRealtime } from '../../../../../hooks/usePublicLiveScoreRealtime'

type Row = {
  rider_id: string
  assigned_moto1?: boolean
  assigned_moto2?: boolean
  assigned_moto3?: boolean
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
  penalty_moto1: number | null
  penalty_moto2: number | null
  penalty_moto3: number | null
  total_point_moto1: number | null
  total_point_moto2: number | null
  total_point_moto3: number | null
  moto1_status?: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING' | null
  moto2_status?: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING' | null
  moto3_status?: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING' | null
  penalty_total: number | null
  total_point?: number | null
  rank_point: number | null
  status: 'FINISHED' | 'DNF' | 'DNS' | 'PENDING' | 'DQ'
  class_label?: string | null
}

type Batch = {
  batch_index: number
  moto1_id: string
  moto2_id: string | null
  moto3_id?: string | null
  moto1_status?: string | null
  moto2_status?: string | null
  moto3_status?: string | null
  rows: Row[]
}

type RotatingMotoRow = {
  rider_id: string
  name: string
  no_plate: string
  club: string
  photo_thumbnail_url?: string | null
  gate: number | null
  point: number | null
  penalty: number | null
  total_point: number | null
  status: NonNullable<Row['moto1_status']>
}

type RotatingMotoBatch = {
  batch_index: number
  moto_id: string
  status: string | null
  rows: RotatingMotoRow[]
}

type RotatingMotoView = {
  index: number
  title: string
  status: string | null
  batches: RotatingMotoBatch[]
}

type QualificationOverallRow = {
  rider_id: string
  name: string
  no_plate: string
  rank: number
  total_point: number | null
  next_class_label: string | null
  total_point_moto1?: number | null
  total_point_moto2?: number | null
  total_point_moto3?: number | null
}

type QualificationStandingRow = QualificationOverallRow & {
  displayRank: number | null
  hasRecordedResult: boolean
  isDisqualified: boolean
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
  total_point?: number | null
  rank: number | null
  status: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING'
  next_class_label?: string | null
}

type StageGroup = {
  title: string
  moto_id: string
  status?: string | null
  rows: StageRow[]
}

export type LiveScoreData = {
  category?: string
  qualification_batch_mode?: 'FIXED' | 'ROTATE_EACH_MOTO'
  qualification_split_basis?: string | null
  qualification_has_finisher_outcome?: boolean
  qualification_advancements_calculated?: boolean
  qualification_results_official?: boolean
  qualification_h2h_pending_count?: number
  qualification_h2h_applied_count?: number
  qualification_overall_rows?: QualificationOverallRow[]
  batches?: Batch[]
  stages?: StageGroup[]
}

const finalStageDisplayOrder = FINAL_MOTO_DISPLAY_ORDER

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

const getStageTabLabel = (title: string) => {
  const trimmed = title.trim()
  if (/^repechage\b/i.test(trimmed)) return 'Repechage'
  if (/^quarter\s*final\b/i.test(trimmed)) return 'Quarter Final'
  if (/^semi\s*final\b/i.test(trimmed)) return 'Semifinal'
  const finalMatch = trimmed.match(/^final\s+(.+)$/i)
  if (finalMatch) return `Final ${finalMatch[1].trim()}`
  return trimmed.replace(/\s*-\s*(?:batch|heat)\s*\d+\s*$/i, '').trim()
}
const PUBLIC_LIVE_SCORE_FALLBACK_REFRESH_INTERVAL_MS = 120000

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

const formatMotoStatusLabel = (status?: string | null) => {
  switch (String(status ?? '').toUpperCase()) {
    case 'PROVISIONAL': return 'SEMENTARA'
    case 'PROTEST_REVIEW': return 'PROTES'
    case 'FINISHED': return 'SELESAI'
    case 'LOCKED': return 'TERKUNCI'
    default: return String(status ?? 'UPCOMING').toUpperCase()
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

const renderStagePointCell = (
  point: number | null,
  status?: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING' | null
) => {
  const normalized = status ?? 'PENDING'
  if (normalized === 'DNF' || normalized === 'DNS' || normalized === 'DQ') {
    return (
      <div className="flex flex-col gap-1">
        <span>{point ?? '-'}</span>
        <span
          className={`inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${statusBadgeClass(normalized)}`}
        >
          {normalized}
        </span>
      </div>
    )
  }
  return point ?? '-'
}

const renderGateBadge = (gate: number | null) => {
  if (gate === null) return '-'

  return (
    <span
      aria-label={`Gate ${gate}`}
      className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-slate-300 bg-slate-100 px-1 text-[10px] font-black text-slate-800"
    >
      {gate}
    </span>
  )
}

const renderRankBadge = (rank: number | null) => {
  const podiumStyle = rank === 1
    ? 'border-amber-500 bg-amber-300 text-amber-950'
    : rank === 2
      ? 'border-slate-400 bg-slate-200 text-slate-800'
      : rank === 3
        ? 'border-orange-500 bg-orange-300 text-orange-950'
        : 'border-slate-300 bg-slate-100 text-slate-800'

  return (
    <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-black leading-none ${podiumStyle}`}>
      {rank ?? '-'}
    </span>
  )
}

const renderSortButtons = (
  sortMode: 'GATE' | 'RANK',
  setSortMode: (mode: 'GATE' | 'RANK') => void,
  rankLabel = 'Peringkat'
) => (
  <div className="live-score-editorial-sort flex flex-wrap items-center gap-2">
    {(['GATE', 'RANK'] as const).map((mode) => (
      <button
        key={mode}
        type="button"
        onClick={() => setSortMode(mode)}
        aria-label={`Urutkan berdasarkan ${mode === 'RANK' ? rankLabel : 'Gate'}`}
        aria-pressed={sortMode === mode}
        title={`Urutkan berdasarkan ${mode === 'RANK' ? rankLabel : 'Gate'}`}
        className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
          sortMode === mode
            ? 'border-amber-300 bg-amber-400 text-white'
            : 'border-white/25 bg-white/10 text-white hover:bg-white/20'
        }`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-4">
          {mode === 'GATE' ? (
            <>
              <path d="M4 20V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14M4 9h16M4 14h16M9 4v16M15 4v16" />
            </>
          ) : (
            <>
              <path d="M7 4v16m0-16L4 7m3-3 3 3M13 6h7M13 12h7M13 18h7" />
            </>
          )}
        </svg>
      </button>
    ))}
  </div>
)

const renderRefreshButton = (refresh: () => void, refreshing: boolean, enabled: boolean) => {
  if (!enabled) return null

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={refreshing || !enabled}
      aria-label={refreshing ? 'Sedang memuat ulang hasil' : 'Muat ulang hasil terbaru'}
      aria-busy={refreshing}
      title={refreshing ? 'Sedang memuat ulang hasil' : 'Muat ulang hasil terbaru'}
      className="live-score-editorial-refresh inline-flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-70"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`size-4 ${refreshing ? 'animate-spin' : ''}`}>
        <path d="M20 11a8 8 0 0 0-14.9-3L3 11m0-4v4h4M4 13a8 8 0 0 0 14.9 3L21 13m0 4v-4h-4" />
      </svg>
    </button>
  )
}


type LiveScoreClientProps = {
  eventId: string
  categoryId: string
  initialEvent: EventItem | null
  initialCategories: RiderCategory[]
  initialLiveScore: LiveScoreData | null
}

export default function LiveScoreClient({
  eventId,
  categoryId,
  initialEvent,
  initialCategories,
  initialLiveScore,
}: LiveScoreClientProps) {
  const [loading, setLoading] = useState(!initialEvent && !initialLiveScore)
  const [event] = useState<EventItem | null>(initialEvent)
  const [categories] = useState<RiderCategory[]>(initialCategories.filter((category) => category.enabled))
  const [categoryLabel, setCategoryLabel] = useState(initialLiveScore?.category ?? '')
  const [qualificationSplitBasis, setQualificationSplitBasis] = useState(initialLiveScore?.qualification_split_basis ?? null)
  const [qualificationHasFinisherOutcome, setQualificationHasFinisherOutcome] = useState(initialLiveScore?.qualification_has_finisher_outcome ?? false)
  const [qualificationAdvancementsCalculated, setQualificationAdvancementsCalculated] = useState(
    initialLiveScore?.qualification_advancements_calculated ?? false
  )
  const [qualificationResultsOfficial, setQualificationResultsOfficial] = useState(
    initialLiveScore?.qualification_results_official ?? false
  )
  const [qualificationH2HPendingCount, setQualificationH2HPendingCount] = useState(
    initialLiveScore?.qualification_h2h_pending_count ?? 0
  )
  const [qualificationBatchMode, setQualificationBatchMode] = useState(
    initialLiveScore?.qualification_batch_mode ?? 'FIXED'
  )
  const [qualificationOverallRows, setQualificationOverallRows] = useState<QualificationOverallRow[]>(
    initialLiveScore?.qualification_overall_rows ?? []
  )
  const [batches, setBatches] = useState<Batch[]>(initialLiveScore?.batches ?? [])
  const [stages, setStages] = useState<StageGroup[]>(initialLiveScore?.stages ?? [])
  const [sortMode, setSortMode] = useState<'GATE' | 'RANK'>('RANK')
  const [selectedRotatingView, setSelectedRotatingView] = useState<string | null>(null)
  const [selectedFixedStageView, setSelectedFixedStageView] = useState('AUTO')
  const [refreshing, setRefreshing] = useState(false)
  const refreshInFlightRef = useRef(false)
  const refreshQueuedRef = useRef(false)
  const business = event?.business_settings ?? null
  const canShowUpcomingMotos = event?.status === 'LIVE' || event?.status === 'UPCOMING'
  const canRefreshPublicScore = canShowUpcomingMotos
  const canSubscribeToScoreChanges = Boolean(event)
  const showRiderPhotos =
    typeof business?.show_rider_photos_public === 'boolean' ? business.show_rider_photos_public : false

  const loadLiveScore = async () => {
    const params = new URLSearchParams({
      category_id: categoryId,
      include_upcoming: canShowUpcomingMotos ? '1' : '0',
      include_photos: showRiderPhotos ? '1' : '0',
    })
    const res = await fetch(
      `/api/public/events/${eventId}/live-score?${params.toString()}`,
      { cache: 'no-store' }
    )
    const json = await res.json()
    setCategoryLabel(json.data?.category ?? '')
    setQualificationSplitBasis(json.data?.qualification_split_basis ?? null)
    setQualificationHasFinisherOutcome(json.data?.qualification_has_finisher_outcome === true)
    setQualificationAdvancementsCalculated(json.data?.qualification_advancements_calculated ?? false)
    setQualificationResultsOfficial(json.data?.qualification_results_official ?? false)
    setQualificationH2HPendingCount(json.data?.qualification_h2h_pending_count ?? 0)
    setQualificationBatchMode(json.data?.qualification_batch_mode ?? 'FIXED')
    setQualificationOverallRows(json.data?.qualification_overall_rows ?? [])
    setBatches(json.data?.batches ?? [])
    setStages(json.data?.stages ?? [])
  }

  useEffect(() => {
    if (initialLiveScore) return
    const load = async () => {
      setLoading(true)
      try {
        await loadLiveScore()
      } finally {
        setLoading(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, categoryId])

  const refresh = async () => {
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true
      return
    }
    refreshInFlightRef.current = true
    setRefreshing(true)
    try {
      await loadLiveScore()
    } finally {
      refreshInFlightRef.current = false
      setRefreshing(false)
      if (refreshQueuedRef.current) {
        refreshQueuedRef.current = false
        window.setTimeout(() => void refresh(), 0)
      }
    }
  }

  usePublicLiveScoreRealtime({
    eventId,
    categoryId,
    enabled: canSubscribeToScoreChanges,
    refreshOnVisible: !canRefreshPublicScore,
    onScoreChanged: refresh,
  })

  useEffect(() => {
    if (!canRefreshPublicScore) return
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, PUBLIC_LIVE_SCORE_FALLBACK_REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, categoryId, canRefreshPublicScore])

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
      const aSequence = typeof a.sequence_order === 'number' ? a.sequence_order : null
      const bSequence = typeof b.sequence_order === 'number' ? b.sequence_order : null
      if (aSequence !== null || bSequence !== null) {
        return (aSequence ?? Number.MAX_SAFE_INTEGER) - (bSequence ?? Number.MAX_SAFE_INTEGER)
      }
      if (b.year !== a.year) return b.year - a.year
      return genderOrder[a.gender] - genderOrder[b.gender]
    })
  }, [categories])

  const currentCategoryIndex = useMemo(
    () => sortedCategories.findIndex((category) => category.id === categoryId),
    [categoryId, sortedCategories]
  )

  const nextCategory = currentCategoryIndex >= 0 ? sortedCategories[currentCategoryIndex + 1] ?? null : null

  const qualificationDisplayRows = useMemo<QualificationStandingRow[]>(() => {
    type StandingDraft = {
      rider_id: string
      name: string
      no_plate: string
      rank: number
      next_class_label: string | null
      fallbackTotalPoint: number | null
      fallbackMotoTotals: [number | null, number | null, number | null]
      motoPointTotals: [number | null, number | null, number | null]
      liveMotoTotals: [number | null, number | null, number | null]
      liveMotoAssigned: [boolean, boolean, boolean]
      liveMotoStatuses: [string | null, string | null, string | null]
      dynamicRank: number | null
      additionalPenalty: number
      hasRecordedResult: boolean
      isDisqualified: boolean
    }
    const standingsByRider = new Map<string, StandingDraft>()
    const getStanding = (riderId: string, name: string, noPlate: string) => {
      let standing = standingsByRider.get(riderId)
      if (!standing) {
        standing = {
          rider_id: riderId,
          name,
          no_plate: noPlate,
          rank: Number.MAX_SAFE_INTEGER,
          next_class_label: null,
          fallbackTotalPoint: null,
          fallbackMotoTotals: [null, null, null],
          motoPointTotals: [null, null, null],
          liveMotoTotals: [null, null, null],
          liveMotoAssigned: [false, false, false],
          liveMotoStatuses: [null, null, null],
          dynamicRank: null,
          additionalPenalty: 0,
          hasRecordedResult: false,
          isDisqualified: false,
        }
        standingsByRider.set(riderId, standing)
      }
      return standing
    }

    qualificationOverallRows.forEach((row) => {
      const standing = getStanding(row.rider_id, row.name, row.no_plate)
      standing.rank = row.rank
      standing.next_class_label = row.next_class_label
      standing.fallbackTotalPoint = row.total_point
      standing.fallbackMotoTotals = [
        row.total_point_moto1 ?? null,
        row.total_point_moto2 ?? null,
        row.total_point_moto3 ?? null,
      ]
      standing.hasRecordedResult = row.total_point !== null
    })

    batches.forEach((batch) => {
      batch.rows.forEach((row) => {
        const standing = getStanding(row.rider_id, row.name, row.no_plate)
        const assigned = [row.assigned_moto1, row.assigned_moto2, row.assigned_moto3]
        const points = [row.point_moto1, row.point_moto2, row.point_moto3]
        const motoTotals = [row.total_point_moto1, row.total_point_moto2, row.total_point_moto3]
        const statuses = [row.moto1_status, row.moto2_status, row.moto3_status]

        assigned.forEach((isAssigned, index) => {
          if (!isAssigned) return
          standing.liveMotoAssigned[index] = true
          standing.motoPointTotals[index] = points[index] ?? null
          standing.liveMotoTotals[index] = motoTotals[index] ?? null
          standing.liveMotoStatuses[index] = statuses[index] ?? 'PENDING'
        })

        const motoPenaltyTotal = motoTotals.reduce((sum, total, index) => {
          const point = points[index]
          return total !== null && total !== undefined && point !== null && point !== undefined
            ? sum + Math.max(0, total - point)
            : sum
        }, 0)
        standing.additionalPenalty = Math.max(
          standing.additionalPenalty,
          Math.max(0, (row.penalty_total ?? 0) - motoPenaltyTotal)
        )
        if (!qualificationAdvancementsCalculated && row.class_label?.trim()) {
          standing.next_class_label = row.class_label
        }
        if (row.rank_point !== null && row.rank_point !== undefined) {
          standing.dynamicRank = standing.dynamicRank === null
            ? row.rank_point
            : Math.min(standing.dynamicRank, row.rank_point)
        }
        if ((row.total_point !== null && row.total_point !== undefined) || statuses.some((status) => status && status !== 'PENDING')) {
          standing.hasRecordedResult = true
        }
        if (row.status === 'DQ' || statuses.includes('DQ')) standing.isDisqualified = true
      })
    })

    const compareMotoPoint = (a: number | null, b: number | null) => {
      if (a === null && b === null) return 0
      if (a === null) return 1
      if (b === null) return -1
      return a - b
    }

    const rows = Array.from(standingsByRider.values()).map((standing) => {
      const hasLiveMotoScores = standing.liveMotoAssigned.some(Boolean)
      const motoTotals = standing.fallbackMotoTotals.map((fallback, index) =>
        standing.liveMotoAssigned[index] ? standing.liveMotoTotals[index] : fallback
      ) as [number | null, number | null, number | null]
      const hasRecordedResult = hasLiveMotoScores
        ? motoTotals.some((point) => point !== null) || standing.liveMotoStatuses.some((status) => status !== null && status !== 'PENDING')
        : standing.hasRecordedResult
      const totalPoint = hasLiveMotoScores
        ? hasRecordedResult
          ? motoTotals.reduce<number>((sum, point) => sum + (point ?? 0), 0) + standing.additionalPenalty
          : null
        : standing.fallbackTotalPoint

      return {
        rider_id: standing.rider_id,
        name: standing.name,
        no_plate: standing.no_plate,
        rank: standing.rank !== Number.MAX_SAFE_INTEGER ? standing.rank : standing.dynamicRank ?? Number.MAX_SAFE_INTEGER,
        next_class_label: standing.next_class_label,
        total_point: totalPoint,
        total_point_moto1: motoTotals[0],
        total_point_moto2: motoTotals[1],
        total_point_moto3: motoTotals[2],
        hasRecordedResult,
        isDisqualified: standing.isDisqualified,
      }
    })

    rows.sort((a, b) => {
      if (a.isDisqualified !== b.isDisqualified) return a.isDisqualified ? 1 : -1
      if (a.hasRecordedResult !== b.hasRecordedResult) return a.hasRecordedResult ? -1 : 1
      if (a.total_point !== null && b.total_point !== null && a.total_point !== b.total_point) {
        return a.total_point - b.total_point
      }
      if (a.total_point === null && b.total_point !== null) return 1
      if (a.total_point !== null && b.total_point === null) return -1
      const moto3Diff = compareMotoPoint(a.total_point_moto3, b.total_point_moto3)
      if (moto3Diff !== 0) return moto3Diff
      const moto2Diff = compareMotoPoint(a.total_point_moto2, b.total_point_moto2)
      if (moto2Diff !== 0) return moto2Diff
      const moto1Diff = compareMotoPoint(a.total_point_moto1, b.total_point_moto1)
      if (moto1Diff !== 0) return moto1Diff
      if (a.rank !== b.rank) return a.rank - b.rank
      return a.name.localeCompare(b.name) || a.no_plate.localeCompare(b.no_plate)
    })

    return rows.map((row, index) => ({
      ...row,
      displayRank: row.hasRecordedResult ? index + 1 : null,
    }))
  }, [batches, qualificationAdvancementsCalculated, qualificationOverallRows])

  const riderPhotoCell = (name: string, noPlate: string, photoUrl?: string | null) => {
    if (showRiderPhotos && photoUrl) {
      return (
        <span className="relative inline-flex h-9 w-9 overflow-hidden rounded-full border border-slate-300">
          <Image src={photoUrl} alt={name} className="object-cover" fill sizes="36px" />
        </span>
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
  const showMoto3 = batches.some((batch) => Boolean(batch.moto3_id))
  const rotatingMotoViews = useMemo<RotatingMotoView[]>(() => {
    const fields = [
      {
        index: 1,
        motoId: (batch: Batch) => batch.moto1_id,
        status: (batch: Batch) => batch.moto1_status,
        assigned: (row: Row) => row.assigned_moto1 === true,
        gate: (row: Row) => row.gate_moto1,
        point: (row: Row) => row.point_moto1,
        penalty: (row: Row) => row.penalty_moto1,
        totalPoint: (row: Row) => row.total_point_moto1,
        resultStatus: (row: Row) => row.moto1_status ?? 'PENDING',
      },
      {
        index: 2,
        motoId: (batch: Batch) => batch.moto2_id,
        status: (batch: Batch) => batch.moto2_status,
        assigned: (row: Row) => row.assigned_moto2 === true,
        gate: (row: Row) => row.gate_moto2,
        point: (row: Row) => row.point_moto2,
        penalty: (row: Row) => row.penalty_moto2,
        totalPoint: (row: Row) => row.total_point_moto2,
        resultStatus: (row: Row) => row.moto2_status ?? 'PENDING',
      },
      {
        index: 3,
        motoId: (batch: Batch) => batch.moto3_id ?? null,
        status: (batch: Batch) => batch.moto3_status ?? null,
        assigned: (row: Row) => row.assigned_moto3 === true,
        gate: (row: Row) => row.gate_moto3,
        point: (row: Row) => row.point_moto3,
        penalty: (row: Row) => row.penalty_moto3,
        totalPoint: (row: Row) => row.total_point_moto3,
        resultStatus: (row: Row) => row.moto3_status ?? 'PENDING',
      },
    ]

    return fields.flatMap((field) => {
      const motoBatches = tableRowsByBatch
        .map((batch) => {
          const motoId = field.motoId(batch)
          const rows = batch.rows
            .filter(field.assigned)
            .map((row) => ({
              rider_id: row.rider_id,
              name: row.name,
              no_plate: row.no_plate,
              club: row.club,
              photo_thumbnail_url: row.photo_thumbnail_url,
              gate: field.gate(row),
              point: field.point(row),
              penalty: field.penalty(row),
              total_point: field.totalPoint(row),
              status: field.resultStatus(row) as NonNullable<Row['moto1_status']>,
            }))
            .sort((a, b) => {
              if (sortMode === 'GATE') {
                return (a.gate ?? Number.MAX_SAFE_INTEGER) - (b.gate ?? Number.MAX_SAFE_INTEGER)
              }
              if (a.total_point !== null && b.total_point !== null && a.total_point !== b.total_point) {
                return a.total_point - b.total_point
              }
              if (a.total_point !== null && b.total_point === null) return -1
              if (a.total_point === null && b.total_point !== null) return 1
              return (a.gate ?? Number.MAX_SAFE_INTEGER) - (b.gate ?? Number.MAX_SAFE_INTEGER)
            })
          return {
            batch_index: batch.batch_index,
            moto_id: motoId ?? '',
            status: field.status(batch) ?? null,
            rows,
          }
        })
        .filter((batch) => batch.moto_id && batch.rows.length > 0)

      if (motoBatches.length === 0) return []
      const status = motoBatches.find((batch) => String(batch.status ?? '').toUpperCase() === 'LIVE')?.status ??
        motoBatches.find((batch) => ['PROVISIONAL', 'PROTEST_REVIEW', 'READY'].includes(String(batch.status ?? '').toUpperCase()))?.status ??
        motoBatches[0].status
      return [{ index: field.index, title: `Moto ${field.index}`, status, batches: motoBatches }]
    })
  }, [sortMode, tableRowsByBatch])
  const usesGlobalActiveFirst = qualificationSplitBasis === 'GLOBAL_ACTIVE_FIRST'
  const showQualificationNextColumn = tableRowsByBatch.some((batch) =>
    batch.rows.some((row) => Boolean(row.class_label?.trim()))
  ) || usesGlobalActiveFirst
  const qualificationDestinationStatus = !qualificationAdvancementsCalculated
    ? 'Menunggu hasil seluruh batch dihitung'
    : qualificationResultsOfficial
      ? 'Hasil resmi'
      : 'Sementara — menunggu hasil resmi'
  const qualificationDestinationLabel = (label?: string | null) =>
    label || (!qualificationAdvancementsCalculated ? 'Menunggu hasil' : 'Tidak dialokasikan')
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

            // A pre-race DQ has an administrative last-place rank, while the
            // active riders are still PENDING. Keep starters visible first.
            if (a.status === 'PENDING' && b.status === 'DQ') return -1
            if (a.status === 'DQ' && b.status === 'PENDING') return 1

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
  const stageTabs = useMemo(() => {
    const groups = new Map<string, { key: string; label: string; stages: StageGroup[] }>()
    sortedStages.forEach((stage) => {
      const label = getStageTabLabel(stage.title)
      const key = label.toUpperCase()
      const group = groups.get(key) ?? { key, label, stages: [] }
      group.stages.push(stage)
      groups.set(key, group)
    })
    return Array.from(groups.values())
  }, [sortedStages])
  const liveStageTab = stageTabs.find((tab) =>
    tab.stages.some((stage) => String(stage.status ?? '').toUpperCase() === 'LIVE')
  )
  const liveRotatingMotoView = rotatingMotoViews.find((view) => String(view.status ?? '').toUpperCase() === 'LIVE')
  const defaultRotatingView = liveStageTab
    ? `STAGE_${liveStageTab.key}`
    : liveRotatingMotoView
      ? `MOTO_${liveRotatingMotoView.index}`
      : 'OVERALL'
  const activeRotatingView = selectedRotatingView ?? defaultRotatingView
  const activeRotatingMotoView = rotatingMotoViews.find((view) => `MOTO_${view.index}` === activeRotatingView)
  const selectedStageTab = stageTabs.find((tab) => activeRotatingView === `STAGE_${tab.key}`)
  const defaultFixedStageTab = stageTabs.find((tab) =>
    tab.stages.some((stage) => ['LIVE', 'READY', 'PROVISIONAL', 'PROTEST_REVIEW'].includes(String(stage.status ?? '').toUpperCase()))
  ) ?? stageTabs.find((tab) =>
    tab.stages.some((stage) => String(stage.status ?? '').toUpperCase() === 'UPCOMING')
  ) ?? stageTabs[stageTabs.length - 1]
  const selectedFixedStageTab = selectedFixedStageView === 'AUTO'
    ? defaultFixedStageTab
    : stageTabs.find((tab) => tab.key === selectedFixedStageView)
  const showFixedQualification = selectedFixedStageView === 'QUALIFICATION' || !selectedFixedStageTab
  const displayedStages = qualificationBatchMode === 'ROTATE_EACH_MOTO'
    ? selectedStageTab?.stages ?? []
    : showFixedQualification ? [] : selectedFixedStageTab?.stages ?? []

  useEffect(() => {
    if (
      selectedRotatingView?.startsWith('STAGE_') &&
      (qualificationBatchMode !== 'ROTATE_EACH_MOTO' || !selectedStageTab)
    ) {
      setSelectedRotatingView(null)
    }
  }, [qualificationBatchMode, selectedRotatingView, selectedStageTab])

  const publicMetaContent = (
    <>
      {publicTagline && <p className="text-sm font-semibold text-slate-300 sm:text-[15px]">{publicTagline}</p>}
      <div className="flex flex-wrap gap-2 text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-300 sm:text-[11px]">
        {showOperatingCommittee && (
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
            Panitia Operasional: {operatingCommitteeLabel}
          </span>
        )}
        {showScoringSupport && (
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
            Tim Scoring: {scoringSupportLabel}
          </span>
        )}
        {showMc && <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">MC: {mcName}</span>}
      </div>
    </>
  )
  const refreshControl = renderRefreshButton(refresh, refreshing, canRefreshPublicScore)
  const refreshOnlyControl = (
    <div className="live-score-card-controls flex flex-nowrap items-center gap-1.5">
      {refreshControl}
    </div>
  )
  const scoreControls = (
    <div className="live-score-card-controls flex flex-nowrap items-center gap-1.5">
      {refreshControl}
      {renderSortButtons(sortMode, setSortMode)}
    </div>
  )

  return (
    <div className="public-page public-editorial-page live-score-editorial-page">
      <PublicTopbar theme="dark" />
      <main className="public-main live-score-editorial-main">
        <section className="public-hero live-score-editorial-hero !rounded-[28px] px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-7">
          <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="grid gap-2 sm:gap-2.5">
              <div className="live-score-editorial-nav flex flex-wrap items-center gap-3">
                <Link
                  href={`/event/${eventId}#race-categories`}
                  className="live-score-editorial-back inline-flex min-h-[48px] items-center justify-center rounded-full px-5 py-3 text-sm font-black uppercase transition-transform hover:-translate-y-0.5"
                >
                  ← Semua Kategori
                </Link>
                {nextCategory ? (
                  <Link
                    href={`/event/${eventId}/live-score/${nextCategory.id}`}
                    className="live-score-editorial-next inline-flex min-h-[48px] items-center justify-center rounded-full px-5 py-3 text-sm font-black uppercase transition-transform hover:-translate-y-0.5"
                  >
                    Kategori Berikutnya: {nextCategory.label} →
                  </Link>
                ) : (
                  <span className="live-score-editorial-last-category inline-flex min-h-[40px] items-center rounded-full px-3 py-2 text-xs font-black uppercase">
                    Kategori Terakhir
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-extrabold uppercase text-[#f3c63d]">
                  {publicBrandName || 'Live Score'}
                </p>
                {event?.status && (
                  <span className="live-score-event-status rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase text-white">
                    {event.status === 'LIVE' ? 'BERLANGSUNG' : event.status === 'UPCOMING' ? 'AKAN DATANG' : 'SELESAI'}
                  </span>
                )}
              </div>
              <h1 className="max-w-4xl text-4xl font-black uppercase text-[#f3c63d] sm:text-5xl lg:text-[4rem] lg:leading-none">
                {categoryLabel || 'Kategori'}
              </h1>
              <p className="max-w-3xl text-base font-bold text-[#fff8e8] sm:text-lg">
                {publicEventTitle}
              </p>
              {(publicTagline || showOperatingCommittee || showScoringSupport || showMc) && (
                <>
                  <div className="live-score-editorial-meta-desktop hidden gap-2 md:grid">{publicMetaContent}</div>
                  <details className="live-score-editorial-meta-mobile md:hidden">
                    <summary>Lihat info panitia &amp; event</summary>
                    <div className="mt-2 grid gap-2">{publicMetaContent}</div>
                  </details>
                </>
              )}
            </div>
          </div>
        </section>

        {loading && <LoadingState />}
        {!loading && batches.length === 0 && stages.length === 0 && (
  <EmptyState label="Belum ada data." />
)}
        {qualificationH2HPendingCount > 0 && (
          <p
            role="status"
            className="rounded-xl border border-amber-300/50 bg-amber-300/10 px-3 py-2 text-xs font-bold leading-relaxed text-amber-100"
          >
            Menunggu {qualificationH2HPendingCount} Repechage H2H. Rank dan tujuan Final untuk seri tersebut belum ditetapkan. Poin kualifikasi tetap.
          </p>
        )}

        {qualificationBatchMode === 'ROTATE_EACH_MOTO' ? (
          <section className="grid gap-4">
            <article className="public-panel-dark live-score-editorial-panel live-score-rotation-panel">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-black uppercase text-[#fff8e8]">Hasil Kualifikasi &amp; Babak</h2>
                  <p className="mt-1 text-xs font-semibold text-slate-300">Pilih klasemen, moto, atau babak yang ingin dilihat.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tampilan kualifikasi">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeRotatingView === 'OVERALL'}
                  onClick={() => setSelectedRotatingView('OVERALL')}
                  className={`rounded-full border px-4 py-2 text-xs font-black uppercase transition-colors ${
                    activeRotatingView === 'OVERALL'
                      ? 'border-amber-300 bg-amber-300 text-slate-950'
                      : 'border-white/20 bg-white/10 text-white hover:bg-white/20'
                  } live-score-rotation-tab`}
                >
                  Klasemen
                </button>
                {rotatingMotoViews.map((view) => {
                  const isLive = String(view.status ?? '').toUpperCase() === 'LIVE'
                  return (
                    <button
                      key={view.index}
                      type="button"
                      role="tab"
                      aria-selected={activeRotatingView === `MOTO_${view.index}`}
                      aria-label={isLive ? `${view.title}, sedang berlangsung` : view.title}
                      onClick={() => setSelectedRotatingView(`MOTO_${view.index}`)}
                      className={`rounded-full border px-4 py-2 text-xs font-black uppercase transition-colors ${
                        activeRotatingView === `MOTO_${view.index}`
                          ? 'border-amber-300 bg-amber-300 text-slate-950'
                          : 'border-white/20 bg-white/10 text-white hover:bg-white/20'
                      } live-score-rotation-tab${isLive ? ' is-live' : ''}`}
                    >
                      {view.title}
                      {isLive && <span className="live-score-tab-live-badge">LIVE</span>}
                    </button>
                  )
                })}
                {stageTabs.map((tab) => {
                  const isLive = tab.stages.some((stage) => String(stage.status ?? '').toUpperCase() === 'LIVE')
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={activeRotatingView === `STAGE_${tab.key}`}
                      aria-label={isLive ? `${tab.label}, sedang berlangsung` : tab.label}
                      onClick={() => setSelectedRotatingView(`STAGE_${tab.key}`)}
                      className={`rounded-full border px-4 py-2 text-xs font-black uppercase transition-colors ${
                        activeRotatingView === `STAGE_${tab.key}`
                          ? 'border-amber-300 bg-amber-300 text-slate-950'
                          : 'border-white/20 bg-white/10 text-white hover:bg-white/20'
                      } live-score-rotation-tab${isLive ? ' is-live' : ''}`}
                    >
                      {tab.label}
                      {isLive && <span className="live-score-tab-live-badge">LIVE</span>}
                    </button>
                  )
                })}
              </div>
            </article>

            {activeRotatingView === 'OVERALL' ? (
              <article className="public-panel-dark live-score-editorial-panel live-score-rotation-panel">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-base font-black uppercase text-[#fff8e8]">Klasemen Gabungan</h3>
                    <p className="mt-1 text-xs font-semibold text-slate-300">
                      Urutan bergerak mengikuti total poin terbaru; seri memakai M3, M2, lalu M1.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {refreshOnlyControl}
                    <span className="live-score-rotation-status rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-black uppercase text-slate-200">
                      {qualificationH2HPendingCount > 0
                        ? 'Menunggu H2H'
                        : qualificationResultsOfficial
                          ? 'Hasil Resmi'
                          : 'Klasemen Sementara'}
                    </span>
                  </div>
                </div>
                {qualificationDisplayRows.length === 0 ? (
                  <p className="py-8 text-center text-sm font-semibold text-slate-300">
                    Klasemen akan terisi saat hasil moto kualifikasi mulai masuk.
                  </p>
                ) : (
                  <div className="public-table-wrap">
                    <table className="public-table min-w-[900px] text-xs sm:text-sm">
                      <thead>
                        <tr>
                          {['Rank', 'Rider', 'No Plat', 'Moto 1', 'Moto 2', 'Moto 3', 'Total Poin', 'Next Stage'].map((heading) => <th key={heading}>{heading}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {qualificationDisplayRows.map((row) => (
                          <tr
                            key={row.rider_id}
                            className={`qualification-standing-row${row.displayRank !== null && row.displayRank <= 3 ? ` is-podium-${row.displayRank}` : ''}`}
                          >
                            <td className="text-center">{renderRankBadge(row.displayRank)}</td>
                            <td className="live-score-rider-name font-extrabold">{row.name}</td>
                            <td>{row.no_plate}</td>
                            <td className="qualification-standing-moto-point text-center font-bold">{row.total_point_moto1 ?? '-'}</td>
                            <td className="qualification-standing-moto-point text-center font-bold">{row.total_point_moto2 ?? '-'}</td>
                            <td className="qualification-standing-moto-point text-center font-bold">{row.total_point_moto3 ?? '-'}</td>
                            <td className="qualification-standing-total text-center font-black">{row.total_point ?? '-'}</td>
                            <td className="font-black uppercase">{row.next_class_label || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </article>
            ) : selectedStageTab ? (
              <article className="public-panel-dark live-score-editorial-panel live-score-rotation-panel">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-black uppercase text-[#fff8e8]">{selectedStageTab.label}</h3>
                  <span className="live-score-rotation-status rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-black uppercase text-slate-200">
                    {selectedStageTab.stages.length} Moto Tersedia
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-300">
                  Moto-moto untuk stage ini sudah digenerate. Hasilnya ditampilkan di bawah.
                </p>
              </article>
            ) : activeRotatingMotoView ? (
              <section className="grid gap-4" aria-label={`${activeRotatingMotoView.title} per batch`}>
                {activeRotatingMotoView.batches.map((batch, batchIndex) => (
                  <article key={batch.moto_id} className="public-panel-dark live-score-editorial-panel live-score-rotation-batch-panel">
                    <div className="live-score-rotation-batch-heading mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base font-black uppercase text-[#fff8e8]">
                        {activeRotatingMotoView.title} - Batch {batch.batch_index}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2">
                        {batchIndex === 0 && scoreControls}
                        <span className="live-score-rotation-status rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-black uppercase text-slate-200">
                          {formatMotoStatusLabel(batch.status)}
                        </span>
                      </div>
                    </div>
                    <div className="grid gap-2 lg:hidden">
                      {batch.rows.map((row) => (
                        <div key={row.rider_id} className="live-score-rotation-rider">
                          <div className="live-score-rotation-row-top">
                            <div className="live-score-rotation-rider-info flex min-w-0 items-center gap-3">
                              {renderGateBadge(row.gate)}
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="live-score-rider-name text-sm font-black">{row.name}</span>
                                  <RiderNotificationButton eventId={eventId} riderId={row.rider_id} riderName={row.name} riderPlate={row.no_plate} />
                                </div>
                                <div className="live-score-rotation-meta text-[10px] font-bold text-amber-300">{row.no_plate} - {row.club || '-'}</div>
                              </div>
                            </div>
                            <div className="live-score-rotation-result">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${statusBadgeClass(row.status)}`}>
                                {row.status === 'PENDING' ? 'MENUNGGU' : row.status}
                              </span>
                            </div>
                          </div>
                          <div className="live-score-rotation-stats">
                            <div className="live-score-rotation-stat live-score-rotation-stat-points">
                              <span>Poin</span><strong>{row.point ?? '-'}</strong>
                            </div>
                            <div className="live-score-rotation-stat live-score-rotation-stat-penalty">
                              <span>Penalti</span><strong>{row.penalty ?? '-'}</strong>
                            </div>
                            <div className="live-score-rotation-stat live-score-rotation-stat-total">
                              <span>Total Poin</span><strong>{row.total_point ?? '-'}</strong>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="public-table-wrap hidden lg:block">
                      <table className="public-table min-w-[820px] text-xs sm:text-sm">
                        <thead>
                          <tr>
                            {['Gate', ...(showRiderPhotos ? ['Foto'] : []), 'Nama Peserta', 'No Plat', 'Komunitas', 'Status', 'Poin Moto', 'Penalti Moto', 'Total Poin Moto'].map((heading) => <th key={heading}>{heading}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {batch.rows.map((row) => (
                            <tr key={row.rider_id}>
                              <td>{renderGateBadge(row.gate)}</td>
                              {showRiderPhotos && <td>{riderPhotoCell(row.name, row.no_plate, row.photo_thumbnail_url)}</td>}
                              <td className="live-score-rider-name font-extrabold">
                                <span className="inline-flex items-center gap-2">{row.name}<RiderNotificationButton eventId={eventId} riderId={row.rider_id} riderName={row.name} riderPlate={row.no_plate} /></span>
                              </td>
                              <td>{row.no_plate}</td>
                              <td>{row.club || '-'}</td>
                              <td>
                                <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase ${statusBadgeClass(row.status)}`}>
                                  {row.status === 'PENDING' ? 'MENUNGGU' : row.status}
                                </span>
                              </td>
                              <td className="font-black text-sky-700">{row.point ?? '-'}</td>
                              <td className="font-extrabold text-amber-600">{row.penalty ?? '-'}</td>
                              <td className="font-extrabold text-sky-700">{row.total_point ?? '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                ))}
              </section>
            ) : (
              <article className="public-panel-dark live-score-editorial-panel live-score-rotation-panel">
                {refreshOnlyControl}
                <p className="py-8 text-center text-sm font-semibold text-slate-300">Belum ada susunan batch untuk moto ini.</p>
              </article>
            )}
          </section>
        ) : (
        <section className="grid gap-4">
          <article className="public-panel-dark live-score-editorial-panel live-score-fixed-toolbar">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black uppercase text-[#fff8e8]">Hasil Kategori</h2>
                <p className="mt-1 text-xs font-semibold text-slate-300">Pilih kualifikasi atau stage yang ingin dilihat.</p>
              </div>
            </div>
            <div className="live-score-fixed-tabs mt-3" role="tablist" aria-label="Stage live score">
              <button
                type="button"
                role="tab"
                aria-selected={showFixedQualification}
                onClick={() => setSelectedFixedStageView('QUALIFICATION')}
                className={`live-score-fixed-tab ${showFixedQualification ? 'is-active' : ''}`}
              >
                Kualifikasi
              </button>
              {stageTabs.map((tab) => {
                const isActive = tab.stages.some((stage) =>
                  ['LIVE', 'READY', 'PROVISIONAL', 'PROTEST_REVIEW'].includes(String(stage.status ?? '').toUpperCase())
                )
                const isSelected = selectedFixedStageTab?.key === tab.key && !showFixedQualification
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setSelectedFixedStageView(tab.key)}
                    className={`live-score-fixed-tab ${isSelected ? 'is-active' : ''}`}
                  >
                    {tab.label}
                    {isActive && <span className="live-score-fixed-tab-live">Aktif</span>}
                  </button>
                )
              })}
            </div>
          </article>
          {showFixedQualification && tableRowsByBatch.length === 0 && stages.length > 0 && !loading && (
            <article className="public-panel-dark">
              {refreshOnlyControl}
              <p className="text-slate-400 text-sm text-center py-8">Belum ada batch tersedia.</p>
            </article>
          )}
          {showFixedQualification && tableRowsByBatch.map((batch, batchIndex) => (
            <article key={batch.batch_index} className="public-panel-dark live-score-editorial-panel">
              <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black uppercase text-[#fff8e8]">
                    Batch {batch.batch_index}
                  </h2>
                  <span className="live-score-editorial-stage-badge rounded-full border px-3 py-1 text-xs font-extrabold uppercase">
                    Kualifikasi Moto
                  </span>
                </div>
                {batchIndex === 0 && scoreControls}
              </div>
              {usesGlobalActiveFirst && (
                <div className="mb-3 rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-100">
                  <p>Penentuan tujuan stage membandingkan rider dari semua batch. FINISH/DNF diprioritaskan sebelum DNS; kuota stage tetap mengikuti aturan kategori.</p>
                  <p className="mt-1 font-black">Tujuan stage: {qualificationDestinationStatus}.</p>
                </div>
              )}
              <div className="live-score-qualification-cards grid gap-2 lg:hidden">
                {batch.rows.map((row) => (
                  <article key={`mobile-qualification-${row.rider_id}`} className="live-score-mobile-rider-card">
                    <div className="live-score-mobile-rider-heading">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="live-score-rider-name truncate text-sm font-black">{row.name}</span>
                          <RiderNotificationButton eventId={eventId} riderId={row.rider_id} riderName={row.name} riderPlate={row.no_plate} />
                        </div>
                        <p className="mt-1 text-xs font-extrabold text-amber-800">{row.no_plate}</p>
                        <p className="text-[10px] font-semibold text-slate-600">{row.club || '-'}</p>
                      </div>
                      {(row.status === 'DQ' || row.status === 'PENDING') && (
                        <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${statusBadgeClass(row.status)}`}>
                          {row.status === 'PENDING' ? 'MENUNGGU' : row.status}
                        </span>
                      )}
                    </div>
                    <div className="live-score-mobile-summary-grid">
                      <div><span>Total Poin</span><strong>{row.total_point ?? '-'}</strong></div>
                      <div><span>Total Penalti</span><strong>{row.penalty_total ?? '-'}</strong></div>
                      {showQualificationNextColumn && (
                        <div className="live-score-mobile-destination">
                          <span>{qualificationHasFinisherOutcome ? 'Hasil Kualifikasi' : 'Next Stage'}</span>
                          <strong>{usesGlobalActiveFirst ? qualificationDestinationLabel(row.class_label) : row.class_label || '-'}</strong>
                        </div>
                      )}
                    </div>
                    <details className="live-score-mobile-breakdown">
                      <summary>Lihat poin, gate &amp; status tiap moto</summary>
                      <div className="live-score-mobile-moto-grid">
                        {[
                          { label: 'Moto 1', gate: row.gate_moto1, point: row.point_moto1, penalty: row.penalty_moto1, total: row.total_point_moto1, status: row.moto1_status },
                          { label: 'Moto 2', gate: row.gate_moto2, point: row.point_moto2, penalty: row.penalty_moto2, total: row.total_point_moto2, status: row.moto2_status },
                          ...(showMoto3 ? [{ label: 'Moto 3', gate: row.gate_moto3, point: row.point_moto3, penalty: row.penalty_moto3, total: row.total_point_moto3, status: row.moto3_status }] : []),
                        ].map((moto) => (
                          <div key={moto.label} className="live-score-mobile-moto-item">
                            <strong>{moto.label}</strong>
                            <span>Gate {moto.gate ?? '-'}</span>
                            <span className="live-score-mobile-moto-result">
                              {moto.status === 'PENDING' ? 'Menunggu' : moto.status ?? 'Menunggu'} · Poin {moto.point ?? '-'} · Penalti {moto.penalty ?? '-'} · Total {moto.total ?? '-'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </article>
                ))}
              </div>
              <div className="table-mobile-hint hidden lg:block">Geser tabel ke samping untuk melihat seluruh hasil</div>
              <div className="public-table-wrap hidden lg:block">
                <table className="public-table min-w-[940px] text-[11px] sm:text-xs md:text-sm">
                  <thead>
                    <tr>
                        {[
                          'Gate M1',
                          'Gate M2',
                          ...(showMoto3 ? ['Gate M3'] : []),
                          ...(showRiderPhotos ? ['Foto'] : []),
                          'Nama Peserta',
                          'No Plat',
                          'Komunitas',
                          'Point M1',
                          'Point M2',
                          ...(showMoto3 ? ['Point M3'] : []),
                          'Total Penalti',
                          'Total Poin',
                          ...(showQualificationNextColumn ? [qualificationHasFinisherOutcome ? 'Hasil Kualifikasi' : 'Next Stage'] : []),
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
                        {showRiderPhotos && <td>{riderPhotoCell(row.name, row.no_plate, row.photo_thumbnail_url)}</td>}
                        <td className="live-score-rider-name whitespace-nowrap font-extrabold">
                          <div className="flex items-center gap-2">
                            <span>{row.name}</span>
                            <RiderNotificationButton eventId={eventId} riderId={row.rider_id} riderName={row.name} riderPlate={row.no_plate} />
                          </div>
                          {(row.status === 'DQ' || row.status === 'PENDING') && (
                            <span className={`mt-1 inline-flex w-fit rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] ${statusBadgeClass(row.status)}`}>{row.status}</span>
                          )}
                        </td>
                        <td>{row.no_plate}</td>
                        <td className="whitespace-nowrap">{row.club || '-'}</td>
                        <td>{renderMotoResultCell(row.point_moto1, row.moto1_status)}</td>
                        <td>{renderMotoResultCell(row.point_moto2, row.moto2_status)}</td>
                        {showMoto3 && <td>{renderMotoResultCell(row.point_moto3, row.moto3_status)}</td>}
                        <td className="font-extrabold text-amber-600">{row.penalty_total ?? '-'}</td>
                        <td className="font-extrabold text-sky-700">{row.total_point ?? '-'}</td>
                        {showQualificationNextColumn && (
                          <td className="whitespace-nowrap">
                            <div className="flex flex-col items-start gap-1">
                              <span>{usesGlobalActiveFirst ? qualificationDestinationLabel(row.class_label) : row.class_label || '-'}</span>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </section>
        )}

        {displayedStages.length > 0 && (
          <section className="grid gap-4">
            {displayedStages.map((stage, stageIndex) => (
              <article key={stage.moto_id} className="public-panel-dark live-score-editorial-panel">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-black uppercase text-[#fff8e8]">{stage.title}</h2>
                  </div>
                  {stageIndex === 0 && (stage.rows.length > 0 ? scoreControls : refreshOnlyControl)}
                </div>
                {stage.rows.length === 0 ? (
                  <p className="rounded-xl border border-white/15 bg-white/5 px-4 py-6 text-center text-sm font-semibold text-slate-300">
                    Moto sudah digenerate. Menunggu rider ditempatkan.
                  </p>
                ) : (
                  <>
                <div className="live-score-stage-cards grid gap-2 lg:hidden">
                  {stage.rows.map((row) => (
                    <article key={`mobile-stage-${row.rider_id}`} className="live-score-mobile-rider-card">
                      <div className="live-score-mobile-rider-heading">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="live-score-rider-name truncate text-sm font-black">{row.name}</span>
                            <RiderNotificationButton eventId={eventId} riderId={row.rider_id} riderName={row.name} riderPlate={row.no_plate} />
                          </div>
                          <p className="mt-1 text-xs font-extrabold text-amber-800">{row.no_plate}</p>
                          <p className="text-[10px] font-semibold text-slate-600">{row.club || '-'}</p>
                        </div>
                        <div className="grid justify-items-center gap-1">
                          {renderRankBadge(row.rank)}
                          <span className="text-[9px] font-black uppercase text-slate-600">Peringkat</span>
                        </div>
                      </div>
                      <div className="live-score-mobile-summary-grid live-score-stage-summary-grid">
                        <div><span>Gate</span><strong>{row.gate ?? '-'}</strong></div>
                        <div>
                          <span>Poin</span>
                          <strong>{row.point ?? '-'}</strong>
                          {['DNF', 'DNS', 'DQ'].includes(row.status) && (
                            <small className={`live-score-mobile-result-status ${statusBadgeClass(row.status)}`}>{row.status}</small>
                          )}
                        </div>
                        <div><span>Penalti</span><strong>{row.penalty_total ?? '-'}</strong></div>
                        <div className="live-score-mobile-total"><span>Total Poin</span><strong>{row.total_point ?? '-'}</strong></div>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="table-mobile-hint hidden lg:block">Geser tabel ke samping untuk melihat seluruh hasil</div>
                <div className="public-table-wrap hidden lg:block">
                  <table className="public-table min-w-[680px] text-[11px] sm:text-xs md:text-sm">
                    <thead>
                      <tr>
                        {['Gate', ...(showRiderPhotos ? ['Foto'] : []), 'Nama Peserta', 'No Plat', 'Komunitas', 'Poin', 'Penalti', 'Total Poin', 'Rank'].map((h) => (
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
                          {showRiderPhotos && <td>{riderPhotoCell(row.name, row.no_plate, row.photo_thumbnail_url)}</td>}
                          <td className="live-score-rider-name whitespace-nowrap font-extrabold">
                            <div className="flex items-center gap-2">
                              <span>{row.name}</span>
                              <RiderNotificationButton eventId={eventId} riderId={row.rider_id} riderName={row.name} riderPlate={row.no_plate} />
                            </div>
                          </td>
                          <td>{row.no_plate}</td>
                          <td className="whitespace-nowrap">{row.club || '-'}</td>
                          <td className="font-extrabold text-sky-700">{renderStagePointCell(row.point, row.status)}</td>
                          <td className="font-extrabold text-amber-600">{row.penalty_total ?? '-'}</td>
                          <td className="font-extrabold text-sky-700">{row.total_point ?? '-'}</td>
                          <td className="whitespace-nowrap text-center">
                            {renderRankBadge(row.rank)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                  </>
                )}
              </article>
            ))}
          </section>
        )}
      </main>

    </div>
  )
}
