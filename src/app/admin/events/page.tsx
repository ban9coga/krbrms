'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

type EventItem = {
  id: string
  name: string
  location?: string | null
  event_date: string
  status: 'UPCOMING' | 'LIVE' | 'FINISHED'
  is_public?: boolean | null
}

export default function AdminEventsPage({ showCreate = true }: { showCreate?: boolean }) {
  const [events, setEvents] = useState<EventItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: '',
    location: '',
    event_date: '',
    status: 'UPCOMING' as EventItem['status'],
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

  const loadEvents = async () => {
    setLoading(true)
    try {
      const json = await apiFetch('/api/events')
      setEvents(json.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEvents()
  }, [])

  const handleCreate = async () => {
    if (!form.name.trim() || !form.event_date) {
      alert('Nama dan tanggal event wajib diisi.')
      return
    }
    setCreating(true)
    try {
      await apiFetch('/api/events', { method: 'POST', body: JSON.stringify(form) })
      setForm({ name: '', location: '', event_date: '', status: 'UPCOMING' })
      await loadEvents()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  const handleEdit = async (event: EventItem) => {
    const nextName = window.prompt('Nama event', event.name)
    if (!nextName || !nextName.trim()) return
    const nextLocation = window.prompt('Lokasi', event.location ?? '')
    if (nextLocation === null) return
    const nextDate = window.prompt('Tanggal (YYYY-MM-DD)', event.event_date)
    if (!nextDate || !nextDate.trim()) return
    try {
      await apiFetch(`/api/events/${event.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: nextName.trim(),
          location: nextLocation.trim() || null,
          event_date: nextDate.trim(),
        }),
      })
      await loadEvents()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    }
  }

  const handleDelete = async (eventId: string) => {
    if (!window.confirm('Hapus event ini? Semua data terkait akan ikut terhapus.')) return
    try {
      await apiFetch(`/api/events/${eventId}`, { method: 'DELETE' })
      await loadEvents()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    }
  }

  const handleStatus = async (eventId: string, status: EventItem['status']) => {
    if (!eventId) {
      alert('Event ID tidak valid.')
      return
    }
    try {
      await apiFetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      await loadEvents()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    }
  }

  const handleVisibility = async (eventId: string, isPublic: boolean) => {
    try {
      await apiFetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_public: isPublic }),
      })
      await loadEvents()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    }
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 950, margin: 0 }}>Events</h1>
          <div style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
            Status event hanya untuk tampilan publik (Coming Soon / Ongoing / Completed).
          </div>
        </div>
        <Link
          href="/"
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '2px solid #111',
            background: '#fff',
            color: '#111',
            fontWeight: 900,
            textDecoration: 'none',
          }}
        >
          Public Landing
        </Link>
      </div>

      {showCreate ? (
        <div
          style={{
            marginTop: 18,
            background: '#fff',
            border: '2px solid #111',
            borderRadius: 16,
            padding: 16,
          }}
        >
          <div style={{ fontWeight: 950, fontSize: 18 }}>Create Event</div>
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            <input
              placeholder="Event Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
            />
            <input
              placeholder="Location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
            />
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Date
              </div>
              <input
                type="date"
                value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
              />
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Status (Public)
              </div>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as EventItem['status'] })}
                style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
              >
                <option value="UPCOMING">UPCOMING</option>
                <option value="LIVE">LIVE</option>
                <option value="FINISHED">FINISHED</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              style={{
                padding: 12,
                borderRadius: 14,
                border: '2px solid #111',
                background: '#2ecc71',
                fontWeight: 950,
                cursor: 'pointer',
              }}
            >
              {creating ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontWeight: 950, fontSize: 18 }}>Event List</div>
          <button
            type="button"
            onClick={loadEvents}
            disabled={loading}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '2px solid #111',
              background: '#fff',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        <input
          placeholder="Cari event (nama / lokasi / tanggal)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
        />
      </div>

      {(() => {
        const q = query.trim().toLowerCase()
        const filtered = q
          ? events.filter((event) => {
              const hay = `${event.name} ${event.location ?? ''} ${event.event_date}`.toLowerCase()
              return hay.includes(q)
            })
          : events
        const safeFiltered: EventItem[] = filtered.filter(Boolean) as EventItem[]
        return (
      <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
        {safeFiltered.map((ev: EventItem) => {
          if (!ev) return null
          return (
          <div
            key={ev.id}
            style={{
              padding: 14,
              border: '2px solid #111',
              borderRadius: 16,
              background: '#fff',
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 950, fontSize: 18 }}>{ev.name}</div>
                {ev.is_public === false && (
                  <div style={{ marginTop: 4, fontSize: 12, fontWeight: 900, color: '#b40000' }}>
                    Hidden from public
                  </div>
                )}
                <div style={{ marginTop: 2, color: '#333', fontWeight: 700 }}>
                  {ev.location || '-'} • {ev.event_date}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
                <select
                  value={ev.status}
                  onChange={(e) => handleStatus(ev.id, e.target.value as EventItem['status'])}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 12,
                    border: '2px solid #111',
                    background: '#fff',
                    fontWeight: 900,
                  }}
                >
                  <option value="UPCOMING">UPCOMING</option>
                  <option value="LIVE">LIVE</option>
                  <option value="FINISHED">FINISHED</option>
                </select>
                <button
                  type="button"
                  onClick={() => handleVisibility(ev.id, !(ev.is_public ?? true))}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 12,
                    border: '2px solid #111',
                    background: ev.is_public === false ? '#ffe1e1' : '#fff',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  {ev.is_public === false ? 'Show on Public' : 'Hide from Public'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link
                href={`/admin/events/${ev.id}`}
                style={{
                  padding: '8px 12px',
                  borderRadius: 12,
                  border: '2px solid #111',
                  background: '#2ecc71',
                  fontWeight: 950,
                  textDecoration: 'none',
                  color: '#111',
                }}
              >
                Manage Event
              </Link>
              <button
                type="button"
                onClick={() => handleEdit(ev)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 12,
                  border: '2px solid #111',
                  background: '#fff',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => handleDelete(ev.id)}
                style={{
                  padding: '8px 12px',
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
              <a
                href={`/event/${ev.id}`}
                style={{
                  padding: '8px 12px',
                  borderRadius: 12,
                  border: '2px solid #111',
                  background: '#fff',
                  fontWeight: 900,
                  textDecoration: 'none',
                  color: '#111',
                }}
              >
                Public Page
              </a>
            </div>
            </div>
        )})}
        {!loading && filtered.length === 0 && (
          <div
            style={{
              padding: 16,
              borderRadius: 16,
              border: '2px dashed #111',
              background: '#fff',
              fontWeight: 800,
            }}
          >
            Belum ada event.
          </div>
        )}
      </div>
        )
      })()}
    </div>
  )
}

