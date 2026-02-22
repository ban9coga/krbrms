'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'

type CategoryItem = {
  id: string
  year: number
  gender: 'BOY' | 'GIRL' | 'MIX'
  label: string
  enabled: boolean
}

type MotoItem = {
  id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
  category_id?: string
}

type ScheduleItem = {
  id: string
  event_id: string
  moto_id: string
  schedule_time: string | null
  end_time?: string | null
  track_number: number | null
  motos?: MotoItem | null
}

export default function ScheduleClient({ eventId }: { eventId: string }) {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [motos, setMotos] = useState<MotoItem[]>([])
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [eventDate, setEventDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    category_id: '',
    schedule_time: '',
    end_time: '',
  })

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
      const eventJson = await apiFetch(`/api/events/${eventId}`)
      setEventDate(eventJson?.data?.event_date ?? '')

      const catRes = await fetch(`/api/events/${eventId}/categories`)
      const catJson = await catRes.json()
      setCategories((catJson.data ?? []).filter((c: CategoryItem) => c.enabled))

      const motoRes = await fetch(`/api/motos?event_id=${eventId}`)
      const motoJson = await motoRes.json()
      setMotos(motoJson.data ?? [])

      const scheduleRes = await fetch(`/api/events/${eventId}/schedule`)
      const scheduleJson = await scheduleRes.json()
      setItems(scheduleJson.data ?? [])
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
    for (const c of categories) map.set(c.id, c.label)
    return map
  }, [categories])

  const itemsByCategory = useMemo(() => {
    const grouped = new Map<string, ScheduleItem[]>()
    for (const item of items) {
      const catId = item.motos?.category_id ?? 'unknown'
      const list = grouped.get(catId) ?? []
      list.push(item)
      grouped.set(catId, list)
    }
    return grouped
  }, [items])

  const motosForCategory = useMemo(() => {
    if (!form.category_id) return []
    return motos.filter((m) => m.category_id === form.category_id)
  }, [motos, form.category_id])

  const formatTime = (value?: string | null) => {
    if (!value) return '-'
    const date = new Date(value)
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  }

  const handleAdd = async () => {
    if (!form.category_id) {
      alert('Pilih kategori.')
      return
    }
    if (!eventDate) {
      alert('Tanggal event belum tersedia.')
      return
    }
    if (!form.schedule_time || !form.end_time) {
      alert('Isi jam mulai dan selesai.')
      return
    }
    const defaultMoto = motosForCategory[0]
    if (!defaultMoto) {
      alert('Belum ada moto untuk kategori ini.')
      return
    }
    setSaving(true)
    try {
      const toIso = (timeValue: string) => new Date(`${eventDate}T${timeValue}:00`).toISOString()
      const payload = {
        schedule_time: toIso(form.schedule_time),
        end_time: toIso(form.end_time),
        track_number: null,
      }
      const existing = itemsByCategory.get(form.category_id)?.[0]
      if (existing?.id) {
        await apiFetch(`/api/events/${eventId}/schedule/${existing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      } else {
        await apiFetch(`/api/events/${eventId}/schedule`, {
          method: 'POST',
          body: JSON.stringify({
            moto_id: defaultMoto.id,
            ...payload,
          }),
        })
      }
      setForm({ category_id: '', schedule_time: '', end_time: '' })
      await load()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Hapus schedule item ini?')) return
    setSaving(true)
    try {
      await apiFetch(`/api/events/${eventId}/schedule/${id}`, { method: 'DELETE' })
      await load()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Race Schedule</h1>
      <div style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
        Atur jadwal Moto per event (waktu & track optional).
      </div>

      <div
        style={{
          marginTop: 16,
          background: '#fff',
          border: '2px solid #111',
          borderRadius: 16,
          padding: 16,
          display: 'grid',
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 950, fontSize: 18 }}>Add Schedule Item</div>
        <select
          value={form.category_id}
          onChange={(e) => setForm({ ...form, category_id: e.target.value })}
          style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 900 }}
        >
          <option value="">Pilih Kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="time"
          value={form.schedule_time}
          onChange={(e) => setForm({ ...form, schedule_time: e.target.value })}
          style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 900 }}
        />
        <input
          type="time"
          value={form.end_time}
          onChange={(e) => setForm({ ...form, end_time: e.target.value })}
          style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 900 }}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving}
          style={{
            padding: 14,
            borderRadius: 14,
            border: '2px solid #111',
            background: '#2ecc71',
            fontWeight: 950,
            cursor: 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Add to Schedule'}
        </button>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        {loading && (
          <div style={{ padding: 14, borderRadius: 16, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Loading...
          </div>
        )}

        {!loading && items.length === 0 && (
          <div style={{ padding: 14, borderRadius: 16, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Schedule kosong.
          </div>
        )}

        {!loading && items.length > 0 && (
          <div style={{ display: 'grid', gap: 12 }}>
            {[...itemsByCategory.entries()].map(([categoryId, list]) => (
              <div
                key={categoryId}
                style={{
                  padding: 14,
                  borderRadius: 16,
                  border: '2px solid #111',
                  background: '#fff',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ fontWeight: 950 }}>
                  {categoryId === 'unknown' ? 'Uncategorized' : categoryLabel.get(categoryId) ?? categoryId}
                </div>
                {list.map((it) => (
                  <div
                    key={it.id}
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      border: '2px solid #111',
                      background: '#eaf7ee',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'start',
                      gap: 12,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 950 }}>Jadwal Kategori</div>
                      <div style={{ marginTop: 2, color: '#333', fontWeight: 700, fontSize: 13 }}>
                        Time: {formatTime(it.schedule_time)}
                        {it.end_time ? ` - ${formatTime(it.end_time)}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDelete(it.id)}
                      disabled={saving}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: '2px solid #b40000',
                        background: '#ffd7d7',
                        color: '#b40000',
                        fontWeight: 950,
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {false && items.map((it) => (
          <div
            key={it.id}
            style={{
              padding: 14,
              borderRadius: 16,
              border: '2px solid #111',
              background: '#fff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'start',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 950 }}>
                {it.motos?.moto_name ?? it.moto_id}
              </div>
              <div style={{ marginTop: 2, color: '#333', fontWeight: 700, fontSize: 13 }}>
                Time: {it.schedule_time ? new Date(it.schedule_time).toLocaleString() : '-'} • Track:{' '}
                {it.track_number ?? '-'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleDelete(it.id)}
              disabled={saving}
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                border: '2px solid #b40000',
                background: '#ffd7d7',
                color: '#b40000',
                fontWeight: 950,
                cursor: 'pointer',
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

