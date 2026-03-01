'use client'

import { useEffect, useMemo, useState } from 'react'
import EmptyState from '../../../../components/EmptyState'
import LoadingState from '../../../../components/LoadingState'
import PublicTopbar from '../../../../components/PublicTopbar'
import { getEventById, getEventCategories, type EventItem, type RiderCategory } from '../../../../lib/eventService'
import { isMotoLive, isMotoUpcoming } from '../../../../lib/motoStatus'

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

type Mode = 'LINEUP' | 'RESULTS' | 'WINNERS'

const gateByMoto = (row: Row, motoIndex: number) => {
  if (motoIndex === 1) return row.gate_moto1
  if (motoIndex === 2) return row.gate_moto2
  return row.gate_moto3
}

const modeOptions: Mode[] = ['LINEUP', 'RESULTS', 'WINNERS']

export default function LiveDisplayClient({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventItem | null>(null)
  const [categories, setCategories] = useState<RiderCategory[]>([])
  const [categoryId, setCategoryId] = useState<string>('')
  const [categoryLabel, setCategoryLabel] = useState<string>('')
  const [batches, setBatches] = useState<Batch[]>([])
  const [activeMoto, setActiveMoto] = useState<MotoItem | null>(null)
  const [mode, setMode] = useState<Mode>('RESULTS')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const eventData = await getEventById(eventId)
        const cats = (await getEventCategories(eventId)).filter((c) => c.enabled)
        setEvent(eventData)
        setCategories(cats)
        if (!categoryId && cats.length > 0) setCategoryId(cats[0].id)
      } finally {
        setLoading(false)
      }
    }
    if (eventId) load()
  }, [eventId, categoryId])

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
    const data = (json?.data ?? []) as MotoItem[]
    const live = data.find((m) => isMotoLive(m.status)) ?? null
    const upcoming = data
      .filter((m) => isMotoUpcoming(m.status))
      .sort((a, b) => a.moto_order - b.moto_order)[0]
    const nextActive = live ?? upcoming ?? null
    setActiveMoto(nextActive)
    if (nextActive && nextActive.category_id !== categoryId) {
      setCategoryId(nextActive.category_id)
    }
  }

  const fetchLiveScore = async (id: string) => {
    if (!id) return
    const res = await fetch(
      `/api/public/events/${eventId}/live-score?category_id=${encodeURIComponent(id)}&include_upcoming=1`
    )
    const json = await res.json()
    const data = (json?.data ?? {}) as LiveScorePayload
    setCategoryLabel(data.category ?? '')
    setBatches(data.batches ?? [])
  }

  useEffect(() => {
    if (categoryId) fetchLiveScore(categoryId)
    fetchMotos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, eventId])

  const refresh = async () => {
    if (!categoryId) return
    setRefreshing(true)
    try {
      await fetchLiveScore(categoryId)
      await fetchMotos()
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (!categoryId) return
    const interval = setInterval(() => {
      refresh()
    }, 10000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, eventId])

  const hasData = useMemo(() => batches.some((batch) => batch.rows.length > 0), [batches])
  const activeBatch = useMemo(() => {
    if (!activeMoto) return null
    return batches.find((b) => b.moto1_id === activeMoto.id || b.moto2_id === activeMoto.id || b.moto3_id === activeMoto.id) ?? null
  }, [batches, activeMoto])

  const batchView = useMemo(() => {
    if (!activeBatch) return batches
    return [activeBatch]
  }, [activeBatch, batches])

  const winnersByBatch = useMemo(() => {
    return batchView.map((batch) => {
      const rows = [...batch.rows].sort((a, b) => (a.rank_point ?? 9999) - (b.rank_point ?? 9999))
      return {
        batch_index: batch.batch_index,
        winners: rows.slice(0, 3),
      }
    })
  }, [batchView])

  const queueTarget = useMemo(() => {
    const sortedBatches = [...batches].sort((a, b) => a.batch_index - b.batch_index)
    if (sortedBatches.length === 0) return null

    if (sortedBatches.length === 1) {
      const batch = sortedBatches[0]
      const hasMoto2Gate = batch.rows.some((row) => row.gate_moto2 != null)
      const motoIndex = hasMoto2Gate ? 2 : 1
      return {
        batch,
        motoIndex,
        label: `Batch ${batch.batch_index} - Moto ${motoIndex}`,
      }
    }

    const currentBatch = activeBatch ?? sortedBatches[0]
    const nextBatch = sortedBatches.find((batch) => batch.batch_index > currentBatch.batch_index) ?? sortedBatches[0]
    return {
      batch: nextBatch,
      motoIndex: 1 as const,
      label: `Batch ${nextBatch.batch_index} - Moto 1`,
    }
  }, [batches, activeBatch])

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

  const nextUp = useMemo(() => prepareQueue[0] ?? null, [prepareQueue])

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
    <div className="public-page overflow-x-hidden">
      <PublicTopbar />
      <main className="public-main max-w-[1500px]">
        <section className="public-hero">
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-rose-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
          <div className="relative z-10 grid gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-1">
                <h1 className="text-2xl font-black tracking-tight text-white md:text-4xl">{event?.name ?? 'Live Display'}</h1>
                <p className="text-sm font-semibold text-slate-200">{categoryLabel || 'Pilih Kategori'}</p>
                {event?.location && <p className="text-sm font-medium text-slate-300">{event.location}</p>}
                {activeMoto && (
                  <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-rose-200">
                    Now: {activeMoto.moto_name} ({activeMoto.status})
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-sm font-semibold text-white outline-none"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id} className="text-slate-900">
                      {c.label}
                    </option>
                  ))}
                </select>
                {modeOptions.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`rounded-full border px-3 py-2 text-xs font-extrabold uppercase tracking-[0.12em] transition-colors sm:text-sm ${
                      mode === m
                        ? 'border-rose-300 bg-rose-500 text-white'
                        : 'border-white/25 bg-white/10 text-white hover:bg-white/20'
                    }`}
                  >
                    {m === 'LINEUP' ? 'Lineup' : m === 'RESULTS' ? 'Live Results' : 'Winners'}
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

            {nextUp && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50/95 px-4 py-3 text-sm font-bold text-amber-900">
                <span className="rounded-full border border-amber-300 bg-amber-100 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em]">
                  Next Up
                </span>
                <span>{nextUp.name}</span>
                <span>No: {nextUp.no_plate}</span>
                <span>Gate {nextUp.gate ?? '-'}</span>
              </div>
            )}
          </div>
        </section>

        {loading && <LoadingState />}
        {!loading && event?.is_public === false && <EmptyState label="Event ini sedang disembunyikan dari publik." />}
        {!loading && event?.is_public !== false && !hasData && <EmptyState label="Belum ada data race untuk kategori ini." />}

        {!loading && event?.is_public !== false && hasData && mode === 'LINEUP' && (
          <section className="grid gap-4">
            {batchView.map((batch) => {
              const rows = [...batch.rows].sort((a, b) => (a.gate_moto1 ?? 9999) - (b.gate_moto1 ?? 9999))
              return (
                <article key={batch.batch_index} className="public-panel-dark">
                  <h2 className="mb-3 text-lg font-black uppercase tracking-[0.08em] text-white">Batch {batch.batch_index} - Lineup</h2>
                  <div className="public-table-wrap">
                    <table className="public-table" style={{ minWidth: 900 }}>
                      <thead>
                        <tr>
                          {['Gate M1', 'Gate M2', 'Gate M3', 'Foto', 'Nama Peserta', 'No Plat', 'Komunitas'].map((h) => (
                            <th key={h}>{h}</th>
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
                            <td className="font-extrabold text-slate-900">{row.name}</td>
                            <td>{row.no_plate}</td>
                            <td>{row.club || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              )
            })}
          </section>
        )}

        {!loading && event?.is_public !== false && hasData && mode === 'RESULTS' && (
          <>
            <section className="grid gap-4">
              {batchView.map((batch) => {
                const rows = [...batch.rows].sort((a, b) => (a.rank_point ?? 9999) - (b.rank_point ?? 9999))
                return (
                  <article key={batch.batch_index} className="public-panel-dark">
                    <h2 className="mb-3 text-lg font-black uppercase tracking-[0.08em] text-white">
                      Batch {batch.batch_index} - Live Results
                    </h2>
                    <div className="public-table-wrap">
                      <table className="public-table" style={{ minWidth: 1220 }}>
                        <thead>
                          <tr>
                            {[
                              'Gate M1',
                              'Gate M2',
                              'Gate M3',
                              'Foto',
                              'Nama Peserta',
                              'No Plat',
                              'Point M1',
                              'Point M2',
                              'Point M3',
                              'Penalty',
                              'Total',
                              'Rank',
                              'Class',
                            ].map((h) => (
                              <th key={h}>{h}</th>
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
                              <td className="font-extrabold text-slate-900">{row.name}</td>
                              <td>{row.no_plate}</td>
                              <td>{row.point_moto1 ?? '-'}</td>
                              <td>{row.point_moto2 ?? '-'}</td>
                              <td>{row.point_moto3 ?? '-'}</td>
                              <td className="font-extrabold text-rose-600">{row.penalty_total ?? '-'}</td>
                              <td className="font-extrabold text-sky-700">{row.total_point ?? '-'}</td>
                              <td className="font-extrabold text-emerald-700">{row.rank_point ?? '-'}</td>
                              <td>{row.class_label || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </article>
                )
              })}
            </section>

            <section className="public-panel-light">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-black uppercase tracking-[0.08em] text-slate-900">Rider Bersiap</h2>
                <span className="public-chip">{queueTarget?.label ?? activeMoto?.moto_name ?? 'Queue'}</span>
              </div>

              {prepareQueue.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm font-semibold text-slate-600">
                  Belum ada rider yang perlu bersiap.
                </div>
              ) : (
                <div className="public-table-wrap">
                  <table className="public-table" style={{ minWidth: 760 }}>
                    <thead>
                      <tr>
                        {['Antrian', 'Gate', 'Foto', 'No Plat', 'Nama Peserta', 'Komunitas'].map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {prepareQueue.map((row) => (
                        <tr key={`prepare-${row.rider_id}`}>
                          <td className="font-extrabold text-rose-600">{row.queue}</td>
                          <td>{row.gate ?? '-'}</td>
                          <td>{riderPhotoCell(row.name, row.no_plate, row.photo_thumbnail_url)}</td>
                          <td>{row.no_plate}</td>
                          <td className="font-extrabold text-slate-900">{row.name}</td>
                          <td>{row.club || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {!loading && event?.is_public !== false && hasData && mode === 'WINNERS' && (
          <section className="grid gap-4">
            {winnersByBatch.map((batch) => (
              <article key={batch.batch_index} className="public-panel-dark">
                <h2 className="mb-3 text-lg font-black uppercase tracking-[0.08em] text-white">Batch {batch.batch_index} - Winners</h2>
                <div className="grid gap-3">
                  {batch.winners.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-600 bg-slate-950/50 p-3 text-sm font-semibold text-slate-300">
                      Belum ada hasil.
                    </div>
                  )}
                  {batch.winners.map((row, index) => (
                    <div
                      key={row.rider_id}
                      className="grid gap-2 rounded-xl border border-slate-600 bg-slate-950/70 px-4 py-3 text-slate-100 sm:grid-cols-[40px_1fr_auto] sm:items-center"
                    >
                      <div>{riderPhotoCell(row.name, row.no_plate, row.photo_thumbnail_url)}</div>
                      <div className="text-base font-black">
                        {index + 1}. {row.name}
                      </div>
                      <div className="text-sm font-extrabold text-emerald-300">Total: {row.total_point ?? '-'}</div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  )
}
