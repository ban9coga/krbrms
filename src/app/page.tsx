import HeroRace from '../components/HeroRace'
import LivePreviewSection from '../components/LivePreviewSection'
import MarketingTopbar from '../components/MarketingTopbar'
import PerformanceStats from '../components/PerformanceStats'
import EventCard from '../components/EventCard'
import CoreFeatures from '../components/CoreFeatures'
import OrganizerCTA from '../components/OrganizerCTA'
import Link from 'next/link'
import { adminClient } from '../lib/auth'
import type { EventItem, EventStatus } from '../lib/eventService'

export const revalidate = 30

type LiveEventItem = {
  id: string
  name: string
  location?: string | null
}

const trustSignals = [
  {
    title: 'Live Operations',
    description: 'Pantau jalannya moto, hasil masuk, dan status race dalam satu alur yang mudah dibaca tim lapangan.',
  },
  {
    title: 'Role-Based Workflow',
    description: 'Admin, checker, finisher, race director, dan MC mendapat jalur kerja yang jelas sesuai tanggung jawabnya.',
  },
  {
    title: 'Public-Facing Results',
    description: 'Landing page, dashboard event, dan live score membantu penonton, rider, dan organizer melihat hasil dengan cepat.',
  },
]

const credibilityItems = [
  'Race dashboard untuk event publik dan internal',
  'Live score, result publishing, dan display mode',
  'Registrasi, rider data, penalty, dan approval flow',
]

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
        <section className="w-full bg-slate-100 px-2 py-4 sm:px-4 md:px-6 md:py-6">
          <div className="mx-auto grid w-full max-w-[1500px] gap-4 lg:grid-cols-[1.3fr_0.9fr]">
            <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-white/95 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.1)] sm:p-8">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" />
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div className="max-w-3xl">
                  <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-500">Built for Race Day</p>
                  <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                    Platform operasional yang terlihat profesional di depan penonton, dan tetap rapi di balik layar.
                  </h2>
                  <p className="mt-4 max-w-2xl text-sm font-medium leading-7 text-slate-600 sm:text-base">
                    Home ini sekarang diarahkan untuk memberi kesan sistem yang siap dipakai organizer: jelas manfaatnya,
                    terlihat aktif, dan langsung mengarahkan user ke event serta live result.
                  </p>
                </div>

                <div className="grid gap-3 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] sm:p-5">
                  <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-500">Why it feels reliable</span>
                  {credibilityItems.map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <span className="mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.45)]" />
                      <span className="font-semibold text-slate-700">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              {trustSignals.map((item, index) => (
                <article
                  key={item.title}
                  className="relative overflow-hidden rounded-[1.7rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)] transition-transform duration-300 hover:-translate-y-1 sm:p-6"
                >
                  <div className="absolute right-4 top-4 text-5xl font-black tracking-tight text-slate-200/80">
                    0{index + 1}
                  </div>
                  <div className="relative z-10 max-w-xs">
                    <h3 className="text-xl font-black tracking-tight text-slate-950">{item.title}</h3>
                    <p className="mt-3 text-sm font-medium leading-6 text-slate-600">{item.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
        <LivePreviewSection />
        <section className="w-full bg-slate-100 px-2 py-4 sm:px-4 md:px-6 md:py-10">
          <div className="mx-auto w-full max-w-[1500px]">
            <div className="relative overflow-hidden rounded-[2rem] bg-[radial-gradient(circle_at_top_left,#1f2937_0%,#0f172a_48%,#020617_100%)] px-5 py-10 shadow-[0_34px_90px_rgba(15,23,42,0.22)] sm:px-8 sm:py-12 md:rounded-[2.5rem] md:px-14">
              <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
              <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-300/10 blur-3xl" />

              <div className="relative z-10">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="grid gap-3">
                    <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-amber-300">Event Spotlight</p>
                    <h2 className="max-w-4xl text-3xl font-black tracking-tight text-white md:text-4xl">
                      Jelajahi event yang sedang live, event berikutnya, dan hasil kompetisi yang sudah selesai.
                    </h2>
                    <p className="max-w-3xl text-sm font-medium leading-7 text-slate-200 md:text-base">
                      Section ini sengaja dibuat seperti etalase utama produk: user bisa langsung melihat aktivitas event
                      terbaru tanpa merasa masuk ke halaman yang kaku atau kosong.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link
                      href="/dashboard"
                      className="inline-flex items-center justify-center rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-extrabold uppercase tracking-[0.14em] text-slate-950 transition-colors hover:bg-amber-300"
                    >
                      Lihat Semua Event
                    </Link>
                    <Link
                      href="/dashboard#live-results"
                      className="inline-flex items-center justify-center rounded-xl border border-slate-600 bg-slate-900/40 px-4 py-2.5 text-xs font-extrabold uppercase tracking-[0.14em] text-slate-100 transition-colors hover:border-slate-400 hover:bg-slate-900/55"
                    >
                      Buka Live Results
                    </Link>
                  </div>
                </div>

                <div className="mt-8 grid gap-4 md:grid-cols-3">
                  <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-200">Public Experience</p>
                    <p className="mt-3 text-sm font-medium leading-6 text-slate-200">
                      Penonton dan keluarga rider bisa cepat menemukan event dan melihat progres lomba yang sedang berjalan.
                    </p>
                  </div>
                  <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-200">Organizer View</p>
                    <p className="mt-3 text-sm font-medium leading-6 text-slate-200">
                      Organizer mendapat halaman depan yang lebih kredibel saat dipakai sebagai pintu masuk informasi event.
                    </p>
                  </div>
                  <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-200">Fast Navigation</p>
                    <p className="mt-3 text-sm font-medium leading-6 text-slate-200">
                      Dari home, user diarahkan mulus ke dashboard event, live score, dan detail event tanpa banyak klik.
                    </p>
                  </div>
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
        <CoreFeatures />
        <PerformanceStats />
        <OrganizerCTA />
      </main>

    </div>
  )
}

