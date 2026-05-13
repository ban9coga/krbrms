'use client'

import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../../../../components/EmptyState'
import LoadingState from '../../../../components/LoadingState'
import { getEventById, getEventCategories, type EventItem, type RiderCategory } from '../../../../lib/eventService'
import { compareMotoSequence, parseMotoSequence } from '../../../../lib/motoSequence'
import { isMotoLive } from '../../../../lib/motoStatus'

type Row = {
  rider_id: string
  gate_moto1: number | null
  gate_moto2: number | null
  gate_moto3: number | null
  name: string
  rider_nickname?: string | null
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

type LiveScorePayload = {
  category?: string
  batches?: Batch[]
  stages?: StageGroup[]
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
  status: 'FINISH' | 'DNF' | 'DNS' | 'PENDING'
}

type StageGroup = {
  title: string
  moto_id: string
  rows: StageRow[]
}

type ResultBoardRow = {
  rider_id: string
  name: string
  no_plate: string
  club: string | null
  photo_thumbnail_url?: string | null
  point: number | null
  penalty_total: number | null
  rank: number | null
}

type MotoItem = {
  id: string
  category_id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
}

const isCompletedMoto = (status?: string | null) => {
  const normalized = (status ?? '').toUpperCase()
  return normalized === 'LOCKED' || normalized === 'FINISHED' || normalized === 'PROTEST_REVIEW'
}

const gateByMoto = (row: Row, motoIndex: number) => {
  if (motoIndex === 1) return row.gate_moto1
  if (motoIndex === 2) return row.gate_moto2
  return row.gate_moto3
}

const displayName = (row: Pick<Row, 'rider_nickname' | 'name'> | { rider_nickname?: string | null; name: string }) =>
  row.rider_nickname?.trim() || row.name

export default function LiveDisplayClient({
  eventId,
  initialEvent = null,
}: {
  eventId: string
  initialEvent?: EventItem | null
}) {
  const [event, setEvent] = useState<EventItem | null>(initialEvent)
  const [categories, setCategories] = useState<RiderCategory[]>([])
  const [scoreCategoryIds, setScoreCategoryIds] = useState<string[]>([])
  const [liveScoreByCategory, setLiveScoreByCategory] = useState<
    Record<string, { categoryLabel: string; batches: Batch[]; stages: StageGroup[] }>
  >({})
  const [eventMotos, setEventMotos] = useState<MotoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const eventData = initialEvent ?? (await getEventById(eventId))
        const cats = (await getEventCategories(eventId)).filter((c) => c.enabled)
        setCategories(cats)
        setEvent(eventData ?? initialEvent ?? null)
        if (cats.length === 0) {
          setScoreCategoryIds([])
        }
      } finally {
        setLoading(false)
      }
    }
    if (eventId) load()
  }, [eventId, initialEvent])

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prevHtml = html.style.overflowX
    const prevBody = body.style.overflowX
    html.style.overflowX = 'hidden'
    body.style.overflowX = 'hidden'
    return () => {
      html.style.overflowX = prevHtml
      body.style.overflowX = prevBody
    }
  }, [])

  const fetchMotos = async () => {
    const res = await fetch(`/api/motos?event_id=${eventId}`)
    const json = await res.json()
    const data = ((json?.data ?? []) as MotoItem[]).sort(compareMotoSequence)
    const liveMoto = data.find((m) => isMotoLive(m.status)) ?? null
    const provisionalMoto = data.find((m) => (m.status ?? '').toUpperCase() === 'PROVISIONAL') ?? null
    const latestCompletedMoto = [...data].reverse().find((m) => isCompletedMoto(m.status)) ?? null
    const anchorMoto = provisionalMoto ?? liveMoto ?? latestCompletedMoto
    const anchorIndex = anchorMoto ? data.findIndex((m) => m.id === anchorMoto.id) : -1
    const nextMoto = anchorIndex >= 0 ? data[anchorIndex + 1] ?? null : null
    const categoryIds = Array.from(
      new Set([anchorMoto?.category_id, nextMoto?.category_id].filter((value): value is string => Boolean(value)))
    )
    setEventMotos(data)
    setScoreCategoryIds(categoryIds)
    return categoryIds
  }

  const fetchLiveScores = async (categoryIds: string[]) => {
    if (categoryIds.length === 0) {
      setLiveScoreByCategory({})
      return
    }
    const entries = await Promise.all(
      categoryIds.map(async (id) => {
        const res = await fetch(
          `/api/public/events/${eventId}/live-score?category_id=${encodeURIComponent(id)}&include_upcoming=1`
        )
        const json = await res.json()
        const data = (json?.data ?? {}) as LiveScorePayload
        return [
          id,
          {
            categoryLabel: data.category ?? '',
            batches: data.batches ?? [],
            stages: data.stages ?? [],
          },
        ] as const
      })
    )
    setLiveScoreByCategory(Object.fromEntries(entries))
  }

  useEffect(() => {
    fetchMotos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  useEffect(() => {
    fetchLiveScores(scoreCategoryIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, scoreCategoryIds.join(',')])

  const refresh = async () => {
    setRefreshing(true)
    try {
      const categoryIds = await fetchMotos()
      await fetchLiveScores(categoryIds)
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
  }, [eventId, scoreCategoryIds.join(',')])

  const activeMoto = useMemo(() => eventMotos.find((m) => isMotoLive(m.status)) ?? null, [eventMotos])
  const provisionalMoto = useMemo(
    () => eventMotos.find((m) => (m.status ?? '').toUpperCase() === 'PROVISIONAL') ?? null,
    [eventMotos]
  )
  const latestCompletedMoto = useMemo(
    () => [...eventMotos].reverse().find((m) => isCompletedMoto(m.status)) ?? null,
    [eventMotos]
  )
  const anchorMoto = provisionalMoto ?? activeMoto ?? latestCompletedMoto
  const categoryOrderMap = useMemo(() => {
    const sorted = [...categories].sort((a, b) => {
      const ayMax = typeof a.year_max === 'number' ? a.year_max : typeof a.year_min === 'number' ? a.year_min : 0
      const byMax = typeof b.year_max === 'number' ? b.year_max : typeof b.year_min === 'number' ? b.year_min : 0
      if (byMax !== ayMax) return byMax - ayMax
      const ayMin = typeof a.year_min === 'number' ? a.year_min : ayMax
      const byMin = typeof b.year_min === 'number' ? b.year_min : byMax
      if (byMin !== ayMin) return byMin - ayMin
      const genderOrder = { BOY: 0, GIRL: 1, MIX: 2 } as const
      const ag = genderOrder[a.gender] ?? 9
      const bg = genderOrder[b.gender] ?? 9
      if (ag !== bg) return ag - bg
      return a.label.localeCompare(b.label)
    })

    return new Map(sorted.map((category, index) => [category.id, index]))
  }, [categories])
  const sortedCategories = useMemo(
    () =>
      [...categories].sort((a, b) => {
        const ayMax = typeof a.year_max === 'number' ? a.year_max : typeof a.year_min === 'number' ? a.year_min : 0
        const byMax = typeof b.year_max === 'number' ? b.year_max : typeof b.year_min === 'number' ? b.year_min : 0
        if (byMax !== ayMax) return byMax - ayMax
        const ayMin = typeof a.year_min === 'number' ? a.year_min : ayMax
        const byMin = typeof b.year_min === 'number' ? b.year_min : byMax
        if (byMin !== ayMin) return byMin - ayMin
        const genderOrder = { BOY: 0, GIRL: 1, MIX: 2 } as const
        const ag = genderOrder[a.gender] ?? 9
        const bg = genderOrder[b.gender] ?? 9
        if (ag !== bg) return ag - bg
        return a.label.localeCompare(b.label)
      }),
    [categories]
  )
  const orderedUpcomingMotos = useMemo(
    () =>
      eventMotos
      .filter((m) => (m.status ?? '').toUpperCase() === 'UPCOMING')
      .sort((a, b) => {
        const ac = categoryOrderMap.get(a.category_id) ?? Number.MAX_SAFE_INTEGER
        const bc = categoryOrderMap.get(b.category_id) ?? Number.MAX_SAFE_INTEGER
        if (ac !== bc) return ac - bc
        return compareMotoSequence(a, b)
      }),
    [eventMotos, categoryOrderMap]
  )
  const activeLiveScore = anchorMoto ? liveScoreByCategory[anchorMoto.category_id] : null
  const categoryLabel = activeLiveScore?.categoryLabel ?? ''
  const nextCategoryCandidate = useMemo(() => {
    const currentOrder = anchorMoto ? categoryOrderMap.get(anchorMoto.category_id) ?? -1 : -1
    if (currentOrder < 0) return null
    return sortedCategories.find((category) => (categoryOrderMap.get(category.id) ?? -1) > currentOrder) ?? null
  }, [anchorMoto, categoryOrderMap, sortedCategories])
  const sameCategoryQueueMoto = useMemo(() => {
    if (!anchorMoto) return null
    const sameCategoryMotos = eventMotos
      .filter((moto) => moto.category_id === anchorMoto.category_id)
      .sort(compareMotoSequence)
    const currentIndex = sameCategoryMotos.findIndex((moto) => moto.id === anchorMoto.id)
    if (currentIndex < 0) return null
    const blockedStatuses = new Set(['LOCKED', 'FINISHED', 'PROTEST_REVIEW'])
    return (
      sameCategoryMotos
        .slice(currentIndex + 1)
        .find((moto) => !blockedStatuses.has((moto.status ?? '').toUpperCase())) ?? null
    )
  }, [anchorMoto, eventMotos])
  const displayMoto = useMemo(() => {
    if (activeMoto) return activeMoto
    if (provisionalMoto) {
      const isQualificationMoto = Boolean(parseMotoSequence(provisionalMoto.moto_name))
      if (isQualificationMoto && sameCategoryQueueMoto) return sameCategoryQueueMoto
      return provisionalMoto
    }
    if (!latestCompletedMoto) return null
    const isQualificationMoto = Boolean(parseMotoSequence(latestCompletedMoto.moto_name))
    if (isQualificationMoto && sameCategoryQueueMoto) return sameCategoryQueueMoto
    return latestCompletedMoto
  }, [provisionalMoto, activeMoto, latestCompletedMoto, sameCategoryQueueMoto])
  const displayLiveScore = displayMoto ? liveScoreByCategory[displayMoto.category_id] : null
  const displayBatches = useMemo(() => displayLiveScore?.batches ?? [], [displayLiveScore])
  const displayStages = useMemo(() => displayLiveScore?.stages ?? [], [displayLiveScore])
  const sameCategoryQueueAfterDisplayMoto = useMemo(() => {
    if (!displayMoto) return null
    const sameCategoryMotos = eventMotos
      .filter((moto) => moto.category_id === displayMoto.category_id)
      .sort(compareMotoSequence)
    const currentIndex = sameCategoryMotos.findIndex((moto) => moto.id === displayMoto.id)
    if (currentIndex < 0) return null
    const blockedStatuses = new Set(['LOCKED', 'FINISHED', 'PROTEST_REVIEW'])
    return (
      sameCategoryMotos
        .slice(currentIndex + 1)
        .find((moto) => !blockedStatuses.has((moto.status ?? '').toUpperCase())) ?? null
    )
  }, [displayMoto, eventMotos])
  const queueMoto = useMemo(() => {
    const prioritizedMotos =
      sameCategoryQueueAfterDisplayMoto
        ? [sameCategoryQueueAfterDisplayMoto]
        : nextCategoryCandidate
          ? orderedUpcomingMotos.filter((moto) => moto.category_id === nextCategoryCandidate.id)
          : orderedUpcomingMotos
    return prioritizedMotos[0] ?? null
  }, [orderedUpcomingMotos, sameCategoryQueueAfterDisplayMoto, nextCategoryCandidate])
  const queueLiveScore = queueMoto ? liveScoreByCategory[queueMoto.category_id] ?? null : null
  const queueBatches = useMemo(() => queueLiveScore?.batches ?? [], [queueLiveScore])
  const queueStages = useMemo(() => queueLiveScore?.stages ?? [], [queueLiveScore])
  const queueTarget = useMemo(() => {
    if (!queueMoto) return null
    const batch =
      queueBatches.find(
        (item) => item.moto1_id === queueMoto.id || item.moto2_id === queueMoto.id || item.moto3_id === queueMoto.id
      ) ?? null
    if (batch) {
      const motoIndex: 1 | 2 | 3 =
        batch.moto1_id === queueMoto.id ? 1 : batch.moto2_id === queueMoto.id ? 2 : 3
      return {
        kind: 'batch' as const,
        batch,
        motoIndex,
        label: `Batch ${batch.batch_index} - Moto ${motoIndex}`,
      }
    }
    const stage = queueStages.find((item) => item.moto_id === queueMoto.id) ?? null
    if (stage) {
      return {
        kind: 'stage' as const,
        stage,
        label: stage.title,
      }
    }
    return null
  }, [queueMoto, queueBatches, queueStages])

  const hasData = useMemo(
    () =>
      displayBatches.some((batch) => batch.rows.length > 0) ||
      displayStages.some((stage) => stage.rows.length > 0) ||
      queueBatches.some((batch) => batch.rows.length > 0) ||
      queueStages.some((stage) => stage.rows.length > 0),
    [displayBatches, displayStages, queueBatches, queueStages]
  )
  const sortedBatches = useMemo(() => [...displayBatches].sort((a, b) => a.batch_index - b.batch_index), [displayBatches])
  const activeBatch = useMemo(() => {
    if (!displayMoto) return null
    return sortedBatches.find((b) => b.moto1_id === displayMoto.id || b.moto2_id === displayMoto.id || b.moto3_id === displayMoto.id) ?? null
  }, [sortedBatches, displayMoto])

  const liveBatchView = useMemo(() => {
    if (!activeBatch) return null
    return {
      ...activeBatch,
      rows: [...activeBatch.rows].sort((a, b) => (a.rank_point ?? 9999) - (b.rank_point ?? 9999)),
    }
  }, [activeBatch])
  const activeStageView = useMemo(() => {
    if (!displayMoto) return null
    const stage = displayStages.find((item) => item.moto_id === displayMoto.id) ?? null
    if (!stage) return null
    return {
      ...stage,
      rows: [...stage.rows].sort((a, b) => {
        const aRank = a.rank ?? Number.MAX_SAFE_INTEGER
        const bRank = b.rank ?? Number.MAX_SAFE_INTEGER
        if (aRank !== bRank) return aRank - bRank
        const aGate = a.gate ?? Number.MAX_SAFE_INTEGER
        const bGate = b.gate ?? Number.MAX_SAFE_INTEGER
        if (aGate !== bGate) return aGate - bGate
        return a.name.localeCompare(b.name)
      }),
    }
  }, [displayMoto, displayStages])
  const showLiveMoto3 = Boolean(
    liveBatchView?.moto3_id || liveBatchView?.rows.some((row) => row.point_moto3 !== null || row.gate_moto3 !== null)
  )
  const isSingleBatchLockedFinalMoto = useMemo(() => {
    if (!displayMoto || !liveBatchView) return false
    return (
      sortedBatches.length === 1 &&
      Boolean(liveBatchView.moto3_id) &&
      liveBatchView.moto3_id === displayMoto.id &&
      (displayMoto.status ?? '').toUpperCase() === 'LOCKED'
    )
  }, [displayMoto, liveBatchView, sortedBatches])
  const resultBoard = useMemo(() => {
    if (activeMoto || provisionalMoto || !displayMoto) return null
    if (activeStageView) {
      return {
        title: activeStageView.title,
        rows: activeStageView.rows as ResultBoardRow[],
      }
    }
    if (liveBatchView && (displayMoto.status ?? '').toUpperCase() === 'LOCKED') {
      return {
        title: isSingleBatchLockedFinalMoto
          ? `${categoryLabel || 'Kategori'} Race Result`
          : `${categoryLabel || 'Kategori'} Final Result`,
        rows: liveBatchView.rows.map((row) => ({
          rider_id: row.rider_id,
          name: displayName(row),
          no_plate: row.no_plate,
          club: row.club,
          photo_thumbnail_url: row.photo_thumbnail_url ?? null,
          point: row.total_point,
          penalty_total: row.penalty_total,
          rank: row.rank_point,
        })),
      }
    }
    return null
  }, [activeMoto, provisionalMoto, displayMoto, activeStageView, liveBatchView, categoryLabel, isSingleBatchLockedFinalMoto])
  const showResultBoard = Boolean(resultBoard)
  const podiumRows = resultBoard?.rows.filter((row) => row.rank && row.rank <= 3).slice(0, 3) ?? []
  const resultBoardPointLabel = isSingleBatchLockedFinalMoto ? 'Total Point' : 'Point'

  const prepareQueue = useMemo(() => {
    if (!queueTarget) return []
    if (queueTarget.kind === 'stage') {
      return [...queueTarget.stage.rows]
        .sort((a, b) => {
          const aGate = a.gate ?? Number.MAX_SAFE_INTEGER
          const bGate = b.gate ?? Number.MAX_SAFE_INTEGER
          if (aGate !== bGate) return aGate - bGate
          return a.name.localeCompare(b.name)
        })
        .map((row, index) => ({
          queue: index + 1,
          rider_id: row.rider_id,
          gate: row.gate,
          no_plate: row.no_plate,
          name: row.name,
          rider_nickname: null,
          club: row.club,
          photo_thumbnail_url: row.photo_thumbnail_url ?? null,
        }))
    }
    return [...queueTarget.batch.rows]
      .sort((a, b) => (gateByMoto(a, queueTarget.motoIndex) ?? 9999) - (gateByMoto(b, queueTarget.motoIndex) ?? 9999))
      .filter((row) => gateByMoto(row, queueTarget.motoIndex) != null)
      .map((row, index) => ({
        queue: index + 1,
        rider_id: row.rider_id,
        gate: gateByMoto(row, queueTarget.motoIndex),
        no_plate: row.no_plate,
        name: row.name,
        rider_nickname: row.rider_nickname ?? null,
        club: row.club,
        photo_thumbnail_url: row.photo_thumbnail_url ?? null,
      }))
  }, [queueTarget])

  const business = event?.business_settings ?? null
  const publicEventTitle = business?.public_event_title?.trim() || event?.name || 'Live Display'
  const publicBrandName = business?.public_brand_name?.trim() || ''
  const publicTagline = business?.public_tagline?.trim() || ''
  const displaySponsors = useMemo(() => {
    const structuredSponsors =
      business?.sponsors
        ?.filter((s) => s?.is_active !== false && s?.show_on_live_display !== false)
        .sort((a, b) => (a?.sort_order ?? 999) - (b?.sort_order ?? 999))
        .map((s) => ({
          name: s?.name?.trim() || '',
          logo:
            (s?.use_dark_variant ? s?.logo_dark_url : null) ||
            s?.logo_url ||
            s?.logo_dark_url ||
            null,
        }))
        .filter((s) => s.name || s.logo) ?? []

    if (structuredSponsors.length > 0) return structuredSponsors

    return (event?.sponsor_logo_urls ?? []).map((logo, index) => ({
      name: `Sponsor ${index + 1}`,
      logo,
    }))
  }, [business?.sponsors, event?.sponsor_logo_urls])
  const trackState = useMemo(() => {
    if (!displayMoto) {
      return {
        label: 'Waiting Feed',
        dotClass: 'bg-amber-400',
        textClass: 'text-amber-300',
      }
    }
    if (isMotoLive(displayMoto.status)) {
      return {
        label: 'Track Live',
        dotClass: 'bg-emerald-400 shadow-[0_0_14px_rgba(74,222,128,0.85)]',
        textClass: 'text-emerald-300',
      }
    }
    return {
      label: displayMoto.status,
      dotClass: 'bg-slate-400',
      textClass: 'text-slate-200',
    }
  }, [displayMoto])

  const riderPhotoCell = (name: string, noPlate: string, photoUrl?: string | null, size: 'default' | 'podium' = 'default') => {
    const frameClass =
      size === 'podium'
        ? 'h-20 w-20 overflow-hidden rounded-full border-2 border-slate-300 shadow-md'
        : 'h-14 w-14 overflow-hidden rounded-full border-2 border-slate-300 shadow-sm'
    const imageClass =
      size === 'podium'
        ? 'h-full w-full object-cover object-[center_24%] scale-[1.32]'
        : 'h-full w-full object-cover object-[center_22%] scale-[1.22]'
    const fallbackClass =
      size === 'podium'
        ? 'inline-flex h-20 w-20 items-center justify-center rounded-full border-2 border-slate-300 bg-slate-100 text-base font-black text-slate-700'
        : 'inline-flex h-14 w-14 items-center justify-center rounded-full border-2 border-slate-300 bg-slate-100 text-xs font-black text-slate-700'
    if (photoUrl) {
      return (
        <div className={frameClass}>
          <img
            src={photoUrl}
            alt={name}
            className={imageClass}
            loading="lazy"
          />
        </div>
      )
    }
    return (
      <div className={fallbackClass}>
        {noPlate || '-'}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <main className="mx-auto flex min-h-screen w-full max-w-[1920px] flex-col gap-6 px-4 py-4">
        <section className="relative overflow-hidden rounded-[28px] border border-slate-700/70 bg-slate-900 shadow-2xl">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(15,23,42,0.16)_0%,rgba(15,23,42,0.05)_32%,rgba(251,191,36,0.10)_100%)]" />
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-slate-100/10 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-amber-200/10 blur-3xl" />
          <div className="relative z-10 grid gap-5 px-6 py-6">
            <div className="grid items-start gap-6 xl:grid-cols-[1fr_auto_340px]">
              <div className="grid gap-2">
                <h1 className="text-3xl font-black tracking-tight text-white drop-shadow-[0_4px_16px_rgba(15,23,42,0.32)] md:text-5xl">
                  {publicEventTitle}
                </h1>
                <p className="text-base font-black uppercase tracking-[0.18em] text-amber-200">
                  {publicBrandName || categoryLabel || 'Live Feed'}
                </p>
                {publicTagline && <p className="text-base font-semibold text-slate-100/90">{publicTagline}</p>}
                {event?.location && <p className="text-base font-semibold text-slate-200/85">{event.location}</p>}
              </div>
              <div className="flex justify-center xl:pt-3">
                <span className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-5 py-3 text-center text-lg font-black uppercase tracking-[0.14em] text-emerald-200 shadow-[0_0_24px_rgba(52,211,153,0.15)]">
                  Kategori Peserta: {categoryLabel || '-'}
                </span>
              </div>
              <div className="grid min-w-[340px] gap-3">
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
                  <span className="text-sm font-bold uppercase tracking-[0.14em] text-slate-300">Current Feed</span>
                  <span className="text-lg font-black text-white">{displayMoto?.moto_name ?? '-'}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
                  <span className="text-sm font-bold uppercase tracking-[0.14em] text-slate-300">Status</span>
                  <span className={`text-lg font-black ${trackState.textClass}`}>{trackState.label}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {displaySponsors.length > 0 && (
          <section className="overflow-hidden rounded-[22px] border border-amber-300/20 bg-slate-900/90 shadow-xl">
            <div className="live-display-marquee flex min-w-max items-center gap-10 px-6 py-4">
              {[...displaySponsors, ...displaySponsors].map((sponsor, index) => (
                <div key={`${sponsor.name || 'sponsor'}-${index}`} className="flex items-center gap-4 whitespace-nowrap">
                  {sponsor.logo ? (
                    <img
                      src={sponsor.logo}
                      alt={sponsor.name || 'Sponsor'}
                      className="h-12 w-auto max-w-[140px] object-contain"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        )}

        {loading && <LoadingState />}
        {!loading && event?.is_public === false && <EmptyState label="Event ini sedang disembunyikan dari publik." />}
        {!loading && event?.is_public !== false && !hasData && <EmptyState label="Belum ada data race untuk kategori ini." />}

        {!loading && event?.is_public !== false && hasData && (
          <>
            <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
              <section className="rounded-[24px] border border-sky-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-sky-100 px-6 py-4">
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-[0.08em] text-slate-900">
                      {showResultBoard
                        ? `${resultBoard?.title ?? 'Final Result'}`
                        : activeStageView
                          ? activeStageView.title
                        : liveBatchView
                          ? `Batch ${liveBatchView.batch_index} - Live Results`
                          : 'Live Results'}
                    </h2>
                    <p className="text-sm font-semibold text-slate-500">
                      {showResultBoard ? 'Hasil akhir moto terakhir yang baru selesai.' : 'Urut otomatis berdasarkan rank terbaru.'}
                    </p>
                  </div>
                  <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-extrabold uppercase tracking-[0.12em] text-emerald-700">
                    {refreshing ? 'Refreshing' : showResultBoard ? 'Result Board' : 'Live Feed'}
                  </div>
                </div>

                {showResultBoard && resultBoard ? (
                  <div className="grid gap-4 p-4 md:p-6">
                    {podiumRows.length > 0 && (
                      <div className="grid gap-4 md:grid-cols-3">
                        {podiumRows.map((row) => (
                          <div
                            key={`podium-${row.rider_id}`}
                            className={`rounded-[22px] border px-4 py-4 shadow-sm ${
                              row.rank === 1
                                ? 'border-amber-300 bg-amber-50'
                                : row.rank === 2
                                  ? 'border-slate-300 bg-slate-50'
                                  : 'border-orange-200 bg-orange-50'
                            }`}
                          >
                            <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Rank {row.rank}</div>
                            <div className="mt-3 flex items-center gap-3">
                              {riderPhotoCell(row.name, row.no_plate, row.photo_thumbnail_url, 'podium')}
                              <div className="min-w-0">
                                <div className="truncate text-lg font-black italic text-slate-900">{row.name}</div>
                                <div className="text-sm font-bold text-slate-600">{row.no_plate} • {row.club || '-'}</div>
                              </div>
                            </div>
                            <div className="mt-3 text-sm font-extrabold text-slate-700">
                              {resultBoardPointLabel} {row.point ?? '-'}{row.penalty_total ? ` + Penalty ${row.penalty_total}` : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="overflow-hidden rounded-[18px] border border-slate-200">
                      <table className="w-full border-collapse text-xs md:text-sm">
                        <thead>
                          <tr className="bg-slate-900 text-left font-black uppercase tracking-[0.12em] text-white">
                          {['Rank', 'Plate', 'Nama Rider', 'Komunitas', resultBoardPointLabel, 'Penalty', 'Status'].map((h) => (
                              <th key={h} className="px-3 py-3">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {resultBoard.rows.map((row, rowIndex) => (
                            <tr
                              key={`stage-${row.rider_id}`}
                              className={`border-t border-slate-100 ${
                                row.rank === 1 ? 'bg-amber-50/70' : rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'
                              }`}
                            >
                              <td className="px-3 py-3 text-2xl font-black text-emerald-700">{row.rank ?? '-'}</td>
                              <td className="px-3 py-3 text-sm font-black text-slate-700">{row.no_plate}</td>
                              <td className="px-3 py-3">
                                <div className="flex items-center gap-3">
                                  {riderPhotoCell(row.name, row.no_plate, row.photo_thumbnail_url)}
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-lg font-black italic tracking-wide text-slate-900">{row.name}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-sm font-bold text-slate-600">{row.club || '-'}</td>
                              <td className="px-2 py-3 text-xl font-black text-slate-900">{row.point ?? '-'}</td>
                              <td className="px-2 py-3 text-sm font-extrabold text-amber-600">{row.penalty_total ?? '-'}</td>
                              <td className="px-3 py-3 text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-600">
                                {row.rank ? 'Official Result' : 'Pending'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : activeStageView ? (
                  <div className="overflow-hidden">
                    <table className="w-full border-collapse text-xs md:text-sm">
                      <colgroup>
                        <col style={{ width: '72px' }} />
                        <col style={{ width: '76px' }} />
                        <col style={{ width: '92px' }} />
                        <col style={{ width: '32%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '72px' }} />
                        <col style={{ width: '88px' }} />
                        <col style={{ width: '108px' }} />
                      </colgroup>
                      <thead>
                        <tr className="bg-sky-100/90 text-left font-black uppercase tracking-[0.12em] text-slate-700">
                          {['Gate', 'Rank', 'Plate', 'Nama Rider', 'Komunitas', 'Point', 'Penalty', 'Status'].map((h) => (
                            <th key={h} className="px-3 py-3">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeStageView.rows.map((row, rowIndex) => (
                          <tr
                            key={`live-stage-${row.rider_id}`}
                            className={`border-t border-slate-100 ${
                              row.rank === 1
                                ? 'bg-amber-50/75'
                                : rowIndex % 2 === 0
                                  ? 'bg-sky-50/40'
                                : 'bg-white'
                            }`}
                          >
                            <td className="px-3 py-3 text-xl font-black text-slate-700">{row.gate ?? '-'}</td>
                            <td className="px-3 py-3 text-2xl font-black text-emerald-700">{row.rank ?? '-'}</td>
                            <td className="px-3 py-3 text-sm font-black text-slate-700">{row.no_plate}</td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-3">
                                {riderPhotoCell(row.name, row.no_plate, row.photo_thumbnail_url)}
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-lg font-black italic tracking-wide text-slate-900">{row.name}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-sm font-bold text-slate-600">{row.club || '-'}</td>
                            <td className="px-2 py-3 text-xl font-black text-slate-900">{row.point ?? '-'}</td>
                            <td className="px-2 py-3 text-sm font-extrabold text-amber-600">{row.penalty_total ?? '-'}</td>
                            <td className="px-3 py-3 text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-600">
                              {row.status}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : !liveBatchView ? (
                  <div className="p-6 text-lg font-semibold text-slate-500">Belum ada batch live yang aktif.</div>
                ) : (
                  <div className="overflow-hidden">
                    <table className="w-full border-collapse text-xs md:text-sm">
                      <colgroup>
                        <col style={{ width: '76px' }} />
                        <col style={{ width: '92px' }} />
                        <col style={{ width: '36%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '54px' }} />
                        <col style={{ width: '54px' }} />
                        <col style={{ width: '76px' }} />
                        <col style={{ width: '76px' }} />
                        <col style={{ width: '108px' }} />
                      </colgroup>
                      <thead>
                        <tr className="bg-sky-100/90 text-left font-black uppercase tracking-[0.12em] text-slate-700">
                          {['Rank', 'Plate', 'Nama Rider', 'Komunitas', 'M1', 'M2', ...(showLiveMoto3 ? ['M3'] : []), 'Penalty', 'Total', 'Class'].map((h) => (
                            <th key={h} className="px-3 py-3">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {liveBatchView.rows.map((row, rowIndex) => (
                          <tr
                            key={row.rider_id}
                            className={`border-t border-slate-100 ${
                              row.rank_point === 1
                                ? 'bg-amber-50/75'
                                : rowIndex % 2 === 0
                                ? 'bg-sky-50/40'
                                : 'bg-white'
                            }`}
                          >
                            <td className="px-3 py-3 text-2xl font-black text-emerald-700">{row.rank_point ?? '-'}</td>
                            <td className="px-3 py-3 text-sm font-black text-slate-700">{row.no_plate}</td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-3">
                                {riderPhotoCell(displayName(row), row.no_plate, row.photo_thumbnail_url)}
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-lg font-black italic tracking-wide text-slate-900">{displayName(row)}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-sm font-bold text-slate-600">{row.club || '-'}</td>
                            <td className="px-2 py-3 text-sm font-extrabold text-slate-700">{row.point_moto1 ?? '-'}</td>
                            <td className="px-2 py-3 text-sm font-extrabold text-slate-700">{row.point_moto2 ?? '-'}</td>
                            {showLiveMoto3 && <td className="px-2 py-3 text-sm font-extrabold text-slate-700">{row.point_moto3 ?? '-'}</td>}
                            <td className="px-2 py-3 text-sm font-extrabold text-amber-600">{row.penalty_total ?? '-'}</td>
                            <td className="px-2 py-3 text-xl font-black text-slate-900">{row.total_point ?? '-'}</td>
                            <td className="px-3 py-3 text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-600">
                              {row.class_label || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="rounded-[24px] border border-slate-700 bg-slate-900 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
                  <div>
                    <h2 className="text-2xl font-black uppercase tracking-[0.08em] text-white">Waiting Feed</h2>
                    <p className="text-sm font-semibold text-slate-400">{queueTarget?.label ?? 'Belum ada moto berikutnya'}</p>
                    <p className="text-sm font-bold uppercase tracking-[0.12em] text-amber-200">
                      Kategori: {queueLiveScore?.categoryLabel ?? (sameCategoryQueueAfterDisplayMoto ? categoryLabel : nextCategoryCandidate?.label) ?? '-'}
                    </p>
                  </div>
                  <div className="rounded-full border border-amber-300/40 bg-amber-300/15 px-4 py-2 text-sm font-extrabold uppercase tracking-[0.12em] text-amber-200">
                    Next Moto
                  </div>
                </div>

                {prepareQueue.length === 0 ? (
                  <div className="p-6 text-lg font-semibold text-slate-400">
                    {sameCategoryQueueAfterDisplayMoto
                      ? `Moto berikutnya di kategori ${categoryLabel || '-'} belum punya gate yang siap ditampilkan.`
                      : nextCategoryCandidate
                      ? `Kategori berikutnya ${nextCategoryCandidate.label} belum punya moto/gate yang siap ditampilkan.`
                      : 'Belum ada moto berikutnya untuk ditampilkan.'}
                  </div>
                ) : (
                  <div className="overflow-hidden">
                    <table className="w-full border-collapse text-xs md:text-sm">
                      <colgroup>
                        <col style={{ width: '82px' }} />
                        <col style={{ width: '92px' }} />
                        <col style={{ width: '42%' }} />
                        <col style={{ width: '18%' }} />
                      </colgroup>
                      <thead>
                        <tr className="bg-slate-800 text-left font-black uppercase tracking-[0.12em] text-slate-300">
                          {['Gate', 'Plate', 'Nama Rider', 'Komunitas'].map((h) => (
                            <th key={h} className="px-3 py-3">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {prepareQueue.map((row, index) => (
                          <tr
                            key={`prepare-${row.rider_id}`}
                            className={`border-t border-slate-800 ${
                              index === 0 ? 'bg-amber-300/10' : index % 2 === 0 ? 'bg-slate-900' : 'bg-slate-950'
                            }`}
                          >
                            <td className="px-3 py-3 text-xl font-black text-white">{row.gate ?? '-'}</td>
                            <td className="px-3 py-3 text-sm font-black text-slate-200">{row.no_plate}</td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-3">
                                {riderPhotoCell(displayName(row), row.no_plate, row.photo_thumbnail_url)}
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-lg font-black italic tracking-wide text-white">{displayName(row)}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-sm font-bold text-slate-300">{row.club || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          </>
        )}

        <section className="sticky bottom-0 z-30 rounded-[24px] border border-slate-800 bg-slate-950/95 px-6 py-4 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 border-l-4 border-amber-400 pl-4">
              <span className={`h-3 w-3 rounded-full ${trackState.dotClass} ${isMotoLive(displayMoto?.status) ? 'animate-pulse' : ''}`} />
              <span className={`text-lg font-black uppercase tracking-[0.16em] ${trackState.textClass}`}>{trackState.label}</span>
            </div>
            <div className="text-lg font-bold text-slate-200">Moto: {displayMoto?.moto_name ?? '-'}</div>
            <div className="text-lg font-bold text-slate-200">Kategori: {categoryLabel || '-'}</div>
          </div>
        </section>
      </main>
      <style>{`
        @keyframes live-display-marquee {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }

        .live-display-marquee {
          animation: live-display-marquee 26s linear infinite;
          will-change: transform;
        }
      `}</style>
    </div>
  )
}
