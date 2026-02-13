'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

type EventRow = {
  id: string
  name: string
  status: 'UPCOMING' | 'LIVE' | 'FINISHED'
  event_date: string
}

type QueueMoto = {
  moto_id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'LIVE' | 'FINISHED'
  category_label: string
  rows: Array<{
    rider_id: string
    gate: number | null
    name: string
    no_plate: string
    club: string
  }>
}

export default function RaceControlPage() {
  const router = useRouter()
  const [events, setEvents] = useState<EventRow[]>([])
  const [eventId, setEventId] = useState('')
  const [loading, setLoading] = useState(false)
  const [queue, setQueue] = useState<QueueMoto[]>([])
  const [refreshing, setRefreshing] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    document.cookie = 'sb-access-token=; Path=/; Max-Age=0'
    router.push('/login')
  }

  useEffect(() => {
    const loadEvents = async () => {
      const res = await fetch('/api/events')
      const json = await res.json()
      const data = (json.data ?? []) as EventRow[]
      const sorted = [...data].sort((a, b) => {
        if (a.status === b.status) return a.event_date.localeCompare(b.event_date)
        if (a.status === 'LIVE') return -1
        if (b.status === 'LIVE') return 1
        if (a.status === 'UPCOMING') return -1
        if (b.status === 'UPCOMING') return 1
        return 0
      })
      setEvents(sorted)
      if (sorted.length > 0) setEventId(sorted[0].id)
    }
    loadEvents()
  }, [])

  const loadQueue = async (id: string) => {
    if (!id) return
    setLoading(true)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const res = await fetch(`/api/race-control/events/${id}/queue`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const json = await res.json()
      setQueue((json.data?.motos ?? []) as QueueMoto[])
    } finally {
      setLoading(false)
    }
  }

  const refresh = async () => {
    if (!eventId) return
    setRefreshing(true)
    try {
      await loadQueue(eventId)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadQueue(eventId)
  }, [eventId])

  useEffect(() => {
    const interval = setInterval(() => {
      refresh()
    }, 10000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const activeQueue = useMemo(
    () => queue.filter((m) => m.status === 'LIVE' || m.status === 'UPCOMING'),
    [queue]
  )

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#eaf7ee',
        color: '#111',
        padding: '24px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <select
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          style={{ padding: 8, borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
        >
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.name} ({event.status})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          style={{
            padding: '8px 12px',
            borderRadius: 12,
            border: '2px solid #111',
            background: '#bfead2',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
        <button
          type="button"
          onClick={handleLogout}
          style={{
            padding: '8px 12px',
            borderRadius: 12,
            border: '2px solid #b40000',
            background: '#ffd7d7',
            color: '#b40000',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          Logout
        </button>
      </div>

      <h1 style={{ fontSize: '24px', fontWeight: 800, marginTop: 14 }}>Waiting Zone</h1>
      <p style={{ marginTop: '6px', color: '#333', fontWeight: 700 }}>
        Urutan batch mengikuti moto order. Tampilkan gate & komunitas untuk pemanggilan.
      </p>

      {loading && <div style={{ marginTop: 12, fontWeight: 900 }}>Loading...</div>}

      <div style={{ display: 'grid', gap: 16, marginTop: 12 }}>
        {activeQueue.map((moto) => (
          <div
            key={moto.moto_id}
            style={{
              background: '#fff',
              border: '2px solid #111',
              borderRadius: 14,
              overflow: 'hidden',
            }}
          >
            <div style={{ background: '#0a7a1f', color: '#fff', padding: '10px 12px', fontWeight: 900 }}>
              {moto.moto_name} • {moto.category_label} • {moto.status}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                    {['Gate', 'Nama', 'No Plat', 'Komunitas'].map((h) => (
                      <th key={h} style={{ padding: 8, borderBottom: '2px solid #111', fontWeight: 900 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {moto.rows.map((row) => (
                    <tr key={row.rider_id} style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ padding: 8 }}>{row.gate ?? '-'}</td>
                      <td style={{ padding: 8, fontWeight: 800 }}>{row.name}</td>
                      <td style={{ padding: 8 }}>{row.no_plate}</td>
                      <td style={{ padding: 8 }}>{row.club || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {!loading && activeQueue.length === 0 && (
          <div style={{ fontWeight: 900, marginTop: 12 }}>Tidak ada batch upcoming/live.</div>
        )}
      </div>
    </div>
  )
}


