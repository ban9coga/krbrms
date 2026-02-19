'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'

type CategoryItem = {
  id: string
  year_min?: number | null
  year_max?: number | null
  gender: 'BOY' | 'GIRL' | 'MIX'
  label: string
  enabled: boolean
}

type MotoItem = {
  id: string
  category_id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'LIVE' | 'FINISHED'
}


export default function MotosClient({ eventId }: { eventId: string }) {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [motos, setMotos] = useState<MotoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [eventStatus, setEventStatus] = useState<'UPCOMING' | 'LIVE' | 'FINISHED' | null>(null)

  const getErrorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Request failed')

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Request failed')
    return json
  }

  const load = async () => {
    if (!eventId) return
    setLoading(true)
    try {
      const catRes = await fetch(`/api/events/${eventId}/categories`)
      const catJson = await catRes.json()
      setCategories((catJson.data ?? []).filter((c: CategoryItem) => c.enabled))

      const eventJson = await apiFetch(`/api/events/${eventId}`)
      setEventStatus(eventJson?.data?.status ?? null)

      const motoRes = await fetch(`/api/motos?event_id=${eventId}`)
      const motoJson = await motoRes.json()
      setMotos(motoJson.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const categoryLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) {
      map.set(c.id, c.label)
    }
    return map
  }, [categories])

  const categoriesSorted = useMemo(() => {
    return [...categories].sort((a, b) => {
      const ayMax = typeof a.year_max === 'number' ? a.year_max : typeof a.year_min === 'number' ? a.year_min : 0
      const byMax = typeof b.year_max === 'number' ? b.year_max : typeof b.year_min === 'number' ? b.year_min : 0
      if (byMax !== ayMax) return byMax - ayMax
      const ayMin = typeof a.year_min === 'number' ? a.year_min : ayMax
      const byMin = typeof b.year_min === 'number' ? b.year_min : byMax
      if (byMin !== ayMin) return byMin - ayMin
      const order = { BOY: 0, GIRL: 1, MIX: 2 } as const
      const ag = order[a.gender] ?? 9
      const bg = order[b.gender] ?? 9
      return ag - bg
    })
  }, [categories])

  const motosByCategory = useMemo(() => {
    const grouped = new Map<string, MotoItem[]>()
    for (const moto of motos) {
      const list = grouped.get(moto.category_id) ?? []
      list.push(moto)
      grouped.set(moto.category_id, list)
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => a.moto_order - b.moto_order)
    }
    return grouped
  }, [motos])

  const handleUpdateMotoStatus = async (motoId: string, status: MotoItem['status']) => {
    try {
      await apiFetch(`/api/motos/${motoId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      await load()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    }
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Motos</h1>
      <div style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
        Moto dibuat melalui Live Draw. Di halaman ini hanya untuk melihat dan mengatur status moto.
      </div>
      {eventStatus && eventStatus !== 'LIVE' && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 12,
            border: '2px dashed #111',
            background: '#fff',
            fontWeight: 900,
          }}
        >
          Status event saat ini: {eventStatus}. Update status moto hanya bisa ketika event LIVE.
        </div>
      )}


      <div style={{ marginTop: 16, display: 'grid', gap: 16 }}>
        {loading && (
          <div style={{ padding: 14, borderRadius: 16, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Loading...
          </div>
        )}

        {!loading && motos.length === 0 && (
          <div style={{ padding: 14, borderRadius: 16, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Belum ada moto.
          </div>
        )}

        {categoriesSorted.map((cat) => {
          const list = motosByCategory.get(cat.id) ?? []
          if (list.length === 0) return null
          return (
          <div
            key={cat.id}
            style={{
              padding: 14,
              borderRadius: 16,
              border: '2px solid #111',
              background: '#fff',
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 950, fontSize: 18 }}>
              {categoryLabel.get(cat.id) ?? `Category ${cat.id}`}
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {list.map((m) => (
                <div
                  key={m.id}
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    border: '2px solid #111',
                    background: '#eaf7ee',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <div style={{ fontWeight: 900 }}>
                    {m.moto_order}. {m.moto_name}
                  </div>
                  <select
                    value={m.status}
                    onChange={(e) => handleUpdateMotoStatus(m.id, e.target.value as MotoItem['status'])}
                    disabled={eventStatus !== 'LIVE'}
                    style={{ padding: '8px 10px', borderRadius: 12, border: '2px solid #111', fontWeight: 900 }}
                  >
                    <option value="UPCOMING">UPCOMING</option>
                    <option value="LIVE">LIVE</option>
                    <option value="FINISHED">FINISHED</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
          )
        })}
      </div>
    </div>
  )
}

