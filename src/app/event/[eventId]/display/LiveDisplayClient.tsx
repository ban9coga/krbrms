'use client'

import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../../../../components/EmptyState'
import LoadingState from '../../../../components/LoadingState'
import { getEventById, getEventCategories, type EventItem } from '../../../../lib/eventService'
import { compareMotoSequence } from '../../../../lib/motoSequence'
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
}

type MotoItem = {
  id: string
  category_id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
}

const gateByMoto = (row: Row, motoIndex: number) => {
  if (motoIndex === 1) return row.gate_moto1
  if (motoIndex === 2) return row.gate_moto2
  return row.gate_moto3
}

export default function LiveDisplayClient({
  eventId,
  initialEvent = null,
}: {
  eventId: string
  initialEvent?: EventItem | null
}) {
  const [event, setEvent] = useState<EventItem | null>(initialEvent)
  const [scoreCategoryIds, setScoreCategoryIds] = useState<string[]>([])
  const [liveScoreByCategory, setLiveScoreByCategory] = useState<Record<string, { categoryLabel: string; batches: Batch[] }>>({})
  const [eventMotos, setEventMotos] = useState<MotoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const eventData = initialEvent ?? (await getEventById(eventId))
        const cats = (await getEventCategories(eventId)).filter((c) => c.enabled)
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
    const liveIndex = liveMoto ? data.findIndex((m) => m.id === liveMoto.id) : -1
    const nextMoto = liveIndex >= 0 ? data[liveIndex + 1] ?? null : null
    const categoryIds = Array.from(
      new Set([liveMoto?.category_id, nextMoto?.category_id].filter((value): value is string => Boolean(value)))
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
        const res = await fetch(`/api/public/events/${eventId}/live-score?category_id=${encodeURIComponent(id)}`)
        const json = await res.json()
        const data = (json?.data ?? {}) as LiveScorePayload
        return [
          id,
          {
            categoryLabel: data.category ?? '',
            batches: data.batches ?? [],
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
  const queueMoto = useMemo(() => {
    if (!activeMoto) return null
    const activeIndex = eventMotos.findIndex((m) => m.id === activeMoto.id)
    return activeIndex >= 0 ? eventMotos[activeIndex + 1] ?? null : null
  }, [eventMotos, activeMoto])
  const activeLiveScore = activeMoto ? liveScoreByCategory[activeMoto.category_id] : null
  const queueLiveScore = queueMoto ? liveScoreByCategory[queueMoto.category_id] : null
  const categoryLabel = activeLiveScore?.categoryLabel ?? ''
  const batches = useMemo(() => activeLiveScore?.batches ?? [], [activeLiveScore])
  const queueBatches = useMemo(() => queueLiveScore?.batches ?? [], [queueLiveScore])

  const hasData = useMemo(
    () => batches.some((batch) => batch.rows.length > 0) || queueBatches.some((batch) => batch.rows.length > 0),
    [batches, queueBatches]
  )
  const sortedBatches = useMemo(() => [...batches].sort((a, b) => a.batch_index - b.batch_index), [batches])
  const queueSortedBatches = useMemo(() => [...queueBatches].sort((a, b) => a.batch_index - b.batch_index), [queueBatches])

  const activeBatch = useMemo(() => {
    if (!activeMoto) return null
    return sortedBatches.find((b) => b.moto1_id === activeMoto.id || b.moto2_id === activeMoto.id || b.moto3_id === activeMoto.id) ?? null
  }, [sortedBatches, activeMoto])

  const liveBatchView = useMemo(() => {
    if (!activeBatch) return null
    return {
      ...activeBatch,
      rows: [...activeBatch.rows].sort((a, b) => (a.rank_point ?? 9999) - (b.rank_point ?? 9999)),
    }
  }, [activeBatch])

  const queueTarget = useMemo(() => {
    if (!queueMoto || queueSortedBatches.length === 0) return null
    const batch =
      queueSortedBatches.find(
        (item) => item.moto1_id === queueMoto.id || item.moto2_id === queueMoto.id || item.moto3_id === queueMoto.id
      ) ?? null
    if (!batch) return null
    const motoIndex: 1 | 2 | 3 =
      batch.moto1_id === queueMoto.id ? 1 : batch.moto2_id === queueMoto.id ? 2 : 3
    return {
      batch,
      motoIndex,
      label: `Batch ${batch.batch_index} - Moto ${motoIndex}`,
    }
  }, [queueMoto, queueSortedBatches])

  const prepareQueue = useMemo(() => {
    if (!queueTarget) return []
    const sorted = [...queueTarget.batch.rows].sort(
      (a, b) => (gateByMoto(a, queueTarget.motoIndex) ?? 9999) - (gateByMoto(b, queueTarget.motoIndex) ?? 9999)
    )

    return sorted
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
    if (!activeMoto) {
      return {
        label: 'Waiting Feed',
        dotClass: 'bg-amber-400',
        textClass: 'text-amber-300',
      }
    }
    if (isMotoLive(activeMoto.status)) {
      return {
        label: 'Track Live',
        dotClass: 'bg-emerald-400 shadow-[0_0_14px_rgba(74,222,128,0.85)]',
        textClass: 'text-emerald-300',
      }
    }
    return {
      label: activeMoto.status,
      dotClass: 'bg-slate-400',
      textClass: 'text-slate-200',
    }
  }, [activeMoto])

  const riderPhotoCell = (name: string, noPlate: string, photoUrl?: string | null) => {
    if (photoUrl) {
      return (
        <img
          src={photoUrl}
          alt={name}
          className="h-10 w-10 rounded-full border border-slate-300 object-cover shadow-sm"
          loading="lazy"
        />
      )
    }
    return (
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-[10px] font-black text-slate-700">
        {noPlate || '-'}
      </div>
    )
  }

  const displayName = (row: Pick<Row, 'rider_nickname' | 'name'> | { rider_nickname?: string | null; name: string }) =>
    row.rider_nickname?.trim() || row.name

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <main className="mx-auto flex min-h-screen w-full max-w-[1920px] flex-col gap-6 px-4 py-4">
        <section className="relative overflow-hidden rounded-[28px] border border-slate-700/70 bg-slate-900 shadow-2xl">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(15,23,42,0.16)_0%,rgba(15,23,42,0.05)_32%,rgba(251,191,36,0.10)_100%)]" />
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-slate-100/10 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-amber-200/10 blur-3xl" />
          <div className="relative z-10 grid gap-5 px-6 py-6">
            <div className="flex items-start justify-between gap-6">
              <div className="grid gap-2">
                <h1 className="text-3xl font-black tracking-tight text-white drop-shadow-[0_4px_16px_rgba(15,23,42,0.32)] md:text-5xl">
                  {publicEventTitle}
                </h1>
                <p className="text-base font-black uppercase tracking-[0.18em] text-amber-200">
                  {publicBrandName || categoryLabel || 'Live Feed'}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-4 py-2 text-base font-black uppercase tracking-[0.14em] text-emerald-200">
                    Kategori Peserta: {categoryLabel || '-'}
                  </span>
                </div>
                {publicTagline && <p className="text-base font-semibold text-slate-100/90">{publicTagline}</p>}
                {event?.location && <p className="text-base font-semibold text-slate-200/85">{event.location}</p>}
              </div>
              <div className="grid min-w-[340px] gap-3">
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
                  <span className="text-sm font-bold uppercase tracking-[0.14em] text-slate-300">Current Feed</span>
                  <span className="text-lg font-black text-white">{activeMoto?.moto_name ?? '-'}</span>
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
                  {sponsor.name ? (
                    <span className="text-lg font-black uppercase tracking-[0.14em] text-amber-200">{sponsor.name}</span>
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
                      {liveBatchView ? `Batch ${liveBatchView.batch_index} - Live Results` : 'Live Results'}
                    </h2>
                    <p className="text-sm font-semibold text-slate-500">Urut otomatis berdasarkan rank terbaru.</p>
                  </div>
                  <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-extrabold uppercase tracking-[0.12em] text-emerald-700">
                    {refreshing ? 'Refreshing' : 'Live Feed'}
                  </div>
                </div>

                {!liveBatchView ? (
                  <div className="p-6 text-lg font-semibold text-slate-500">Belum ada batch live yang aktif.</div>
                ) : (
                  <div className="overflow-hidden">
                    <table className="w-full table-fixed border-collapse text-xs md:text-sm">
                      <thead>
                        <tr className="bg-sky-100/90 text-left font-black uppercase tracking-[0.12em] text-slate-700">
                          {['Rank', 'Plate', 'Panggilan', 'Komunitas', 'M1', 'M2', 'Penalty', 'Total', 'Class'].map((h) => (
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
                                <div className="min-w-0">
                                  <div className="truncate text-base font-black italic tracking-wide text-slate-900">{displayName(row)}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-sm font-bold text-slate-600">{row.club || '-'}</td>
                            <td className="px-2 py-3 text-sm font-extrabold text-slate-700">{row.point_moto1 ?? '-'}</td>
                            <td className="px-2 py-3 text-sm font-extrabold text-slate-700">{row.point_moto2 ?? '-'}</td>
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
                  </div>
                  <div className="rounded-full border border-amber-300/40 bg-amber-300/15 px-4 py-2 text-sm font-extrabold uppercase tracking-[0.12em] text-amber-200">
                    Next Moto
                  </div>
                </div>

                {prepareQueue.length === 0 ? (
                  <div className="p-6 text-lg font-semibold text-slate-400">Belum ada moto berikutnya untuk ditampilkan.</div>
                ) : (
                  <div className="overflow-hidden">
                    <table className="w-full table-fixed border-collapse text-xs md:text-sm">
                      <thead>
                        <tr className="bg-slate-800 text-left font-black uppercase tracking-[0.12em] text-slate-300">
                          {['Gate', 'Plate', 'Panggilan', 'Komunitas'].map((h) => (
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
                                <div className="min-w-0">
                                  <div className="truncate text-base font-black italic tracking-wide text-white">{displayName(row)}</div>
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
              <span className={`h-3 w-3 rounded-full ${trackState.dotClass} ${isMotoLive(activeMoto?.status) ? 'animate-pulse' : ''}`} />
              <span className={`text-lg font-black uppercase tracking-[0.16em] ${trackState.textClass}`}>{trackState.label}</span>
            </div>
            <div className="text-lg font-bold text-slate-200">Moto: {activeMoto?.moto_name ?? '-'}</div>
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
