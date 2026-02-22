'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabaseClient'

type EventItem = {
  id: string
  name: string
  status: string
}

type MotoItem = {
  id: string
  moto_name: string
  moto_order: number
  status: string
}

export default function JCSelectorPage() {
  const router = useRouter()
  const [events, setEvents] = useState<EventItem[]>([])
  const [motos, setMotos] = useState<MotoItem[]>([])
  const [eventId, setEventId] = useState('')
  const [motoId, setMotoId] = useState('')
  const [loading, setLoading] = useState(false)

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Request failed')
    return json
  }

  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true)
      try {
        const res = await apiFetch('/api/jury/events?status=LIVE,UPCOMING')
        setEvents(res.data ?? [])
        if (!eventId && res.data?.length) setEventId(res.data[0].id)
      } finally {
        setLoading(false)
      }
    }
    loadEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const loadMotos = async () => {
      if (!eventId) return
      setLoading(true)
      try {
        const motoRes = await fetch(`/api/motos?event_id=${eventId}`)
        const motoJson = await motoRes.json()
        const list = (motoJson.data ?? []) as MotoItem[]
        list.sort((a, b) => a.moto_order - b.moto_order)
        setMotos(list)
        if (!motoId && list.length) {
          const live = list.find((m) => m.status === 'LIVE')
          setMotoId((live ?? list[0]).id)
        }
      } finally {
        setLoading(false)
      }
    }
    loadMotos()
  }, [eventId])

  return (
    <div style={{ minHeight: '100vh', background: '#fff6da', color: '#111', padding: 24 }}>
      <div style={{ maxWidth: 520, margin: '0 auto', display: 'grid', gap: 16 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>JC Gate Control</h1>
        <div style={{ fontWeight: 700, color: '#333' }}>Pilih event & moto yang akan dijaga.</div>

        <select
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 900 }}
        >
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name} - {ev.status}
            </option>
          ))}
        </select>

        <select
          value={motoId}
          onChange={(e) => setMotoId(e.target.value)}
          style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 900 }}
        >
          {motos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.moto_order}. {m.moto_name} - {m.status}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={!eventId || !motoId || loading}
          onClick={() => router.push(`/jc/${eventId}/${motoId}`)}
          style={{
            padding: '14px 18px',
            borderRadius: 999,
            border: '2px solid #1b5e20',
            background: '#2ecc71',
            color: '#fff',
            fontWeight: 900,
            fontSize: 18,
          }}
        >
          Buka Gate Screen
        </button>
      </div>
    </div>
  )
}
