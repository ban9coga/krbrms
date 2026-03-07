'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

type EventItem = {
  id: string
  name: string
  location?: string | null
  event_date: string
  status: 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
  is_public?: boolean | null
  draw_mode?: 'internal_live_draw' | 'external_draw' | null
}

type AdminEventsViewProps = {
  showCreate?: boolean
}

export default function AdminEventsView({ showCreate = true }: AdminEventsViewProps) {
  const [events, setEvents] = useState<EventItem[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    name: '',
    location: '',
    event_date: '',
    status: 'UPCOMING' as EventItem['status'],
    visibility: 'PUBLIC' as 'PUBLIC' | 'INTERNAL',
    draw_mode: 'internal_live_draw' as NonNullable<EventItem['draw_mode']>,
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

  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const json = await apiFetch('/api/events')
      setEvents(json.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadEvents()
  }, [loadEvents])

  const handleCreate = async () => {
    if (!form.name.trim() || !form.event_date) {
      alert('Nama dan tanggal event wajib diisi.')
      return
    }
    setCreating(true)
    try {
      const payload = {
        name: form.name,
        location: form.location,
        event_date: form.event_date,
        status: form.status,
        is_public: form.visibility === 'PUBLIC',
        draw_mode: form.draw_mode,
      }
      await apiFetch('/api/events', { method: 'POST', body: JSON.stringify(payload) })
      setForm({
        name: '',
        location: '',
        event_date: '',
        status: 'UPCOMING',
        visibility: 'PUBLIC',
        draw_mode: 'internal_live_draw',
      })
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

  const handleDrawMode = async (eventId: string, drawMode: NonNullable<EventItem['draw_mode']>) => {
    try {
      await apiFetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify({ draw_mode: drawMode }),
      })
      await loadEvents()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    }
  }

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return events
    return events.filter((event) => {
      const haystack = `${event.name} ${event.location ?? ''} ${event.event_date}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [events, query])

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 950, margin: 0, color: '#f8fafc' }}>{showCreate ? 'Events' : 'Events Snapshot'}</h1>
          <div style={{ marginTop: 8, color: '#cbd5e1', fontWeight: 700 }}>
            Status event hanya untuk tampilan publik (Coming Soon / Ongoing / Completed).
          </div>
        </div>
        <Link
          href="/"
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid rgba(148,163,184,0.38)',
            background: 'rgba(15,23,42,0.72)',
            color: '#f8fafc',
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
            background: '#ffffff',
            border: '1px solid #cbd5e1',
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
              style={{ padding: 12, borderRadius: 12, border: '1px solid #cbd5e1' }}
            />
            <input
              placeholder="Location"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              style={{ padding: 12, borderRadius: 12, border: '1px solid #cbd5e1' }}
            />
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Date
              </div>
              <input
                type="date"
                value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #cbd5e1' }}
              />
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Status (Public)
              </div>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as EventItem['status'] })}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #cbd5e1' }}
              >
                <option value="UPCOMING">UPCOMING</option>
                <option value="LIVE">LIVE</option>
                <option value="FINISHED">FINISHED</option>
              </select>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Event Type
              </div>
              <select
                value={form.visibility}
                onChange={(e) => setForm({ ...form, visibility: e.target.value as 'PUBLIC' | 'INTERNAL' })}
                style={{ padding: 12, borderRadius: 12, border: '1px solid #cbd5e1' }}
              >
                <option value="PUBLIC">Public Event</option>
                <option value="INTERNAL">Internal Event</option>
              </select>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Draw Mode
              </div>
              <select
                value={form.draw_mode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    draw_mode: e.target.value as NonNullable<EventItem['draw_mode']>,
                  })
                }
                style={{ padding: 12, borderRadius: 12, border: '1px solid #cbd5e1' }}
              >
                <option value="internal_live_draw">Internal Live Draw</option>
                <option value="external_draw">External Draw (Paste Order)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              style={{
                padding: 12,
                borderRadius: 14,
                border: '1px solid #fb7185',
                background: '#f43f5e',
                color: '#fff1f2',
                fontWeight: 900,
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
          <div style={{ fontWeight: 950, fontSize: 18, color: '#e2e8f0' }}>Event List</div>
          <button
            type="button"
            onClick={loadEvents}
            disabled={loading}
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,0.38)',
              background: 'rgba(15,23,42,0.72)',
              color: '#f8fafc',
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
          style={{ padding: 12, borderRadius: 12, border: '1px solid #334155', background: '#0f172a', color: '#f8fafc' }}
        />
      </div>

      <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
        {filteredEvents.map((ev) => (
          <div
            key={ev.id}
            style={{
              padding: 14,
              border: '1px solid #cbd5e1',
              borderRadius: 16,
              background: '#fff',
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 950, fontSize: 18 }}>{ev.name}</div>
                <div
                  style={{
                    marginTop: 4,
                    width: 'fit-content',
                    padding: '3px 8px',
                    borderRadius: 999,
                    border: `1px solid ${ev.is_public === false ? '#fca5a5' : '#86efac'}`,
                    background: ev.is_public === false ? '#fff1f2' : '#f0fdf4',
                    color: ev.is_public === false ? '#9f1239' : '#166534',
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  {ev.is_public === false ? 'Internal Event' : 'Public Event'}
                </div>
                <div style={{ marginTop: 2, color: '#334155', fontWeight: 700 }}>
                  {ev.location || '-'} | {ev.event_date}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    width: 'fit-content',
                    padding: '3px 8px',
                    borderRadius: 999,
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#334155',
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  Draw Mode: {ev.draw_mode === 'external_draw' ? 'External Draw' : 'Internal Live Draw'}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
                <select
                  value={ev.status}
                  onChange={(e) => handleStatus(ev.id, e.target.value as EventItem['status'])}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 12,
                    border: '1px solid #cbd5e1',
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
                    border: '1px solid #cbd5e1',
                    background: ev.is_public === false ? '#ffe1e1' : '#fff',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  {ev.is_public === false ? 'Show on Public' : 'Hide from Public'}
                </button>
                <select
                  value={ev.draw_mode === 'external_draw' ? 'external_draw' : 'internal_live_draw'}
                  onChange={(e) =>
                    handleDrawMode(ev.id, e.target.value as NonNullable<EventItem['draw_mode']>)
                  }
                  style={{
                    padding: '8px 10px',
                    borderRadius: 12,
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    fontWeight: 900,
                    minWidth: 190,
                  }}
                >
                  <option value="internal_live_draw">Internal Live Draw</option>
                  <option value="external_draw">External Draw</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link
                href={`/admin/events/${ev.id}`}
                style={{
                  padding: '8px 12px',
                  borderRadius: 12,
                  border: '1px solid #fb7185',
                  background: '#f43f5e',
                  color: '#fff1f2',
                  fontWeight: 900,
                  textDecoration: 'none',
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
                  border: '1px solid #cbd5e1',
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
                  border: '1px solid #fca5a5',
                  background: '#ffe4e6',
                  color: '#be123c',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
              <Link
                href={`/event/${ev.id}`}
                style={{
                  padding: '8px 12px',
                  borderRadius: 12,
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  fontWeight: 900,
                  textDecoration: 'none',
                  color: '#111827',
                }}
              >
                Public Page
              </Link>
            </div>
          </div>
        ))}
        {!loading && filteredEvents.length === 0 && (
          <div
            style={{
              padding: 16,
              borderRadius: 16,
              border: '1px dashed rgba(148,163,184,0.6)',
              background: 'rgba(15,23,42,0.72)',
              color: '#cbd5e1',
              fontWeight: 800,
            }}
          >
            Belum ada event.
          </div>
        )}
      </div>
    </div>
  )
}
