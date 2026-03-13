import EventCard from '../../components/EventCard'
import MarketingTopbar from '../../components/MarketingTopbar'
import type { EventItem, EventStatus } from '../../lib/eventService'
import { adminClient } from '../../lib/auth'

export const dynamic = 'force-dynamic'

const fetchEvents = async (status?: EventStatus): Promise<EventItem[]> => {
  let query = adminClient
    .from('events')
    .select('id, name, location, event_date, status, is_public')
    .eq('is_public', true)
    .order('event_date', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data } = await query
  return (data ?? []) as EventItem[]
}

export default async function DashboardPage() {
  const [upcomingEventsRaw, ongoingEventsRaw, finishedEventsRaw] = await Promise.all([
    fetchEvents('UPCOMING'),
    fetchEvents('LIVE'),
    fetchEvents('FINISHED'),
  ])
  const allEvents = [...upcomingEventsRaw, ...ongoingEventsRaw, ...finishedEventsRaw]
  const eventIds = allEvents.map((e) => e.id)
  const settingsMap = new Map<
    string,
    { logo?: string | null; slogan?: string | null; event_scope?: 'PUBLIC' | 'INTERNAL' }
  >()
  if (eventIds.length > 0) {
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
  }
  const upcomingEvents = upcomingEventsRaw.map((event) => ({
    ...event,
    event_scope: settingsMap.get(event.id)?.event_scope ?? (event.is_public === false ? 'INTERNAL' : 'PUBLIC'),
  }))
  const ongoingEvents = ongoingEventsRaw.map((event) => ({
    ...event,
    event_scope: settingsMap.get(event.id)?.event_scope ?? (event.is_public === false ? 'INTERNAL' : 'PUBLIC'),
  }))
  const finishedEvents = finishedEventsRaw.map((event) => ({
    ...event,
    event_scope: settingsMap.get(event.id)?.event_scope ?? (event.is_public === false ? 'INTERNAL' : 'PUBLIC'),
  }))

  return (
    <div style={{ minHeight: '100vh', background: '#f6fbf7', color: '#111' }}>
      <MarketingTopbar />

      <main className="w-full bg-slate-100 px-2 py-4 sm:px-4 md:px-6 md:py-8">
        <section className="mx-auto w-full max-w-[1500px]">
          <div className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(125deg,#090f1d_0%,#1e293b_42%,#78350f_100%)] px-5 py-10 shadow-[0_40px_120px_rgba(15,23,42,0.32)] sm:px-8 sm:py-12 md:rounded-[2.5rem] md:px-14 md:py-14">
            <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-amber-400/15 blur-3xl" />
            <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />

            <div className="relative z-10">
              <h1 className="text-center text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl">
                Event Dashboard
              </h1>
              <p className="mx-auto mt-3 max-w-3xl text-center text-sm text-slate-200 sm:text-base md:text-lg">
                Pantau event yang sedang berjalan, upcoming race, dan hasil kompetisi dalam satu tampilan.
              </p>

              <div className="mx-auto mt-8 grid max-w-[1120px] gap-6 sm:mt-10 md:gap-8">
                <div id="live-results" className="rounded-3xl border border-slate-700/70 bg-slate-900/55 p-4 backdrop-blur-sm sm:p-6">
                  <h2 className="mb-4 text-2xl font-bold text-white">Live Results</h2>
                  {ongoingEvents.length === 0 && (
                    <p className="pb-2 text-sm font-semibold text-slate-300">Belum ada event yang sedang berlangsung.</p>
                  )}
                  <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                    {ongoingEvents.map((event, idx) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        index={idx}
                        logoUrl={settingsMap.get(event.id)?.logo ?? null}
                        slogan={settingsMap.get(event.id)?.slogan ?? null}
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-700/70 bg-slate-900/55 p-4 backdrop-blur-sm sm:p-6">
                  <h2 className="mb-4 text-2xl font-bold text-white">Upcoming Events</h2>
                  {upcomingEvents.length === 0 && (
                    <p className="pb-2 text-sm font-semibold text-slate-300">Belum ada event yang akan datang.</p>
                  )}
                  <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                    {upcomingEvents.map((event, idx) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        index={idx}
                        logoUrl={settingsMap.get(event.id)?.logo ?? null}
                        slogan={settingsMap.get(event.id)?.slogan ?? null}
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-700/70 bg-slate-900/55 p-4 backdrop-blur-sm sm:p-6">
                  <h2 className="mb-4 text-2xl font-bold text-white">Finished Events</h2>
                  {finishedEvents.length === 0 && (
                    <p className="pb-2 text-sm font-semibold text-slate-300">Belum ada event yang selesai.</p>
                  )}
                  <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                    {finishedEvents.map((event, idx) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        index={idx}
                        logoUrl={settingsMap.get(event.id)?.logo ?? null}
                        slogan={settingsMap.get(event.id)?.slogan ?? null}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
