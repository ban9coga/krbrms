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

type FeedbackState = {
  type: 'success' | 'error'
  message: string
} | null

type StatusFilter = 'ALL' | EventItem['status']
type ScopeFilter = 'ALL' | 'PUBLIC' | 'INTERNAL'

const fieldClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/30'

const subtleButtonClass =
  'inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950'

const primaryButtonClass =
  'inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-slate-800'

const STATUS_META: Record<EventItem['status'], { label: string; className: string; weight: number }> = {
  LIVE: {
    label: 'Live',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    weight: 0,
  },
  UPCOMING: {
    label: 'Upcoming',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
    weight: 1,
  },
  FINISHED: {
    label: 'Finished',
    className: 'border-slate-200 bg-slate-100 text-slate-700',
    weight: 2,
  },
  PROVISIONAL: {
    label: 'Provisional',
    className: 'border-sky-200 bg-sky-50 text-sky-700',
    weight: 3,
  },
  PROTEST_REVIEW: {
    label: 'Protest Review',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
    weight: 4,
  },
  LOCKED: {
    label: 'Locked',
    className: 'border-violet-200 bg-violet-50 text-violet-700',
    weight: 5,
  },
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
      <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-3 text-2xl font-black tracking-tight text-slate-950">{value}</div>
    </article>
  )
}

