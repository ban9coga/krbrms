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
  LIVE: {
    label: 'Live',
    tone: 'success',
    weight: 0,
  },
  PROVISIONAL: {
    label: 'Provisional',
    tone: 'info',
    weight: 1,
  },
  PROTEST_REVIEW: {
    label: 'Protest Review',
    tone: 'danger',
    weight: 2,
  },
  UPCOMING: {
    label: 'Upcoming',
    tone: 'accent',
    weight: 3,
  },
  FINISHED: {
    label: 'Finished',
    tone: 'neutral',
    weight: 4,
  },
  LOCKED: {
    label: 'Locked',
    tone: 'neutral',
    weight: 5,
  },
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))

const getEventTime = (value: string) => new Date(`${value}T00:00:00`).getTime()

const formatRelativeDate = (value: string) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const eventDate = new Date(`${value}T00:00:00`)
  const diffDays = Math.round((eventDate.getTime() - today.getTime()) / 86_400_000)

  if (diffDays === 0) return 'Hari ini'
  if (diffDays === 1) return 'Besok'
  if (diffDays > 1) return `H-${diffDays}`
  if (diffDays === -1) return 'Kemarin'
  return `${Math.abs(diffDays)} hari lalu`
}

function SnapshotSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <article key={index} className="admin-card grid gap-4">
          <div className="flex items-center gap-2">
            <div className="admin-skeleton h-7 w-24" />
            <div className="admin-skeleton h-7 w-20" />
          </div>
          <div className="grid gap-2">
            <div className="admin-skeleton h-7 w-3/4" />
            <div className="admin-skeleton h-4 w-1/2" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="admin-skeleton h-12" />
            <div className="admin-skeleton h-12" />
          </div>
        </article>
      ))}
    </div>
  )
}

function InfoPill({
  label,
  tone,
}: {
  label: string
  tone: SnapshotTone
}) {
  return (
    <span className={`admin-tone-badge ${toneClass[tone]}`}>
      {label}
    </span>
  )
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
      const res = await fetch('/api/events', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Gagal memuat event')
      setEvents(json.data ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat event')
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
      const metaRole = typeof meta.role === 'string' ? meta.role : null
      const appRole = typeof appMeta.role === 'string' ? appMeta.role : null
      setRoleKey(normalizeAppRole(metaRole || appRole || ''))
    }

    void loadRole()
    void loadEvents()
  }, [loadEvents])

  const summary = useMemo(() => {
    const live = events.filter((event) => event.status === 'LIVE').length
    const upcoming = events.filter((event) => event.status === 'UPCOMING').length
    const registrationOpen = events.filter((event) => event.registration_open !== false).length

    return { live, upcoming, registrationOpen }
  }, [events])

  const snapshotEvents = useMemo(() => {
    return [...events]
      .sort((a, b) => {
        const statusWeight = STATUS_META[a.status].weight - STATUS_META[b.status].weight
        if (statusWeight !== 0) return statusWeight

        const aTime = getEventTime(a.event_date)
        const bTime = getEventTime(b.event_date)
        if (a.status === 'FINISHED' || a.status === 'LOCKED') return bTime - aTime
        return aTime - bTime
      })
      .slice(0, 4)
  }, [events])

  if (loading && events.length === 0) return <SnapshotSkeleton />

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          <InfoPill label={`${summary.live} live`} tone="success" />
          <InfoPill label={`${summary.upcoming} upcoming`} tone="accent" />
          <InfoPill label={`${summary.registrationOpen} reg open`} tone="info" />
        </div>
        <button type="button" onClick={() => void loadEvents()} disabled={loading} className="admin-outline-button w-fit">
          {loading ? 'Refreshing…' : 'Refresh Snapshot'}
        </button>
      </div>

      {error && (
        <div className="admin-alert-danger">
          {error}
        </div>
      )}

      {snapshotEvents.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {snapshotEvents.map((event) => {
            const statusMeta = STATUS_META[event.status]
            const eventScope = event.event_scope === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC'
            const isPublic = event.is_public !== false
            const registrationOpen = event.registration_open !== false

            return (
              <article key={event.id} className="admin-card grid gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <InfoPill label={statusMeta.label} tone={statusMeta.tone} />
                  <InfoPill
                    label={eventScope === 'INTERNAL' ? 'Internal' : 'Public'}
                    tone={eventScope === 'INTERNAL' ? 'danger' : 'info'}
                  />
                  <InfoPill
                    label={formatRelativeDate(event.event_date)}
                    tone="neutral"
                  />
                </div>

                <div className="grid gap-1">
                  <h3 className="admin-heading line-clamp-2 text-xl">{event.name}</h3>
                  <div className="admin-muted flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold">
                    <span>{event.location || 'Lokasi belum diisi'}</span>
                    <span>{formatDate(event.event_date)}</span>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="admin-card-muted px-4 py-3">
                    <div className="admin-kicker">Registrasi</div>
                    <div className={`mt-1 text-sm font-black ${registrationOpen ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {registrationOpen ? 'Masih dibuka' : 'Sudah ditutup'}
                    </div>
                  </div>
                  <div className="admin-card-muted px-4 py-3">
                    <div className="admin-kicker">Public View</div>
                    <div className={`mt-1 text-sm font-black ${isPublic ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {isPublic ? 'Tampil di publik' : 'Disembunyikan'}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/events/${event.id}/registrations`} className="admin-primary-button">
                    Registrations
                  </Link>
                  {!isRegistrationApprover && (
                    <Link href={`/admin/events/${event.id}/motos`} className="admin-outline-button">
                      Motos
                    </Link>
                  )}
                  <Link href={`/event/${event.id}`} className="admin-outline-button">
                    Public Page
                  </Link>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="admin-card-muted py-8 text-center">
          <div className="admin-heading text-lg">Belum ada event yang bisa ditampilkan.</div>
          <p className="admin-muted mt-2 text-sm font-semibold">Buka Event Workspace untuk membuat atau mengecek akses event.</p>
        </div>
      )}

      {events.length > snapshotEvents.length && (
        <div className="admin-card-muted flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="admin-heading text-sm">{events.length - snapshotEvents.length} event lain tidak ditampilkan di snapshot.</div>
            <div className="admin-muted mt-1 text-xs font-semibold">Dashboard hanya menampilkan event prioritas agar tetap ringan.</div>
          </div>
          <Link href="/admin/events" className="admin-outline-button w-fit">
            Lihat Semua Event
          </Link>
        </div>
      )}
    </div>
  )
}
