'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import StatusBadge from '../../../components/StatusBadge'
import LoadingState from '../../../components/LoadingState'
import EmptyState from '../../../components/EmptyState'
import PublicTopbar from '../../../components/PublicTopbar'
import {
  getEventById,
  getEventCategories,
  getMotoResults,
  getRidersByEvent,
  type LeaderboardRow,
  type MotoItem,
  type EventItem,
  type RiderCategory,
  type RiderPublicItem,
} from '../../../lib/eventService'

export default function EventDetailClient({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventItem | null>(null)
  const [categories, setCategories] = useState<RiderCategory[]>([])
  const [liveMotos, setLiveMotos] = useState<MotoItem[]>([])
  const [liveResults, setLiveResults] = useState<Record<string, LeaderboardRow[]>>({})
  const [liveLoading, setLiveLoading] = useState<Record<string, boolean>>({})
  const [expandedMotoId, setExpandedMotoId] = useState<string>('')
  const [stageResults, setStageResults] = useState<
    Record<
      string,
      Array<{
        id: string
        stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'FINAL'
        final_class: string | null
        position: number | null
        riders: { name: string; no_plate_display: string } | null
      }>
    >
  >({})
  const [stageLoading, setStageLoading] = useState<Record<string, boolean>>({})
  const [riders, setRiders] = useState<RiderPublicItem[]>([])
  const [riderPage, setRiderPage] = useState(1)
  const riderPageSize = 24
  const [riderTotal, setRiderTotal] = useState(0)
  const [showRiders, setShowRiders] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [eventData, categoryData, riderData, motoRes] = await Promise.all([
        getEventById(eventId),
        getEventCategories(eventId),
        getRidersByEvent(eventId, 1, riderPageSize),
        fetch(`/api/motos?event_id=${eventId}`),
      ])
      setEvent(eventData)
      setCategories(categoryData.filter((c) => c.enabled))
      setRiders(riderData.data)
      setRiderTotal(riderData.total)
      setRiderPage(1)
      const motoJson = await motoRes.json()
      const motos = (motoJson.data ?? []) as MotoItem[]
      setLiveMotos(motos.filter((m) => m.status === 'LIVE'))
      setLoading(false)
    }
    if (eventId) load()
  }, [eventId])

  const loadMore = async () => {
    if (loadingMore) return
    const nextPage = riderPage + 1
    setLoadingMore(true)
    try {
      const data = await getRidersByEvent(eventId, nextPage, riderPageSize)
      setRiders((prev) => [...prev, ...data.data])
      setRiderTotal(data.total)
      setRiderPage(nextPage)
    } finally {
      setLoadingMore(false)
    }
  }

  const canLoadMore = riders.length < riderTotal
  const eventDate = event ? new Date(event.event_date) : null
  const formattedDate = eventDate
    ? eventDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
    : null
  const daysToEvent =
    eventDate ? Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null

  const categoryLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) {
      map.set(c.id, c.label)
    }
    return map
  }, [categories])

  const liveMotosSorted = useMemo(() => {
    const yearMap = new Map<string, number>()
    const genderMap = new Map<string, RiderCategory['gender']>()
    for (const c of categories) {
      yearMap.set(c.id, c.year)
      genderMap.set(c.id, c.gender)
    }
    const genderOrder = { BOY: 0, GIRL: 1, MIX: 2 } as const
    return [...liveMotos].sort((a, b) => {
      const ay = yearMap.get(a.category_id) ?? 0
      const by = yearMap.get(b.category_id) ?? 0
      if (by !== ay) return by - ay
      const ag = genderOrder[genderMap.get(a.category_id) ?? 'MIX'] ?? 9
      const bg = genderOrder[genderMap.get(b.category_id) ?? 'MIX'] ?? 9
      if (ag !== bg) return ag - bg
      return a.moto_order - b.moto_order
    })
  }, [liveMotos, categories])

  const toggleLiveResults = async (motoId: string, categoryId: string) => {
    if (expandedMotoId === motoId) {
      setExpandedMotoId('')
      return
    }
    setExpandedMotoId(motoId)
    if (liveResults[motoId]) return
    setLiveLoading((prev) => ({ ...prev, [motoId]: true }))
    try {
      const data = await getMotoResults(motoId)
      setLiveResults((prev) => ({ ...prev, [motoId]: data }))
      if (!stageResults[categoryId]) {
        setStageLoading((prev) => ({ ...prev, [categoryId]: true }))
        const res = await fetch(
          `/api/public/events/${eventId}/advanced-race/results?category_id=${categoryId}`
        )
        const json = await res.json()
        setStageResults((prev) => ({ ...prev, [categoryId]: json.data ?? [] }))
        setStageLoading((prev) => ({ ...prev, [categoryId]: false }))
      }
    } finally {
      setLiveLoading((prev) => ({ ...prev, [motoId]: false }))
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eaf7ee', color: '#111' }}>
      <PublicTopbar />
      <div style={{ maxWidth: '980px', margin: '0 auto', padding: '24px 20px 48px' }}>

        {loading && <LoadingState />}
        {!loading && !event && <EmptyState label="Event tidak ditemukan." />}

        {event && (
          <>
            <div
              style={{
                marginTop: '16px',
                background: '#fff',
                border: '2px solid #111',
                borderRadius: '16px',
                padding: '16px',
                display: 'grid',
                gap: '10px',
              }}
              >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <h1 style={{ fontSize: '24px', fontWeight: 900, margin: 0 }}>{event.name}</h1>
                  <div style={{ color: '#333', fontWeight: 700 }}>Lokasi: {event.location || '-'}</div>
                  <div style={{ color: '#333', fontWeight: 700 }}>
                    Tanggal: {formattedDate ?? '-'}
                  </div>
                </div>
                <StatusBadge
                  label={
                    event.status === 'LIVE'
                      ? 'Ongoing Event'
                      : event.status === 'FINISHED'
                      ? 'Completed Event'
                      : 'Coming Soon'
                  }
                />
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    border: '2px solid #111',
                    background: '#eaf7ee',
                    fontWeight: 900,
                    cursor: event.status === 'UPCOMING' ? 'not-allowed' : 'pointer',
                  }}
                  role="button"
                  onClick={() => {
                    if (event.status === 'UPCOMING') return
                    setShowRiders((v) => !v)
                  }}
                >
                  Total Riders
                  <div style={{ fontSize: 20 }}>{event.status === 'UPCOMING' ? '—' : riderTotal}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, marginTop: 4, opacity: 0.8 }}>
                    {event.status === 'UPCOMING' ? 'Terkunci sampai LIVE' : showRiders ? 'Sembunyikan' : 'Klik untuk lihat'}
                  </div>
                </div>
                <div
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    border: '2px solid #111',
                    background: '#eaf7ee',
                    fontWeight: 900,
                  }}
                >
                  Total Categories
                  <div style={{ fontSize: 20 }}>{categories.length}</div>
                </div>
                <div
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    border: '2px solid #111',
                    background: '#eaf7ee',
                    fontWeight: 900,
                  }}
                >
                  Countdown
                  <div style={{ fontSize: 20 }}>
                    {event.status === 'UPCOMING' && daysToEvent !== null
                      ? `${Math.max(daysToEvent, 0)} hari lagi`
                      : event.status === 'LIVE'
                      ? 'Sedang berlangsung'
                      : 'Selesai'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {event.status !== 'UPCOMING' && (
                  <Link
                    href={`/event/${event.id}/results`}
                    style={{
                      marginTop: '8px',
                      display: 'inline-block',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '2px solid #111',
                      background: '#2ecc71',
                      color: '#111',
                      fontWeight: 900,
                      textDecoration: 'none',
                    }}
                  >
                    View Results
                  </Link>
                )}
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Live Scoring</h2>
                {event.status !== 'LIVE' && <StatusBadge label="Locked" />}
              </div>
              {event.status !== 'LIVE' ? (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 16,
                    border: '2px dashed #111',
                    background: '#fff',
                    fontWeight: 800,
                  }}
                >
                  Live scoring akan muncul saat event LIVE.
                </div>
              ) : liveMotosSorted.length === 0 ? (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 16,
                    border: '2px dashed #111',
                    background: '#fff',
                    fontWeight: 800,
                  }}
                >
                  Belum ada moto yang LIVE.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {liveMotosSorted.map((m) => {
                    const results = liveResults[m.id] ?? []
                    const isOpen = expandedMotoId === m.id
                    const isLoading = liveLoading[m.id]
                    const topRows = results.slice(0, 5)
                    const stageRows = stageResults[m.category_id] ?? []
                    const stageLoadingFlag = stageLoading[m.category_id]
                    const stageGroups = {
                      QUARTER_FINAL: stageRows.filter((r) => r.stage === 'QUARTER_FINAL'),
                      SEMI_FINAL: stageRows.filter((r) => r.stage === 'SEMI_FINAL'),
                      FINAL: stageRows.filter((r) => r.stage === 'FINAL'),
                    }
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggleLiveResults(m.id, m.category_id)}
                        style={{
                          padding: 14,
                          borderRadius: 16,
                          border: '2px solid #111',
                          background: '#fff',
                          display: 'grid',
                          gap: 6,
                          fontWeight: 900,
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.85 }}>Kategori</div>
                        <div>{categoryLabel.get(m.category_id) ?? 'Unknown Category'}</div>
                        <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.85, marginTop: 4 }}>Batch</div>
                        <div>
                          {m.moto_order}. {m.moto_name}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.75 }}>
                          {isOpen ? 'Tap to hide results' : 'Tap to view results'}
                        </div>

                        {isOpen && (
                          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                            {isLoading ? (
                              <div style={{ fontWeight: 800 }}>Loading results...</div>
                            ) : topRows.length === 0 ? (
                              <div style={{ fontWeight: 800 }}>Belum ada hasil.</div>
                            ) : (
                              topRows.map((row) => (
                                <div
                                  key={`${m.id}-${row.position}-${row.bike_number}`}
                                  style={{
                                    padding: '8px 10px',
                                    borderRadius: 12,
                                    border: '2px solid #111',
                                    background: '#eaf7ee',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                    fontWeight: 800,
                                  }}
                                >
                                  <div>
                                    #{row.position} {row.rider_name}
                                  </div>
                                  <div>
                                    {row.bike_number} • {row.total_point ?? '-'} pts
                                  </div>
                                </div>
                              ))
                            )}
                            <div style={{ marginTop: 6, fontWeight: 900 }}>Qualification → Next Stages</div>
                            {stageLoadingFlag ? (
                              <div style={{ fontWeight: 800 }}>Loading stage results...</div>
                            ) : stageRows.length === 0 ? (
                              <div style={{ fontWeight: 800 }}>Belum ada hasil stage.</div>
                            ) : (
                              <div style={{ display: 'grid', gap: 8 }}>
                                {(['QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'] as const).map((stage) => {
                                  const rows = stageGroups[stage]
                                  if (!rows || rows.length === 0) return null
                                  return (
                                    <div
                                      key={stage}
                                      style={{
                                        padding: 8,
                                        borderRadius: 12,
                                        border: '2px solid #111',
                                        background: '#fff',
                                        display: 'grid',
                                        gap: 4,
                                      }}
                                    >
                                      <div style={{ fontWeight: 900 }}>{stage}</div>
                                      {rows.slice(0, 8).map((r) => (
                                        <div
                                          key={r.id}
                                          style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800 }}
                                        >
                                          <div>
                                            {r.riders?.no_plate_display ?? '-'} {r.riders?.name ?? '-'}
                                          </div>
                                          <div>{r.final_class ? r.final_class : r.position ? `Rank ${r.position}` : '-'}</div>
                                        </div>
                                      ))}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {event.status === 'UPCOMING' ? (
              <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Riders</h2>
                  <StatusBadge label="Locked" />
                </div>
                <div
                  style={{
                    padding: 14,
                    borderRadius: 16,
                    border: '2px dashed #111',
                    background: '#fff',
                    fontWeight: 800,
                  }}
                >
                  Daftar rider akan muncul saat event LIVE.
                </div>
              </div>
            ) : showRiders ? (
              <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12 }}>
                  <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Riders</h2>
                  <div style={{ fontWeight: 900, color: '#333' }}>Total: {riderTotal}</div>
                </div>

                {riders.length === 0 && (
                  <div
                    style={{
                      padding: 14,
                      borderRadius: 16,
                      border: '2px dashed #111',
                      background: '#fff',
                      fontWeight: 800,
                    }}
                  >
                    Belum ada rider terdaftar.
                  </div>
                )}

                <div style={{ display: 'grid', gap: 10 }}>
                  {riders.map((rider) => (
                    <div
                      key={rider.id}
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        border: '2px solid #111',
                        background: '#fff',
                        display: 'grid',
                        gridTemplateColumns: '64px 1fr',
                        gap: 12,
                        alignItems: 'center',
                      }}
                    >
                      <div
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 14,
                          border: '2px solid #111',
                          background: '#eaf7ee',
                          display: 'grid',
                          placeItems: 'center',
                          overflow: 'hidden',
                          fontWeight: 900,
                        }}
                      >
                        {rider.photo_thumbnail_url ? (
                          <img
                            src={rider.photo_thumbnail_url}
                            alt={rider.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            loading="lazy"
                          />
                        ) : (
                          rider.no_plate_display
                        )}
                      </div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontWeight: 900 }}>{rider.no_plate_display}</div>
                        <div style={{ fontWeight: 800 }}>{rider.name}</div>
                        <div style={{ color: '#333', fontSize: 12, fontWeight: 700 }}>
                        {rider.gender} - {rider.date_of_birth}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {canLoadMore && (
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: '2px solid #111',
                      background: '#2ecc71',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    {loadingMore ? 'Loading...' : 'Load More'}
                  </button>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

