'use client'

import { useEffect, useMemo, useState } from 'react'
import LoadingState from '../../../../components/LoadingState'
import EmptyState from '../../../../components/EmptyState'
import PublicTopbar from '../../../../components/PublicTopbar'
import {
  getEventById,
  getEventCategories,
  type EventItem,
  type RiderCategory,
} from '../../../../lib/eventService'

type Row = {
  rider_id: string
  gate_moto1: number | null
  gate_moto2: number | null
  gate_moto3: number | null
  name: string
  no_plate: string
  club: string
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
  moto2_id: string
  rows: Row[]
}

type LiveScorePayload = {
  category?: string
  batches?: Batch[]
}

type Mode = 'LINEUP' | 'RESULTS' | 'WINNERS'

export default function LiveDisplayClient({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventItem | null>(null)
  const [categories, setCategories] = useState<RiderCategory[]>([])
  const [categoryId, setCategoryId] = useState<string>('')
  const [categoryLabel, setCategoryLabel] = useState<string>('')
  const [batches, setBatches] = useState<Batch[]>([])
  const [mode, setMode] = useState<Mode>('LINEUP')
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
        if (!categoryId && cats.length > 0) {
          setCategoryId(cats[0].id)
        }
      } finally {
        setLoading(false)
      }
    }
    if (eventId) load()
  }, [eventId, categoryId])

  const fetchLiveScore = async (id: string) => {
    if (!id) return
    const res = await fetch(`/api/public/events/${eventId}/live-score?category_id=${encodeURIComponent(id)}`)
    const json = await res.json()
    const data = (json?.data ?? {}) as LiveScorePayload
    setCategoryLabel(data.category ?? '')
    setBatches(data.batches ?? [])
  }

  useEffect(() => {
    if (categoryId) fetchLiveScore(categoryId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, eventId])

  const refresh = async () => {
    if (!categoryId) return
    setRefreshing(true)
    try {
      await fetchLiveScore(categoryId)
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

  const winnersByBatch = useMemo(() => {
    return batches.map((batch) => {
      const rows = [...batch.rows].sort((a, b) => (a.rank_point ?? 9999) - (b.rank_point ?? 9999))
      return {
        batch_index: batch.batch_index,
        winners: rows.slice(0, 3),
      }
    })
  }, [batches])

  return (
    <div style={{ minHeight: '100vh', background: '#eaf7ee', color: '#111' }}>
      <PublicTopbar />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 20px 48px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 20, fontWeight: 950 }}>{event?.name ?? 'Live Display'}</div>
            <div style={{ fontWeight: 800, color: '#333' }}>{categoryLabel || 'Pilih Kategori'}</div>
            {event?.location && <div style={{ color: '#333' }}>{event.location}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: '2px solid #111',
                fontWeight: 800,
                background: '#fff',
              }}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {(['LINEUP', 'RESULTS', 'WINNERS'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  border: '2px solid #111',
                  background: mode === m ? '#2ecc71' : '#fff',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                {m === 'LINEUP' ? 'Lineup' : m === 'RESULTS' ? 'Live Results' : 'Winners'}
              </button>
            ))}
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              style={{
                padding: '8px 12px',
                borderRadius: 999,
                border: '2px solid #111',
                background: '#bfead2',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {loading && <LoadingState />}
        {!loading && event?.is_public === false && (
          <EmptyState label="Event ini sedang disembunyikan dari publik." />
        )}
        {!loading && event?.is_public !== false && !hasData && (
          <EmptyState label="Belum ada data race untuk kategori ini." />
        )}

        {!loading && event?.is_public !== false && hasData && mode === 'LINEUP' && (
          <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
            {batches.map((batch) => {
              const rows = [...batch.rows].sort((a, b) => (a.gate_moto1 ?? 9999) - (b.gate_moto1 ?? 9999))
              return (
                <div key={batch.batch_index} style={{ background: '#fff', border: '2px solid #111', borderRadius: 14 }}>
                  <div style={{ background: '#0a7a1f', color: '#fff', padding: '10px 12px', fontWeight: 900 }}>
                    BATCH {batch.batch_index} (LINEUP)
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                      <thead>
                        <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                          {['Gate M1', 'Gate M2', 'Gate M3', 'Nama Peserta', 'No Plat', 'Komunitas'].map((h) => (
                            <th key={h} style={{ padding: 8, borderBottom: '2px solid #111', fontWeight: 900 }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.rider_id} style={{ borderBottom: '1px solid #ddd' }}>
                            <td style={{ padding: 8 }}>{row.gate_moto1 ?? '-'}</td>
                            <td style={{ padding: 8 }}>{row.gate_moto2 ?? '-'}</td>
                            <td style={{ padding: 8 }}>{row.gate_moto3 ?? '-'}</td>
                            <td style={{ padding: 8, fontWeight: 800 }}>{row.name}</td>
                            <td style={{ padding: 8 }}>{row.no_plate}</td>
                            <td style={{ padding: 8 }}>{row.club || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && event?.is_public !== false && hasData && mode === 'RESULTS' && (
          <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
            {batches.map((batch) => {
              const rows = [...batch.rows].sort((a, b) => (a.rank_point ?? 9999) - (b.rank_point ?? 9999))
              return (
                <div key={batch.batch_index} style={{ background: '#fff', border: '2px solid #111', borderRadius: 14 }}>
                  <div style={{ background: '#0a7a1f', color: '#fff', padding: '10px 12px', fontWeight: 900 }}>
                    BATCH {batch.batch_index} (LIVE RESULTS)
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                      <thead>
                        <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                          {[
                            'Gate M1',
                            'Gate M2',
                            'Gate M3',
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
                            <th key={h} style={{ padding: 8, borderBottom: '2px solid #111', fontWeight: 900 }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.rider_id} style={{ borderBottom: '1px solid #ddd' }}>
                            <td style={{ padding: 8 }}>{row.gate_moto1 ?? '-'}</td>
                            <td style={{ padding: 8 }}>{row.gate_moto2 ?? '-'}</td>
                            <td style={{ padding: 8 }}>{row.gate_moto3 ?? '-'}</td>
                            <td style={{ padding: 8, fontWeight: 800 }}>{row.name}</td>
                            <td style={{ padding: 8 }}>{row.no_plate}</td>
                            <td style={{ padding: 8 }}>{row.point_moto1 ?? '-'}</td>
                            <td style={{ padding: 8 }}>{row.point_moto2 ?? '-'}</td>
                            <td style={{ padding: 8 }}>{row.point_moto3 ?? '-'}</td>
                            <td style={{ padding: 8, fontWeight: 900, color: '#b91c1c' }}>{row.penalty_total ?? '-'}</td>
                            <td style={{ padding: 8, fontWeight: 900, color: '#1d4ed8' }}>{row.total_point ?? '-'}</td>
                            <td style={{ padding: 8, fontWeight: 900, color: '#0f766e' }}>{row.rank_point ?? '-'}</td>
                            <td style={{ padding: 8 }}>{row.class_label || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && event?.is_public !== false && hasData && mode === 'WINNERS' && (
          <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
            {winnersByBatch.map((batch) => (
              <div key={batch.batch_index} style={{ background: '#fff', border: '2px solid #111', borderRadius: 14 }}>
                <div style={{ background: '#0a7a1f', color: '#fff', padding: '10px 12px', fontWeight: 900 }}>
                  BATCH {batch.batch_index} (WINNERS)
                </div>
                <div style={{ display: 'grid', gap: 10, padding: 12 }}>
                  {batch.winners.length === 0 && <div>Belum ada hasil.</div>}
                  {batch.winners.map((row, index) => (
                    <div
                      key={row.rider_id}
                      style={{
                        border: '2px solid #111',
                        borderRadius: 12,
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                      }}
                    >
                      <div style={{ fontWeight: 900, fontSize: 18 }}>
                        {index + 1}. {row.name}
                      </div>
                      <div style={{ fontWeight: 900 }}>Total: {row.total_point ?? '-'}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
