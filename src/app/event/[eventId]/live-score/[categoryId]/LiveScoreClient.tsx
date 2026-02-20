'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import LoadingState from '../../../../../components/LoadingState'
import EmptyState from '../../../../../components/EmptyState'

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

type StageRow = {
  rider_id: string
  gate: number | null
  name: string
  no_plate: string
  club: string | null
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
  const [categoryLabel, setCategoryLabel] = useState('')
  const [batches, setBatches] = useState<Batch[]>([])
  const [stages, setStages] = useState<StageGroup[]>([])
  const [sortMode, setSortMode] = useState<'GATE' | 'RANK'>('RANK')
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(
          `/api/public/events/${eventId}/live-score?category_id=${encodeURIComponent(categoryId)}`
        )
        const json = await res.json()
        setCategoryLabel(json.data?.category ?? '')
        setBatches(json.data?.batches ?? [])
        setStages(json.data?.stages ?? [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [eventId, categoryId])

  const refresh = async () => {
    setRefreshing(true)
    try {
      const res = await fetch(
        `/api/public/events/${eventId}/live-score?category_id=${encodeURIComponent(categoryId)}`
      )
      const json = await res.json()
      setCategoryLabel(json.data?.category ?? '')
      setBatches(json.data?.batches ?? [])
      setStages(json.data?.stages ?? [])
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

  return (
    <div style={{ minHeight: '100vh', background: '#eaf7ee', color: '#111', padding: 24 }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <Link href={`/event/${eventId}/results`} style={{ color: '#111', fontWeight: 800 }}>
          &lt;- Back to Results
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, marginTop: 12, marginBottom: 4 }}>Live Score</h1>
            <div style={{ fontWeight: 900, color: '#333' }}>{categoryLabel || 'Category'}</div>
          </div>
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

        {loading && <LoadingState />}
        {!loading && batches.length === 0 && <EmptyState label="Belum ada batch." />}

        <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
          {batches.map((batch) => {
            const rows =
              sortMode === 'RANK'
                ? [...batch.rows].sort((a, b) => (a.rank_point ?? 9999) - (b.rank_point ?? 9999))
                : [...batch.rows].sort((a, b) => (a.gate_moto1 ?? 9999) - (b.gate_moto1 ?? 9999))
            return (
            <div
              key={batch.batch_index}
              style={{
                background: '#fff',
                border: '2px solid #111',
                borderRadius: 14,
                overflow: 'hidden',
              }}
            >
              <div style={{ background: '#0a7a1f', color: '#fff', padding: '10px 12px', fontWeight: 900 }}>
                BATCH {batch.batch_index} (KUALIFIKASI MOTO)
              </div>
              <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '2px solid #111' }}>
                {(['GATE', 'RANK'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSortMode(mode)}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 999,
                      border: '2px solid #111',
                      background: sortMode === mode ? '#2ecc71' : '#fff',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    Sort by {mode === 'GATE' ? 'Gate' : 'Rank'}
                  </button>
                ))}
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                  <thead>
                    <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                      {[
                        'Gate M1',
                        'Gate M2',
                        'Gate M3',
                        'Nama Peserta',
                        'No Plat',
                        'Komunitas',
                        'Point M1',
                        'Point M2',
                        'Point M3',
                        'Penalty',
                        'Total Point',
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
                        <td style={{ padding: 8 }}>{row.club || '-'}</td>
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
          )})}
        </div>

        {stages.length > 0 && (
          <div style={{ display: 'grid', gap: 16, marginTop: 24 }}>
            {stages.map((stage) => (
              <div
                key={stage.moto_id}
                style={{
                  background: '#fff',
                  border: '2px solid #111',
                  borderRadius: 14,
                  overflow: 'hidden',
                }}
              >
                <div style={{ background: '#0a7a1f', color: '#fff', padding: '10px 12px', fontWeight: 900 }}>
                  {stage.title}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                        {['Gate', 'Nama Peserta', 'No Plat', 'Komunitas', 'Point', 'Status'].map((h) => (
                          <th key={h} style={{ padding: 8, borderBottom: '2px solid #111', fontWeight: 900 }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stage.rows.map((row) => (
                        <tr key={row.rider_id} style={{ borderBottom: '1px solid #ddd' }}>
                          <td style={{ padding: 8 }}>{row.gate ?? '-'}</td>
                          <td style={{ padding: 8, fontWeight: 800 }}>{row.name}</td>
                          <td style={{ padding: 8 }}>{row.no_plate}</td>
                          <td style={{ padding: 8 }}>{row.club || '-'}</td>
                          <td style={{ padding: 8, fontWeight: 900, color: '#1d4ed8' }}>{row.point ?? '-'}</td>
                          <td style={{ padding: 8, fontWeight: 900 }}>{row.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

