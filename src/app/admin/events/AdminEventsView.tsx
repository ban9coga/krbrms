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
  event_scope?: 'PUBLIC' | 'INTERNAL' | null
  draw_mode?: 'internal_live_draw' | 'external_draw' | null
}

type AdminEventsViewProps = {
  showCreate?: boolean
}

const fieldClass =
  'w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-300/30'

const buttonClass =
  'inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.12em] transition-colors'

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
    void loadEvents()
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
        is_public: true,
        event_scope: form.visibility,
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

  const handleEventScope = async (eventId: string, eventScope: NonNullable<EventItem['event_scope']>) => {
    try {
      await apiFetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify({ event_scope: eventScope }),
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
    <div className="grid w-full max-w-[1180px] gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-2">
          <h1 className="text-3xl font-black tracking-tight text-slate-50">{showCreate ? 'Events' : 'Events Snapshot'}</h1>
          <div className="max-w-3xl text-sm font-semibold text-slate-300">
            Status event dipakai untuk tampilan publik. Halaman ini sudah dirapikan supaya create, filter,
            dan aksi event tetap nyaman di tablet maupun smartphone.
          </div>
        </div>
        <Link
          href="/"
          className={`${buttonClass} border border-slate-500 bg-slate-900/70 text-slate-100 hover:bg-slate-800`}
        >
          Public Landing
        </Link>
      </div>

      {showCreate ? (
        <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_18px_40px_rgba(15,23,42,0.12)] sm:p-6">
          <div className="mb-4 grid gap-1">
            <div className="text-xl font-black tracking-tight text-slate-900">Create Event</div>
            <div className="text-sm font-semibold text-slate-500">Set dasar event terlebih dahulu, detail lain bisa diatur setelah event dibuat.</div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="grid gap-2 xl:col-span-2">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Event Name</span>
              <input
                placeholder="Nama event"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={fieldClass}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Location</span>
              <input
                placeholder="Lokasi event"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className={fieldClass}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Date</span>
              <input
                type="date"
                value={form.event_date}
                onChange={(e) => setForm({ ...form, event_date: e.target.value })}
                className={fieldClass}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Status (Public)</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as EventItem['status'] })}
                className={fieldClass}
              >
                <option value="UPCOMING">UPCOMING</option>
                <option value="LIVE">LIVE</option>
                <option value="FINISHED">FINISHED</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Event Type</span>
              <select
                value={form.visibility}
                onChange={(e) => setForm({ ...form, visibility: e.target.value as 'PUBLIC' | 'INTERNAL' })}
                className={fieldClass}
              >
                <option value="PUBLIC">Public Event</option>
                <option value="INTERNAL">Internal Event</option>
              </select>
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Draw Mode</span>
              <select
                value={form.draw_mode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    draw_mode: e.target.value as NonNullable<EventItem['draw_mode']>,
                  })
                }
                className={fieldClass}
              >
                <option value="internal_live_draw">Internal Live Draw</option>
                <option value="external_draw">External Draw (Paste Order)</option>
              </select>
            </label>
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={handleCreate}
              disabled={creating}
              className={`${buttonClass} w-full border border-amber-300 bg-amber-400 text-slate-900 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto`}
            >
              {creating ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </section>
      ) : null}

      <section className="rounded-[1.5rem] border border-slate-700 bg-slate-900/75 p-4 shadow-[0_20px_44px_rgba(2,6,23,0.26)] sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid gap-1">
            <div className="text-xl font-black tracking-tight text-slate-50">Event List</div>
            <div className="text-sm font-semibold text-slate-300">
              Dari card ini kamu bisa langsung masuk ke manage event, settings, atau public page.
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadEvents()}
            disabled={loading}
            className={`${buttonClass} border border-slate-500 bg-slate-800 text-slate-100 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        <div className="mt-4">
          <input
            placeholder="Cari event (nama / lokasi / tanggal)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm font-semibold text-slate-100 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/30"
          />
        </div>

        <div className="mt-4 grid gap-4">
          {filteredEvents.map((ev) => {
            const eventScope = ev.event_scope === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC'
            const scopeTheme =
              eventScope === 'INTERNAL'
                ? { border: 'border-rose-200', background: 'bg-rose-50', color: 'text-rose-700', label: 'Internal Event' }
                : { border: 'border-emerald-200', background: 'bg-emerald-50', color: 'text-emerald-700', label: 'Public Event' }

            return (
              <article
                key={ev.id}
                className="grid gap-4 rounded-[1.4rem] border border-slate-200 bg-white p-4 text-slate-900 shadow-[0_14px_32px_rgba(15,23,42,0.08)] sm:p-5"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="grid gap-2">
                    <div className="text-xl font-black tracking-tight text-slate-900">{ev.name}</div>
                    <div className="flex flex-wrap gap-2">
                      <div className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] ${scopeTheme.border} ${scopeTheme.background} ${scopeTheme.color}`}>
                        {scopeTheme.label}
                      </div>
                      <div
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] ${
                          ev.is_public === false
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {ev.is_public === false ? 'Hidden from Public' : 'Shown on Public'}
                      </div>
                      <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-600">
                        Draw Mode: {ev.draw_mode === 'external_draw' ? 'External Draw' : 'Internal Live Draw'}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-slate-600">
                      {ev.location || '-'} | {ev.event_date}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 xl:min-w-[220px]">
                    <select
                      value={ev.status}
                      onChange={(e) => handleStatus(ev.id, e.target.value as EventItem['status'])}
                      className={fieldClass}
                    >
                      <option value="UPCOMING">UPCOMING</option>
                      <option value="LIVE">LIVE</option>
                      <option value="FINISHED">FINISHED</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => handleVisibility(ev.id, !(ev.is_public ?? true))}
                      className={`${buttonClass} border border-slate-300 bg-white text-slate-800 hover:bg-slate-100`}
                    >
                      {ev.is_public === false ? 'Show on Public' : 'Hide from Public'}
                    </button>

                    <select
                      value={ev.draw_mode === 'external_draw' ? 'external_draw' : 'internal_live_draw'}
                      onChange={(e) => handleDrawMode(ev.id, e.target.value as NonNullable<EventItem['draw_mode']>)}
                      className={fieldClass}
                    >
                      <option value="internal_live_draw">Internal Live Draw</option>
                      <option value="external_draw">External Draw</option>
                    </select>

                    <select
                      value={ev.event_scope === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC'}
                      onChange={(e) => handleEventScope(ev.id, e.target.value as NonNullable<EventItem['event_scope']>)}
                      className={fieldClass}
                    >
                      <option value="PUBLIC">Public Event Type</option>
                      <option value="INTERNAL">Internal Event Type</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/admin/events/${ev.id}/registrations`}
                    className={`${buttonClass} border border-amber-300 bg-amber-400 text-slate-900 hover:bg-amber-300`}
                  >
                    Manage Event
                  </Link>
                  <Link
                    href={`/admin/events/${ev.id}/settings`}
                    className={`${buttonClass} border border-slate-300 bg-white text-slate-800 hover:bg-slate-100`}
                  >
                    Event Settings
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleEdit(ev)}
                    className={`${buttonClass} border border-slate-300 bg-white text-slate-800 hover:bg-slate-100`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(ev.id)}
                    className={`${buttonClass} border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100`}
                  >
                    Delete
                  </button>
                  <Link
                    href={`/event/${ev.id}`}
                    className={`${buttonClass} border border-slate-300 bg-white text-slate-800 hover:bg-slate-100`}
                  >
                    Public Page
                  </Link>
                </div>
              </article>
            )
          })}

          {!loading && filteredEvents.length === 0 && (
            <div className="rounded-[1.35rem] border border-dashed border-slate-600 bg-slate-950/45 p-5 text-sm font-semibold text-slate-300">
              Belum ada event.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
