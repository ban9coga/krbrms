'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'

type MotoInfo = {
  id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
  is_published: boolean | null
}

type RankingRow = {
  rider_id: string
  finish_order: number | null
  total_point: number | null
  rider_name: string
  plate: string
}

type McResponse = {
  data: {
    under_review: boolean
    review_moto?: MotoInfo | null
    moto?: MotoInfo | null
    category?: string | null
    batch?: string | null
    ranking?: RankingRow[]
  }
}

const statusBadge = (moto?: MotoInfo | null) => {
  if (!moto) {
    return { label: 'NO MOTO', bg: '#dcdcdc', color: '#111' }
  }
  if (moto.status === 'LIVE') return { label: 'LIVE', bg: '#2ecc71', color: '#111' }
  if (moto.status === 'PROVISIONAL') return { label: 'PROVISIONAL', bg: '#f1c40f', color: '#111' }
  if (moto.status === 'LOCKED') return { label: 'LOCKED', bg: '#2d7cff', color: '#fff' }
  return { label: moto.status, bg: '#dcdcdc', color: '#111' }
}

export default function McLivePage() {
  const params = useParams()
  const eventId = String(params?.eventId ?? '')
  const [data, setData] = useState<McResponse['data'] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Request failed')
    return json
  }

  const load = async (silent = false) => {
    if (!eventId) return
    if (!silent) setLoading(true)
    setError(null)
    try {
      const json = (await apiFetch(`/api/internal/events/${eventId}/mc-live`)) as McResponse
      setData(json.data ?? null)
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => load(true), 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const ranking = useMemo(() => {
    return (data?.ranking ?? []).slice(0, 8)
  }, [data])

  if (data?.under_review) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#b40000',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 720 }}>
          <div style={{ fontSize: 46, fontWeight: 900, letterSpacing: 1 }}>UNDER PROTEST REVIEW</div>
          <div style={{ marginTop: 10, fontSize: 18, fontWeight: 700, opacity: 0.9 }}>
            {data.review_moto?.moto_name ?? 'Moto sedang di review'}
          </div>
          <div style={{ marginTop: 18, fontSize: 14, opacity: 0.85 }}>
            Ranking disembunyikan sampai review selesai.
          </div>
        </div>
      </div>
    )
  }

  const badge = statusBadge(data?.moto ?? null)
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f4f7f4',
        color: '#111',
        padding: 24,
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        gap: 18,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>
            {data?.category ?? 'Kategori'} • {data?.batch ?? '-'} • {data?.moto?.moto_name ?? 'Moto'}
          </div>
          <div style={{ marginTop: 6, color: '#333', fontWeight: 700 }}>
            Event {eventId}
          </div>
        </div>
        <div
          style={{
            padding: '12px 20px',
            borderRadius: 18,
            background: badge.bg,
            color: badge.color,
            fontWeight: 900,
            fontSize: 18,
            border: '2px solid #111',
            minWidth: 220,
            textAlign: 'center',
          }}
        >
          {badge.label}
        </div>
      </div>

      <div
        style={{
          background: '#fff',
          border: '2px solid #111',
          borderRadius: 20,
          padding: 16,
          display: 'grid',
          gap: 10,
          overflow: 'hidden',
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 18 }}>Ranking (Top 8)</div>
        {loading && (
          <div style={{ padding: 12, borderRadius: 12, background: '#f1f1f1', fontWeight: 800 }}>
            Loading...
          </div>
        )}
        {!loading && ranking.length === 0 && (
          <div style={{ padding: 12, borderRadius: 12, background: '#f1f1f1', fontWeight: 800 }}>
            Belum ada hasil.
          </div>
        )}
        {!loading && ranking.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '80px 120px 1fr 140px',
                fontWeight: 900,
                borderBottom: '2px solid #111',
                paddingBottom: 6,
              }}
            >
              <div>Rank</div>
              <div>Plate</div>
              <div>Rider</div>
              <div>Total Point</div>
            </div>
            {ranking.map((row, idx) => (
              <div
                key={row.rider_id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 120px 1fr 140px',
                  padding: '6px 0',
                  borderBottom: '1px solid #eee',
                  fontWeight: 700,
                }}
              >
                <div>{idx + 1}</div>
                <div>{row.plate}</div>
                <div>{row.rider_name}</div>
                <div>{row.total_point ?? '-'}</div>
              </div>
            ))}
          </div>
        )}
        {error && (
          <div style={{ padding: 12, borderRadius: 12, background: '#ffeaea', color: '#b40000', fontWeight: 800 }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ color: '#333', fontWeight: 700 }}>
          Last updated: {lastUpdated ?? '-'}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => load()}
            style={{
              padding: '10px 16px',
              borderRadius: 999,
              border: '2px solid #111',
              background: '#fff',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  )
}