export default function AdminEventsView({ showCreate = true }: AdminEventsViewProps) {
  const [events, setEvents] = useState<EventItem[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('ALL')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [canCreate, setCanCreate] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [actionKey, setActionKey] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    location: '',
    event_date: '',
    status: 'UPCOMING' as EventItem['status'],
    visibility: 'PUBLIC' as 'PUBLIC' | 'INTERNAL',
    draw_mode: 'internal_live_draw' as NonNullable<EventItem['draw_mode']>,
  })

  const getErrorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Request failed')

  const apiFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(json?.error || 'Request failed')
    }
    return json
  }, [])

  const loadEvents = useCallback(async () => {
    setLoading(true)
    try {
      const json = await apiFetch('/api/events')
      setEvents(json.data ?? [])
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: `Gagal memuat event: ${getErrorMessage(err)}` })
    } finally {
      setLoading(false)
    }
  }, [apiFetch])

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      const user = data.user
      const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
      const appMeta = (user?.app_metadata ?? {}) as Record<string, unknown>
      const metaRole = typeof meta.role === 'string' ? meta.role : null
      const appRole = typeof appMeta.role === 'string' ? appMeta.role : null
      const role = String(metaRole || appRole || '').trim().toUpperCase()
      setCanCreate(role === 'SUPER_ADMIN')
    }

    void loadUser()
    void loadEvents()
  }, [loadEvents])

  const runEventAction = useCallback(
    async (key: string, task: () => Promise<void>, successMessage: string) => {
      setActionKey(key)
      setFeedback(null)
      try {
        await task()
        await loadEvents()
        setFeedback({ type: 'success', message: successMessage })
      } catch (err: unknown) {
        setFeedback({ type: 'error', message: getErrorMessage(err) })
      } finally {
        setActionKey(null)
      }
    },
    [loadEvents]
  )

  const handleCreate = async () => {
    if (!form.name.trim() || !form.event_date) {
      setFeedback({ type: 'error', message: 'Nama event dan tanggal event wajib diisi.' })
      return
    }

    setCreating(true)
    setFeedback(null)
    try {
      const payload = {
        name: form.name.trim(),
        location: form.location.trim() || null,
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
      setShowCreateForm(false)
      await loadEvents()
      setFeedback({ type: 'success', message: 'Event baru berhasil dibuat.' })
    } catch (err: unknown) {
      setFeedback({ type: 'error', message: getErrorMessage(err) })
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

    await runEventAction(
      `edit-${event.id}`,
      async () => {
        await apiFetch(`/api/events/${event.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: nextName.trim(),
            location: nextLocation.trim() || null,
            event_date: nextDate.trim(),
          }),
        })
      },
      `Event "${event.name}" berhasil diperbarui.`
    )
  }

  const handleDelete = async (event: EventItem) => {
    if (!window.confirm(`Hapus event "${event.name}"? Semua data terkait akan ikut terhapus.`)) return

    await runEventAction(
      `delete-${event.id}`,
      async () => {
        await apiFetch(`/api/events/${event.id}`, { method: 'DELETE' })
      },
      `Event "${event.name}" berhasil dihapus.`
    )
  }

  const handleStatus = async (event: EventItem, status: EventItem['status']) => {
    await runEventAction(
      `status-${event.id}`,
      async () => {
        await apiFetch(`/api/events/${event.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        })
      },
      `Status "${event.name}" diperbarui ke ${STATUS_META[status].label}.`
    )
  }

  const handleVisibility = async (event: EventItem, isPublic: boolean) => {
    await runEventAction(
      `visibility-${event.id}`,
      async () => {
        await apiFetch(`/api/events/${event.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_public: isPublic }),
        })
      },
      isPublic ? `Event "${event.name}" tampil di publik.` : `Event "${event.name}" disembunyikan dari publik.`
    )
  }

  const handleDrawMode = async (event: EventItem, drawMode: NonNullable<EventItem['draw_mode']>) => {
    await runEventAction(
      `draw-${event.id}`,
      async () => {
        await apiFetch(`/api/events/${event.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ draw_mode: drawMode }),
        })
      },
      `Draw mode "${event.name}" berhasil diperbarui.`
    )
  }

  const handleEventScope = async (event: EventItem, eventScope: NonNullable<EventItem['event_scope']>) => {
    await runEventAction(
      `scope-${event.id}`,
      async () => {
        await apiFetch(`/api/events/${event.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ event_scope: eventScope }),
        })
      },
      `Tipe event "${event.name}" berhasil diperbarui.`
    )
  }

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase()

    return [...events]
      .filter((event) => {
        if (statusFilter !== 'ALL' && event.status !== statusFilter) return false

        const resolvedScope = event.event_scope === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC'
        if (scopeFilter !== 'ALL' && resolvedScope !== scopeFilter) return false

        if (!q) return true
        const haystack = `${event.name} ${event.location ?? ''} ${event.event_date}`.toLowerCase()
        return haystack.includes(q)
      })
      .sort((a, b) => {
        const weight = STATUS_META[a.status].weight - STATUS_META[b.status].weight
        if (weight !== 0) return weight
        return new Date(b.event_date).getTime() - new Date(a.event_date).getTime()
      })
  }, [events, query, scopeFilter, statusFilter])

  const summary = useMemo(() => {
    const publicEvents = events.filter((event) => (event.event_scope === 'INTERNAL' ? false : true)).length
    const internalEvents = events.filter((event) => event.event_scope === 'INTERNAL').length
    const liveEvents = events.filter((event) => event.status === 'LIVE').length
    const hiddenEvents = events.filter((event) => event.is_public === false).length

    return {
      total: events.length,
      publicEvents,
      internalEvents,
      liveEvents,
      hiddenEvents,
    }
  }, [events])

  return (
    <div className="grid gap-6">
      <section className="rounded-[1.8rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fafc_68%,#fef3c7_100%)] p-5 shadow-[0_20px_44px_rgba(15,23,42,0.06)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-2">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
              {showCreate ? 'Event Workspace' : 'Event Snapshot'}
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-[2rem]">
              {showCreate ? 'Event Workspace' : 'Event Snapshot'}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/" className={subtleButtonClass}>
              Public Landing
            </Link>
            {showCreate && (
              <Link href="/admin" className={subtleButtonClass}>
                Dashboard
              </Link>
            )}
            {showCreate && canCreate && (
              <button
                type="button"
                onClick={() => setShowCreateForm((prev) => !prev)}
                className={subtleButtonClass}
              >
                {showCreateForm ? 'Tutup Form Event' : 'Tambah Event Baru'}
              </button>
            )}
            <button type="button" onClick={() => void loadEvents()} disabled={loading} className={primaryButtonClass}>
              {loading ? 'Refreshing…' : 'Refresh Events'}
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total Event" value={summary.total} />
        <SummaryCard label="Public Event" value={summary.publicEvents} />
        <SummaryCard label="Internal Event" value={summary.internalEvents} />
        <SummaryCard label="Live Event" value={summary.liveEvents} />
        <SummaryCard label="Hidden from Public" value={summary.hiddenEvents} />
      </section>

      {feedback && (
        <div
          className={`rounded-[1.5rem] border px-5 py-4 text-sm font-semibold shadow-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {showCreate && canCreate && showCreateForm ? (
        <section className="admin-surface overflow-hidden px-6 py-6 lg:px-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
            <div className="grid gap-4">
              <div className="grid gap-1">
                <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Create Event</div>
                <h2 className="text-2xl font-black tracking-tight text-slate-950">Create Event</h2>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 md:col-span-2">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Event Name</span>
                  <input
                    placeholder="Contoh: Pushbike Open Championship Padang"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    className={fieldClass}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Location</span>
                  <input
                    placeholder="Lokasi event"
                    value={form.location}
                    onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
                    className={fieldClass}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Date</span>
                  <input
                    type="date"
                    value={form.event_date}
                    onChange={(e) => setForm((prev) => ({ ...prev, event_date: e.target.value }))}
                    className={fieldClass}
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Public Status</span>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as EventItem['status'] }))}
                    className={fieldClass}
                  >
                    <option value="UPCOMING">UPCOMING</option>
                    <option value="LIVE">LIVE</option>
                    <option value="FINISHED">FINISHED</option>
                  </select>
                </label>

                <label className="grid gap-2">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Event Type</span>
                  <select
                    value={form.visibility}
                    onChange={(e) => setForm((prev) => ({ ...prev, visibility: e.target.value as 'PUBLIC' | 'INTERNAL' }))}
                    className={fieldClass}
                  >
                    <option value="PUBLIC">Public Event</option>
                    <option value="INTERNAL">Internal Event</option>
                  </select>
                </label>

                <label className="grid gap-2 md:col-span-2">
                  <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Draw Mode</span>
                  <select
                    value={form.draw_mode}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        draw_mode: e.target.value as NonNullable<EventItem['draw_mode']>,
                      }))
                    }
                    className={fieldClass}
                  >
                    <option value="internal_live_draw">Internal Live Draw</option>
                    <option value="external_draw">External Draw (Paste Order)</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
              <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Action</div>
              <button type="button" onClick={handleCreate} disabled={creating} className={`${primaryButtonClass} mt-6 w-full`}>
                {creating ? 'Creating Event…' : 'Create Event'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                disabled={creating}
                className={`${subtleButtonClass} mt-3 w-full`}
              >
                Batal
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section className="admin-surface overflow-hidden px-6 py-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-1">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Event Directory</div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">Event Directory</h2>
          </div>
          <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-500">
            {loading ? 'Memuat daftar event…' : `${filteredEvents.length} event tampil`}
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_220px_220px]">
          <input
            placeholder="Cari event berdasarkan nama, lokasi, atau tanggal"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={fieldClass}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className={fieldClass}>
            <option value="ALL">Semua Status</option>
            <option value="UPCOMING">Upcoming</option>
            <option value="LIVE">Live</option>
            <option value="FINISHED">Finished</option>
            <option value="PROVISIONAL">Provisional</option>
            <option value="PROTEST_REVIEW">Protest Review</option>
            <option value="LOCKED">Locked</option>
          </select>
          <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value as ScopeFilter)} className={fieldClass}>
            <option value="ALL">Semua Tipe Event</option>
            <option value="PUBLIC">Public Event</option>
            <option value="INTERNAL">Internal Event</option>
          </select>
        </div>

        <div className="mt-6 grid gap-4">
          {filteredEvents.map((event) => {
            const statusMeta = STATUS_META[event.status]
            const eventScope = event.event_scope === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC'
            const isPublic = event.is_public !== false
            const drawMode = event.draw_mode === 'external_draw' ? 'External Draw' : 'Internal Live Draw'
            const busy = Boolean(actionKey && actionKey.includes(event.id))

            return (
              <article
                key={event.id}
                className="grid gap-5 rounded-[1.7rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#ffffff_72%,#f8fafc_100%)] p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]"
              >
                <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="grid gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${statusMeta.className}`}>
                        {statusMeta.label}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${
                          eventScope === 'INTERNAL'
                            ? 'border-rose-200 bg-rose-50 text-rose-700'
                            : 'border-sky-200 bg-sky-50 text-sky-700'
                        }`}
                      >
                        {eventScope === 'INTERNAL' ? 'Internal Event' : 'Public Event'}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${
                          isPublic
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-slate-100 text-slate-600'
                        }`}
                      >
                        {isPublic ? 'Shown on Public' : 'Hidden from Public'}
                      </span>
                    </div>

                    <div className="grid gap-1">
                      <h3 className="text-2xl font-black tracking-tight text-slate-950">{event.name}</h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-slate-500">
                        <span>{event.location || 'Lokasi belum diisi'}</span>
                        <span>{formatDate(event.event_date)}</span>
                        <span>{drawMode}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link href={`/admin/events/${event.id}/registrations`} className={primaryButtonClass}>
                        Manage Event
                      </Link>
                      <Link href={`/admin/events/${event.id}/settings`} className={subtleButtonClass}>
                        Event Settings
                      </Link>
                      <Link href={`/event/${event.id}`} className={subtleButtonClass}>
                        Public Page
                      </Link>
                    </div>
                  </div>

                  <div className="grid gap-3 xl:min-w-[260px]">
                    <label className="grid gap-2">
                      <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Status</span>
                      <select
                        value={event.status}
                        onChange={(e) => void handleStatus(event, e.target.value as EventItem['status'])}
                        className={fieldClass}
                        disabled={busy}
                      >
                        <option value="UPCOMING">UPCOMING</option>
                        <option value="LIVE">LIVE</option>
                        <option value="FINISHED">FINISHED</option>
                        <option value="PROVISIONAL">PROVISIONAL</option>
                        <option value="PROTEST_REVIEW">PROTEST_REVIEW</option>
                        <option value="LOCKED">LOCKED</option>
                      </select>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Draw Mode</span>
                      <select
                        value={event.draw_mode === 'external_draw' ? 'external_draw' : 'internal_live_draw'}
                        onChange={(e) => void handleDrawMode(event, e.target.value as NonNullable<EventItem['draw_mode']>)}
                        className={fieldClass}
                        disabled={busy}
                      >
                        <option value="internal_live_draw">Internal Live Draw</option>
                        <option value="external_draw">External Draw</option>
                      </select>
                    </label>

                    <label className="grid gap-2">
                      <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">Event Type</span>
                      <select
                        value={eventScope}
                        onChange={(e) => void handleEventScope(event, e.target.value as NonNullable<EventItem['event_scope']>)}
                        className={fieldClass}
                        disabled={busy}
                      >
                        <option value="PUBLIC">Public Event</option>
                        <option value="INTERNAL">Internal Event</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={() => void handleVisibility(event, !isPublic)}
                    className={subtleButtonClass}
                    disabled={busy}
                  >
                    {isPublic ? 'Hide from Public' : 'Show on Public'}
                  </button>
                  <button type="button" onClick={() => void handleEdit(event)} className={subtleButtonClass} disabled={busy}>
                    Edit Basics
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(event)}
                    className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100"
                    disabled={busy}
                  >
                    Delete Event
                  </button>
                  {busy && (
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-amber-700">
                      Saving…
                    </span>
                  )}
                </div>
              </article>
            )
          })}

          {!loading && filteredEvents.length === 0 && (
            <div className="rounded-[1.7rem] border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <div className="text-lg font-black tracking-tight text-slate-900">Belum ada event yang cocok.</div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
