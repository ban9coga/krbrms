'use client'

import Link from 'next/link'
import type { EventItem } from '../lib/eventService'
import { buildGoogleMapsUrl, buildQrCodeUrl } from '../lib/publicLinks'

const statusConfig: Record<EventItem['status'], { label: string; className: string }> = {
  LIVE: { label: 'Live', className: 'bg-emerald-500/90 text-white ring-emerald-300/40' },
  UPCOMING: { label: 'Upcoming', className: 'bg-amber-500/90 text-white ring-amber-300/40' },
  FINISHED: { label: 'Completed', className: 'bg-slate-800/90 text-white ring-slate-400/30' },
}

const fallbackCovers = [
  'linear-gradient(140deg,#0f172a 0%,#1e293b 52%,#4f1d2f 100%)',
  'linear-gradient(140deg,#111827 0%,#1d4ed8 52%,#4c1d95 100%)',
  'linear-gradient(140deg,#0b1220 0%,#14532d 52%,#0f766e 100%)',
  'linear-gradient(140deg,#1f2937 0%,#334155 52%,#7f1d1d 100%)',
]

export default function EventCard({
  event,
  index = 0,
  logoUrl,
  slogan,
  canRegister = true,
}: {
  event: EventItem
  index?: number
  logoUrl?: string | null
  slogan?: string | null
  canRegister?: boolean
}) {
  const status = statusConfig[event.status]
  const fallback = fallbackCovers[index % fallbackCovers.length]
  const coverStyle = logoUrl
    ? {
        backgroundImage: `linear-gradient(135deg,rgba(2,6,23,0.08),rgba(2,6,23,0.58)),url(${logoUrl})`,
      }
    : { backgroundImage: fallback }

  const dayLabel = new Date(event.event_date).toLocaleDateString('id-ID', { weekday: 'short' }).toUpperCase()
  const dateLabel = new Date(event.event_date).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const eventScope = event.event_scope === 'INTERNAL' ? 'INTERNAL' : event.is_public === false ? 'INTERNAL' : 'PUBLIC'
  const detailHref = `/event/${event.id}`
  const registerHref = `/event/${event.id}/register`
  const mapsUrl = buildGoogleMapsUrl(event.name, event.location)
  const mapsQrUrl = mapsUrl ? buildQrCodeUrl(mapsUrl, 140) : null
  const showRegisterButton = event.status === 'UPCOMING' && canRegister
  const upcomingStateLabel = canRegister ? 'Registration Open' : 'Kuota Penuh'

  return (
    <article className="group relative overflow-hidden rounded-[1.8rem] border border-slate-200 bg-white/95 shadow-[0_16px_34px_rgba(15,23,42,0.12)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_44px_rgba(15,23,42,0.2)]">
      <Link href={detailHref} className="block text-slate-900 no-underline" aria-label={`Open event ${event.name}`}>
        <div className="relative h-56 overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
            style={coverStyle}
          />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_85%_at_80%_10%,rgba(251,191,36,0.18),rgba(2,6,23,0)_55%)]" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/10 to-transparent" />
          <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full border border-white/20" />

          <span className={`absolute left-4 top-4 inline-flex rounded-full px-3 py-1 text-[11px] font-black tracking-[0.08em] ring-1 ${status.className}`}>
            {status.label}
          </span>

          <div className="absolute right-4 top-4 rounded-xl bg-black/35 px-2 py-1.5 text-[10px] font-bold tracking-wide text-white backdrop-blur-sm text-right leading-tight">
            <div>{dayLabel}</div>
            <div>{dateLabel.toUpperCase()}</div>
          </div>

          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              {slogan ? <p className="truncate text-sm font-semibold text-white/95">{slogan}</p> : null}
              <p className="truncate text-xs font-medium text-white/75">{event.location || 'Location TBD'}</p>
            </div>
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/35 bg-white/15 text-white transition-colors group-hover:bg-white/25">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </div>
        </div>

        <div className="grid gap-4 px-6 pt-6">
          <h3 className="text-[1.85rem] font-black leading-[1.04] tracking-tight text-slate-900">{event.name}</h3>
          <div className="h-px bg-slate-200" />
        </div>
      </Link>

      <div className="flex flex-col gap-3 p-6 pt-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500 w-fit">
            {eventScope === 'INTERNAL' ? 'Internal Event' : 'Public Event'}
          </span>
          <span className="inline-flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.12em] text-amber-500">
            {event.status === 'UPCOMING' ? upcomingStateLabel : event.status === 'LIVE' ? 'View Event' : 'View Results'}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <path d="M8 5h11v11M8 16L19 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          {showRegisterButton && (
            <Link
              href={registerHref}
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-amber-400 px-4 py-3 text-sm font-extrabold uppercase tracking-[0.12em] text-white transition-colors hover:bg-amber-300"
            >
              Daftar Sekarang
            </Link>
          )}
          <Link
            href={detailHref}
            className={`inline-flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-extrabold uppercase tracking-[0.12em] transition-colors ${
              showRegisterButton
                ? 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                : 'w-full border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {event.status === 'LIVE' ? 'Lihat Event' : event.status === 'FINISHED' ? 'Lihat Hasil' : 'Lihat Detail'}
          </Link>
        </div>

        {event.status === 'UPCOMING' && !canRegister && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            Pendaftaran event ini ditutup karena semua slot kategori sudah penuh.
          </div>
        )}

        {mapsUrl && mapsQrUrl && (
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[74px_1fr] sm:items-center">
            <img
              src={mapsQrUrl}
              alt={`QR Google Maps ${event.name}`}
              className="h-[74px] w-[74px] rounded-xl border border-slate-200 bg-white object-cover"
              loading="lazy"
            />
            <div className="grid gap-2">
              <div className="grid gap-1">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Scan Lokasi</p>
                <p className="text-xs font-semibold text-slate-600">
                  Scan QR atau buka Google Maps untuk menuju venue event.
                </p>
              </div>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-700 transition-colors hover:bg-slate-100"
              >
                Buka GMaps
              </a>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}
