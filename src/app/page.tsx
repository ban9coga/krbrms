import HeroRace from '../components/HeroRace'
import LivePreviewSection from '../components/LivePreviewSection'
import MarketingTopbar from '../components/MarketingTopbar'
import OrganizerCTA from '../components/OrganizerCTA'
import PerformanceStats from '../components/PerformanceStats'
import EventCard from '../components/EventCard'
import Link from 'next/link'
import { adminClient } from '../lib/auth'
import type { EventItem, EventStatus } from '../lib/eventService'

export const revalidate = 30

type LiveEventItem = {
  id: string
  name: string
  location?: string | null
}

const fetchLandingEvents = async (status: EventStatus, limit = 2): Promise<EventItem[]> => {
  let query = adminClient
    .from('events')
    .select('id, name, location, event_date, status, is_public')
    .eq('is_public', true)
    .eq('status', status)
    .limit(limit)

  if (status === 'UPCOMING') {
    query = query.order('event_date', { ascending: true })
  } else {
    query = query.order('event_date', { ascending: false })
  }

  const { data } = await query
  return (data ?? []) as EventItem[]
}

const loadEventSettings = async (eventIds: string[]) => {
  const settingsMap = new Map<
    string,
    { logo?: string | null; slogan?: string | null; event_scope?: 'PUBLIC' | 'INTERNAL' }
  >()
  if (eventIds.length === 0) return settingsMap

  const { data: settingsRows } = await adminClient
    .from('event_settings')
    .select('event_id, event_logo_url, display_theme, race_format_settings')
    .in('event_id', eventIds)

  for (const row of settingsRows ?? []) {
    const theme = (row.display_theme ?? {}) as Record<string, unknown>
    const raceFormat = (row.race_format_settings ?? {}) as Record<string, unknown>
    const slogan = typeof theme.slogan === 'string' ? theme.slogan : null
    const eventScope = raceFormat.event_scope === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC'
    settingsMap.set(row.event_id, { logo: row.event_logo_url ?? null, slogan, event_scope: eventScope })
  }

  return settingsMap
}

const getLiveEvent = async (): Promise<LiveEventItem | null> => {
  const { data, error } = await adminClient
    .from('events')
    .select('id, name, location, status, is_public, event_date')
    .eq('status', 'LIVE')
    .eq('is_public', true)
    .order('event_date', { ascending: false })
    .limit(1)

  if (error) {
    return null
  }

  const row = (data ?? [])[0]
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    location: row.location,
  }
}

export default async function LandingPage() {
  const liveEvent = await getLiveEvent()
  const [liveEventsRaw, upcomingEventsRaw, finishedEventsRaw] = await Promise.all([
    fetchLandingEvents('LIVE', 2),
    fetchLandingEvents('UPCOMING', 2),
    fetchLandingEvents('FINISHED', 2),
  ])
  const spotlightRaw = [...liveEventsRaw, ...upcomingEventsRaw, ...finishedEventsRaw]
  const spotlightIds = Array.from(new Set(spotlightRaw.map((e) => e.id)))
  const settingsMap = await loadEventSettings(spotlightIds)
  const spotlightEvents = spotlightRaw
    .filter((e, idx, arr) => arr.findIndex((x) => x.id === e.id) === idx)
    .map((event) => ({
      ...event,
      event_scope: settingsMap.get(event.id)?.event_scope ?? (event.is_public === false ? 'INTERNAL' : 'PUBLIC'),
    }))

  return (
    <div style={{ minHeight: '100vh', background: '#f6fbf7', color: '#111', paddingBottom: '84px' }}>
      <MarketingTopbar />

      <main>
        <HeroRace liveEvent={liveEvent} />
        <LivePreviewSection />
        <section className="w-full bg-slate-100 px-2 py-4 sm:px-4 md:px-6 md:py-10">
          <div className="mx-auto w-full max-w-[1500px]">
            <div className="relative overflow-hidden rounded-[2rem] bg-slate-950 px-5 py-10 shadow-[0_34px_90px_rgba(15,23,42,0.22)] sm:px-8 sm:py-12 md:rounded-[2.5rem] md:px-14">
              <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
              <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-amber-200/10 blur-3xl" />

              <div className="relative z-10">
                <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
                  <div className="grid gap-2">
                    <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-amber-300">Event Spotlight</p>
                    <h2 className="text-3xl font-black tracking-tight text-white md:text-4xl">Live, Upcoming, dan Hasil Terbaru</h2>
                    <p className="max-w-3xl text-sm font-medium text-slate-200 md:text-base">
                      Pantau event yang sedang berjalan, lihat jadwal yang akan datang, dan buka hasil race yang sudah selesai.
                    </p>
                  </div>

                  <Link
                    href="/dashboard"
                    className="inline-flex items-center justify-center rounded-xl border border-amber-300/40 bg-amber-400/10 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.14em] text-amber-100 transition-colors hover:border-amber-200/60 hover:bg-amber-400/20"
                  >
                    Lihat Semua Event
                  </Link>
                </div>

                <div className="mt-8">
                  {spotlightEvents.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-4 text-sm font-semibold text-slate-300">
                      Belum ada event yang tampil untuk publik.
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'grid',
                        gap: '16px',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                      }}
                    >
                      {spotlightEvents.map((event, idx) => (
                        <EventCard
                          key={event.id}
                          event={event}
                          index={idx}
                          logoUrl={settingsMap.get(event.id)?.logo ?? null}
                          slogan={settingsMap.get(event.id)?.slogan ?? null}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
        <PerformanceStats />
        <OrganizerCTA />
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800/80 bg-slate-950/95 text-slate-200 shadow-[0_-12px_32px_rgba(2,6,23,0.24)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-2 px-4 py-3 text-[11px] font-medium sm:px-6 md:flex-row md:items-center md:justify-between md:px-8 md:text-xs">
          <p className="text-slate-400">
            Copyright (c) {new Date().getFullYear()} Pushbike Race Management Platform
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-300">
            <a
              href="https://instagram.com/yogafernands"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 transition-colors hover:text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.3" cy="6.7" r="0.8" fill="currentColor" stroke="none" />
              </svg>
              <span>@yogafernands</span>
            </a>
            <a href="mailto:yogafernandes42@gmail.com" className="transition-colors hover:text-white">
              Contact: yogafernandes42@gmail.com
            </a>
            <span className="text-slate-400">
              Sistem by <span className="font-semibold text-slate-200">ferntechstudio.my.id</span>
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
