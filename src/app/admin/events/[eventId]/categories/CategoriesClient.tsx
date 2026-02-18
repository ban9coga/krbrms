'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'

type CategoryItem = {
  id: string
  year: number
  year_min?: number
  year_max?: number
  capacity?: number | null
  gender: 'BOY' | 'GIRL' | 'MIX'
  label: string
  enabled: boolean
}

export default function CategoriesClient({ eventId }: { eventId: string }) {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [editMap, setEditMap] = useState<
    Record<string, { year_min: string; year_max: string; label: string; capacity: string }>
  >({})

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

  const updateEdit = (item: CategoryItem) => {
    setEditMap((prev) => ({
      ...prev,
      [item.id]: {
        year_min: String(item.year_min ?? item.year),
        year_max: String(item.year_max ?? item.year),
        label: item.label ?? '',
        capacity: item.capacity == null ? '' : String(item.capacity),
      },
    }))
  }

  const saveEdit = async (item: CategoryItem) => {
    const draft = editMap[item.id]
    if (!draft) return
    const yearMin = Number(draft.year_min)
    const yearMax = Number(draft.year_max)
    const capacityValue = draft.capacity.trim() === '' ? null : Number(draft.capacity)
    if (!Number.isFinite(yearMin) || !Number.isFinite(yearMax)) {
      alert('Year range tidak valid.')
      return
    }
    if (yearMin > yearMax) {
      alert('Year min tidak boleh lebih besar dari year max.')
      return
    }
    if (capacityValue !== null && (!Number.isFinite(capacityValue) || capacityValue < 0)) {
      alert('Quota tidak valid.')
      return
    }
    setSavingId(item.id)
    try {
      await apiFetch(`/api/categories/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          year_min: yearMin,
          year_max: yearMax,
          label: draft.label,
          capacity: capacityValue,
        }),
      })
      await load()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Categories</h1>
      <div style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
        Categories dibuat otomatis dari tahun lahir & gender.
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

        {categories.map((item) => {
          const draft = editMap[item.id]
          return (
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
                {(item.year_min ?? item.year)}-{(item.year_max ?? item.year)} - {item.gender}
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#333' }}>
                Quota: {item.capacity == null ? 'Unlimited' : item.capacity}
              </div>
              <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                <input
                  placeholder="Label"
                  value={draft?.label ?? item.label}
                  onChange={(e) =>
                    setEditMap((prev) => ({
                      ...prev,
                      [item.id]: {
                        year_min: prev[item.id]?.year_min ?? String(item.year_min ?? item.year),
                        year_max: prev[item.id]?.year_max ?? String(item.year_max ?? item.year),
                        label: e.target.value,
                        capacity: prev[item.id]?.capacity ?? (item.capacity == null ? '' : String(item.capacity)),
                      },
                    }))
                  }
                  onFocus={() => updateEdit(item)}
                  style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <input
                    placeholder="Year min"
                    value={draft?.year_min ?? String(item.year_min ?? item.year)}
                    onChange={(e) =>
                      setEditMap((prev) => ({
                        ...prev,
                        [item.id]: {
                          year_min: e.target.value,
                          year_max: prev[item.id]?.year_max ?? String(item.year_max ?? item.year),
                          label: prev[item.id]?.label ?? item.label,
                          capacity: prev[item.id]?.capacity ?? (item.capacity == null ? '' : String(item.capacity)),
                        },
                      }))
                    }
                    onFocus={() => updateEdit(item)}
                    style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }}
                  />
                  <input
                    placeholder="Year max"
                    value={draft?.year_max ?? String(item.year_max ?? item.year)}
                    onChange={(e) =>
                      setEditMap((prev) => ({
                        ...prev,
                        [item.id]: {
                          year_min: prev[item.id]?.year_min ?? String(item.year_min ?? item.year),
                          year_max: e.target.value,
                          label: prev[item.id]?.label ?? item.label,
                          capacity: prev[item.id]?.capacity ?? (item.capacity == null ? '' : String(item.capacity)),
                        },
                      }))
                    }
                    onFocus={() => updateEdit(item)}
                    style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }}
                  />
                </div>
                <input
                  placeholder="Quota (kosong = unlimited)"
                  value={draft?.capacity ?? (item.capacity == null ? '' : String(item.capacity))}
                  onChange={(e) =>
                    setEditMap((prev) => ({
                      ...prev,
                      [item.id]: {
                        year_min: prev[item.id]?.year_min ?? String(item.year_min ?? item.year),
                        year_max: prev[item.id]?.year_max ?? String(item.year_max ?? item.year),
                        label: prev[item.id]?.label ?? item.label,
                        capacity: e.target.value,
                      },
                    }))
                  }
                  onFocus={() => updateEdit(item)}
                  style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }}
                />
                <button
                  type="button"
                  onClick={() => saveEdit(item)}
                  disabled={savingId === item.id}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 10,
                    border: '2px solid #111',
                    background: '#d7ecff',
                    fontWeight: 900,
                    width: 'fit-content',
                  }}
                >
                  {savingId === item.id ? 'Saving...' : 'Save'}
                </button>
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
        )})}
      </div>
    </div>
  )
}

