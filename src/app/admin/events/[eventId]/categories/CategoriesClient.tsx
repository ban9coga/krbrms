'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'

type CategoryItem = {
  id: string
  year: number
  gender: 'BOY' | 'GIRL' | 'MIX'
  label: string
  enabled: boolean
}

export default function CategoriesClient({ eventId }: { eventId: string }) {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

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
    setLoading(true)
    try {
      const res = await fetch(`/api/events/${eventId}/categories`)
      const json = await res.json()
      setCategories(json.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!eventId) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const toggle = async (item: CategoryItem) => {
    setSavingId(item.id)
    try {
      await apiFetch(`/api/categories/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !item.enabled }),
      })
      await load()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    } finally {
      setSavingId(null)
    }
  }

  const syncFromRiders = async () => {
    setSyncing(true)
    try {
      await apiFetch(`/api/events/${eventId}/categories/sync`, { method: 'POST' })
      await load()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Categories</h1>
      <div style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
        Categories dibuat otomatis dari tahun lahir & gender:
        <div>2017 = FFA-MIX</div>
        <div>2018-2023 = Boys/Girls</div>
      </div>
      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          onClick={syncFromRiders}
          disabled={syncing}
          style={{
            padding: '8px 12px',
            borderRadius: 12,
            border: '2px solid #111',
            background: '#bfead2',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          {syncing ? 'Syncing...' : 'Sync Categories from Riders'}
        </button>
      </div>

      <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        {loading && (
          <div style={{ padding: 14, borderRadius: 16, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Loading...
          </div>
        )}

        {!loading && categories.length === 0 && (
          <div style={{ padding: 14, borderRadius: 16, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Belum ada category untuk event ini.
          </div>
        )}

        {categories.map((item) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 14,
              borderRadius: 16,
              border: '2px solid #111',
              background: '#fff',
              gap: 10,
            }}
          >
            <div style={{ display: 'grid', gap: 2 }}>
              <div style={{ fontWeight: 900 }}>{item.label}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#333' }}>
                {item.year} • {item.gender}
              </div>
            </div>
            <button
              type="button"
              onClick={() => toggle(item)}
              disabled={savingId === item.id}
              style={{
                padding: '8px 12px',
                borderRadius: 12,
                border: '2px solid #111',
                background: item.enabled ? '#2ecc71' : '#fff',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              {savingId === item.id ? 'Saving...' : item.enabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

