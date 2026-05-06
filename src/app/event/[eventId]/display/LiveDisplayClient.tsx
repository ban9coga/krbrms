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
  const [liveMotoCategoryIds, setLiveMotoCategoryIds] = useState<string[]>([])
  const [liveScoreByCategory, setLiveScoreByCategory] = useState<Record<string, { categoryLabel: string; batches: Batch[] }>>({})
  const [liveMotos, setLiveMotos] = useState<MotoItem[]>([])
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
          setLiveMotoCategoryIds([])
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
    const data = ((json?.data ?? []) as MotoItem[]).filter((m) => isMotoLive(m.status)).sort(compareMotoSequence)
    const categoryIds = Array.from(new Set(data.map((m) => m.category_id)))
    setLiveMotos(data)
    setLiveMotoCategoryIds(categoryIds)
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
    fetchLiveScores(liveMotoCategoryIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, liveMotoCategoryIds.join(',')])

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
  }, [eventId, liveMotoCategoryIds.join(',')])

  const activeMoto = liveMotos[0] ?? null
  const queueMoto = liveMotos[1] ?? null
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
  const showMoto3 = sortedBatches.length <= 1
  const queueSortedBatches = useMemo(() => [...queueBatches].sort((a, b) => a.batch_index - b.batch_index), [queueBatches])
  const queueShowMoto3 = queueSortedBatches.length <= 1

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
    if (motoIndex === 3 && !queueShowMoto3) return null
    return {
      batch,
      motoIndex,
      label: `Batch ${batch.batch_index} - Moto ${motoIndex}`,
    }
  }, [queueMoto, queueSortedBatches, queueShowMoto3])

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
        club: row.club,
        photo_thumbnail_url: row.photo_thumbnail_url ?? null,
      }))
  }, [queueTarget])

  const business = event?.business_settings ?? null
  const publicEventTitle = business?.public_event_title?.trim() || event?.name || 'Live Display'
  const publicBrandName = business?.public_brand_name?.trim() || ''
  const publicTagline = business?.public_tagline?.trim() || ''
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
                    <table className="w-full table-fixed border-collapse text-sm md:text-base">
                      <thead>
                        <tr className="bg-sky-100/90 text-left font-black uppercase tracking-[0.12em] text-slate-700">
                          {['Rank', 'No Plate', 'Nama Peserta', 'M1', 'M2', ...(showMoto3 ? ['M3'] : []), 'Penalty', 'Total', 'Class'].map((h) => (
                            <th key={h} className="px-4 py-4">
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
                            <td className="px-4 py-4 text-3xl font-black text-emerald-700">{row.rank_point ?? '-'}</td>
                            <td className="px-4 py-4 text-lg font-black text-slate-700">{row.no_plate}</td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                {riderPhotoCell(row.name, row.no_plate, row.photo_thumbnail_url)}
                                <div className="min-w-0">
                                  <div className="truncate text-xl font-black italic tracking-wide text-slate-900">{row.name}</div>
                                  <div className="truncate text-sm font-semibold text-slate-500">{row.club || '-'}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-lg font-extrabold text-slate-700">{row.point_moto1 ?? '-'}</td>
                            <td className="px-4 py-4 text-lg font-extrabold text-slate-700">{row.point_moto2 ?? '-'}</td>
                            {showMoto3 && (
                              <td className="px-4 py-4 text-lg font-extrabold text-slate-700">{row.point_moto3 ?? '-'}</td>
                            )}
                            <td className="px-4 py-4 text-lg font-extrabold text-amber-600">{row.penalty_total ?? '-'}</td>
                            <td className="px-4 py-4 text-3xl font-black text-slate-900">{row.total_point ?? '-'}</td>
                            <td className="px-4 py-4 text-sm font-extrabold uppercase tracking-[0.08em] text-slate-600">
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
                    <p className="text-sm font-semibold text-slate-400">{queueTarget?.label ?? 'Belum ada moto live berikutnya'}</p>
                  </div>
                  <div className="rounded-full border border-amber-300/40 bg-amber-300/15 px-4 py-2 text-sm font-extrabold uppercase tracking-[0.12em] text-amber-200">
                    Next Moto
                  </div>
                </div>

                {prepareQueue.length === 0 ? (
                  <div className="p-6 text-lg font-semibold text-slate-400">Belum ada moto lain yang berstatus LIVE.</div>
                ) : (
                  <div className="overflow-hidden">
                    <table className="w-full table-fixed border-collapse text-sm md:text-base">
                      <thead>
                        <tr className="bg-slate-800 text-left font-black uppercase tracking-[0.12em] text-slate-300">
                          {['Queue', 'Gate', 'No Plate', 'Nama Peserta'].map((h) => (
                            <th key={h} className="px-4 py-4">
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
                            <td className="px-4 py-4 text-2xl font-black text-amber-200">{row.queue}</td>
                            <td className="px-4 py-4 text-2xl font-black text-white">{row.gate ?? '-'}</td>
                            <td className="px-4 py-4 text-lg font-black text-slate-200">{row.no_plate}</td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-3">
                                {riderPhotoCell(row.name, row.no_plate, row.photo_thumbnail_url)}
                                <div className="min-w-0">
                                  <div className="truncate text-xl font-black italic tracking-wide text-white">{row.name}</div>
                                  <div className="truncate text-sm font-semibold text-slate-400">{row.club || '-'}</div>
                                </div>
                              </div>
                            </td>
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
    </div>
  )
}
