'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { isRegistrationApproverRole } from '../../../lib/roles'

export type DashboardEventItem = {
  id: string
  name: string
  location: string | null
  event_date: string
  status: string
  is_public: boolean | null
  registration_open: boolean
}

type SnapshotTone = 'danger' | 'accent' | 'success' | 'info' | 'neutral'

const toneClass: Record<SnapshotTone, string> = {
  danger: 'admin-tone-danger',
  accent: 'admin-tone-accent',
  success: 'admin-tone-success',
  info: 'admin-tone-info',
  neutral: 'admin-tone-neutral',
}

const STATUS_META: Record<string, { label: string; tone: SnapshotTone; weight: number }> = {
  LIVE: { label: 'Live', tone: 'success', weight: 0 },
  PROVISIONAL: { label: 'Provisional', tone: 'info', weight: 1 },
  PROTEST_REVIEW: { label: 'Review protes', tone: 'danger', weight: 2 },
  UPCOMING: { label: 'Akan datang', tone: 'accent', weight: 3 },
  FINISHED: { label: 'Selesai', tone: 'neutral', weight: 4 },
  LOCKED: { label: 'Terkunci', tone: 'neutral', weight: 5 },
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(`${value}T00:00:00`)
  )

function InfoPill({ label, tone }: { label: string; tone: SnapshotTone }) {
  return <span className={`admin-tone-badge ${toneClass[tone]}`}>{label}</span>
}

export default function AdminEventSnapshot({
  events,
  role,
  scope,
  selectedEventId,
}: {
  events: DashboardEventItem[]
  role: string | null
  scope: 'ALL' | 'EVENT'
  selectedEventId: string | null
}) {
  const isRegistrationApprover = isRegistrationApproverRole(role)
  const relevantEvents = scope === 'ALL' ? events : events.filter((event) => event.id === selectedEventId)
  const snapshotEvents = useMemo(
    () =>
      [...relevantEvents]
        .sort((a, b) => {
          const aWeight = STATUS_META[a.status]?.weight ?? 9
          const bWeight = STATUS_META[b.status]?.weight ?? 9
          if (aWeight !== bWeight) return aWeight - bWeight
          const aDate = new Date(`${a.event_date}T00:00:00`).getTime()
          const bDate = new Date(`${b.event_date}T00:00:00`).getTime()
          if (a.status === 'FINISHED' || a.status === 'LOCKED') return bDate - aDate
          return aDate - bDate
        })
        .slice(0, 6),
    [relevantEvents]
  )

  return (
    <section className="admin-surface overflow-hidden px-5 py-5 lg:px-7" aria-labelledby="dashboard-priority-events">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="admin-kicker">Pintasan</div>
          <h2 id="dashboard-priority-events" className="admin-heading mt-1 text-xl">{scope === 'ALL' ? 'Event prioritas' : 'Event yang dipantau'}</h2>
        </div>
        <Link href="/admin/events" className="admin-outline-button">Semua event</Link>
      </div>

      {snapshotEvents.length > 0 ? (
        <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          {snapshotEvents.map((event) => {
            const statusMeta = STATUS_META[event.status] ?? { label: event.status, tone: 'neutral' as const, weight: 9 }
            return (
              <div key={event.id} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/events/${event.id}/registrations`} className="admin-heading truncate text-base hover:text-amber-700">
                      {event.name}
                    </Link>
                    <InfoPill label={statusMeta.label} tone={statusMeta.tone} />
                  </div>
                  <div className="admin-muted mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
                    <span>{formatDate(event.event_date)}</span>
                    {event.location && <span>{event.location}</span>}
                    <span>{event.registration_open ? 'Registrasi dibuka' : 'Registrasi ditutup'}</span>
                    {event.is_public === false && <span>Event tersembunyi</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/events/${event.id}/registrations`} className="admin-primary-button px-3 py-2 text-xs">Pendaftaran</Link>
                  {!isRegistrationApprover && <Link href={`/admin/events/${event.id}/motos`} className="admin-outline-button px-3 py-2 text-xs">Moto</Link>}
                  {!isRegistrationApprover && <Link href={`/admin/events/${event.id}/results`} className="admin-outline-button px-3 py-2 text-xs">Hasil</Link>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="admin-card-muted py-8 text-center">
          <div className="admin-heading text-lg">Belum ada event yang dapat ditampilkan.</div>
          <p className="admin-muted mt-2 text-sm font-semibold">Event yang dapat Anda kelola akan muncul di sini.</p>
        </div>
      )}
      {scope === 'ALL' && events.length > snapshotEvents.length && (
        <p className="admin-muted mt-3 text-xs font-semibold">Menampilkan {snapshotEvents.length} dari {events.length} event yang dapat diakses.</p>
      )}
    </section>
  )
}
