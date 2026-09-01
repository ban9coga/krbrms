'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { isRegistrationApproverRole, normalizeAppRole } from '../../../lib/roles'
import { supabase } from '@/src/lib/supabaseClient'

type EventStatus = 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'

type EventItem = {
  id: string
  name: string
  location?: string | null
  event_date: string
  status: EventStatus
  is_public?: boolean | null
  event_scope?: 'PUBLIC' | 'INTERNAL' | null
  registration_open?: boolean | null
}

type SnapshotTone = 'danger' | 'accent' | 'success' | 'info' | 'neutral'

const toneClass: Record<SnapshotTone, string> = {
  danger: 'admin-tone-danger',
  accent: 'admin-tone-accent',
  success: 'admin-tone-success',
  info: 'admin-tone-info',
  neutral: 'admin-tone-neutral',
}

const STATUS_META: Record<EventStatus, { label: string; tone: SnapshotTone; weight: number }> = {
  LIVE: { label: 'Live', tone: 'success', weight: 0 },
  PROVISIONAL: { label: 'Provisional', tone: 'info', weight: 1 },
  PROTEST_REVIEW: { label: 'Protest Review', tone: 'danger', weight: 2 },
  UPCOMING: { label: 'Upcoming', tone: 'accent', weight: 3 },
  FINISHED: { label: 'Finished', tone: 'neutral', weight: 4 },
  LOCKED: { label: 'Locked', tone: 'neutral', weight: 5 },
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(`${value}T00:00:00`)
  )

const getEventTime = (value: string) => new Date(`${value}T00:00:00`).getTime()

function SnapshotSkeleton() {
  return (
    <div className="grid gap-2">
      {Array.from({ length: 4 }).map((_, index) => <div key={index} className="admin-skeleton h-20" />)}
    </div>
  )
}

function InfoPill({ label, tone }: { label: string; tone: SnapshotTone }) {
  return <span className={`admin-tone-badge ${toneClass[tone]}`}>{label}</span>
}

export default function AdminEventSnapshot() {
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roleKey, setRoleKey] = useState<string | null>(null)
  const isRegistrationApprover = isRegistrationApproverRole(roleKey)

  const loadEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const response = await fetch('/api/events', { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json?.error || 'Gagal memuat event')
      setEvents(json.data ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Gagal memuat event')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const loadRole = async () => {
      const { data } = await supabase.auth.getUser()
      const user = data.user
      const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
      const appMeta = (user?.app_metadata ?? {}) as Record<string, unknown>
      const role = (typeof meta.role === 'string' ? meta.role : null) || (typeof appMeta.role === 'string' ? appMeta.role : null)
      setRoleKey(normalizeAppRole(role || ''))
    }
    void loadRole()
    void loadEvents()
  }, [loadEvents])

  const snapshotEvents = useMemo(
    () =>
      [...events]
        .sort((a, b) => {
          const statusWeight = STATUS_META[a.status].weight - STATUS_META[b.status].weight
          if (statusWeight !== 0) return statusWeight
          if (a.status === 'FINISHED' || a.status === 'LOCKED') return getEventTime(b.event_date) - getEventTime(a.event_date)
          return getEventTime(a.event_date) - getEventTime(b.event_date)
        })
        .slice(0, 6),
    [events]
  )

  if (loading && events.length === 0) return <SnapshotSkeleton />

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="admin-muted text-sm font-semibold">
          Menampilkan {snapshotEvents.length} event dengan prioritas LIVE, UPCOMING, lalu arsip terbaru.
        </p>
        <button type="button" onClick={() => void loadEvents()} disabled={loading} className="admin-outline-button w-fit">
          {loading ? 'Memuat...' : 'Refresh'}
        </button>
      </div>

      {error && <div className="admin-alert-danger">{error}</div>}

      {snapshotEvents.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="hidden grid-cols-[minmax(0,1fr)_130px_110px_190px] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 md:grid">
            <span>Event</span>
            <span>Status</span>
            <span>Registrasi</span>
            <span className="text-right">Aksi</span>
          </div>
          <div className="divide-y divide-slate-100">
            {snapshotEvents.map((event) => {
              const statusMeta = STATUS_META[event.status]
              const registrationOpen = event.registration_open !== false
              const isPublic = event.is_public !== false
              return (
                <div key={event.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_130px_110px_190px] md:items-center md:gap-4">
                  <div className="min-w-0">
                    <Link href={`/admin/events/${event.id}/registrations`} className="admin-heading block truncate text-base hover:text-amber-700">
                      {event.name}
                    </Link>
                    <div className="admin-muted mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
                      <span>{formatDate(event.event_date)}</span>
                      <span>{event.location || 'Lokasi belum diisi'}</span>
                      <span>{isPublic ? 'Public' : 'Hidden'}</span>
                    </div>
                  </div>
                  <div><InfoPill label={statusMeta.label} tone={statusMeta.tone} /></div>
                  <div className={`text-sm font-black ${registrationOpen ? 'text-emerald-600' : 'text-slate-500'}`}>
                    {registrationOpen ? 'Dibuka' : 'Ditutup'}
                  </div>
                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Link href={`/admin/events/${event.id}/registrations`} className="admin-primary-button px-3 py-2 text-xs">Registrations</Link>
                    {!isRegistrationApprover && <Link href={`/admin/events/${event.id}/motos`} className="admin-outline-button px-3 py-2 text-xs">Motos</Link>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="admin-card-muted py-8 text-center">
          <div className="admin-heading text-lg">Belum ada event yang dapat ditampilkan.</div>
          <p className="admin-muted mt-2 text-sm font-semibold">Buka Event Workspace untuk membuat atau mengecek akses event.</p>
        </div>
      )}

      {events.length > snapshotEvents.length && (
        <div className="admin-muted text-xs font-semibold">
          {events.length - snapshotEvents.length} event lain tidak ditampilkan agar dashboard tetap fokus.
        </div>
      )}
    </div>
  )
}
