import type { Metadata } from 'next'
import Link from 'next/link'
import EventCard from '../../components/EventCard'
import MarketingTopbar from '../../components/MarketingTopbar'
import { adminClient } from '../../lib/auth'
import type { EventItem } from '../../lib/eventService'
import { toPublicMediaUrl } from '../../lib/publicMedia'
import { SITE_URL } from '../../lib/structuredData'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Live Score Race Pushbike Indonesia',
  description: 'Lihat event pushbike yang sedang berlangsung dan buka live score-nya.',
  alternates: { canonical: `${SITE_URL}/live-results` },
  openGraph: {
    title: 'Live Score Race Pushbike Indonesia',
    description: 'Lihat event pushbike yang sedang berlangsung dan buka live score-nya.',
    url: `${SITE_URL}/live-results`,
    siteName: 'RacePushbike',
    locale: 'id_ID',
    type: 'website',
    images: [{ url: `${SITE_URL}/og-racepushbike.png`, width: 1200, height: 630, alt: 'RacePushbike Indonesia' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Live Score Race Pushbike Indonesia',
    description: 'Lihat event pushbike yang sedang berlangsung dan buka live score-nya.',
    images: ['/og-racepushbike.png'],
  },
}

type LiveEventSettings = {
  logo: string | null
  slogan: string | null
  event_scope: 'PUBLIC' | 'INTERNAL'
}

export default async function LiveResultsPage() {
  const { data } = await adminClient
    .from('events')
    .select('id, name, location, event_date, status, is_public')
    .eq('is_public', true)
    .eq('status', 'LIVE')
    .order('event_date', { ascending: false })

  const events = (data ?? []) as EventItem[]
  const settingsByEvent = new Map<string, LiveEventSettings>()

  if (events.length > 0) {
    const { data: settings } = await adminClient
      .from('event_settings')
      .select('event_id, event_logo_url, display_theme, race_format_settings')
      .in('event_id', events.map((event) => event.id))

    for (const row of settings ?? []) {
      const theme = (row.display_theme ?? {}) as Record<string, unknown>
      const format = (row.race_format_settings ?? {}) as Record<string, unknown>
      settingsByEvent.set(row.event_id, {
        logo: toPublicMediaUrl(row.event_logo_url),
        slogan: typeof theme.slogan === 'string' ? theme.slogan : null,
        event_scope: format.event_scope === 'INTERNAL' ? 'INTERNAL' : 'PUBLIC',
      })
    }
  }

  return (
    <div className="public-page homepage-editorial-page dashboard-editorial-page">
      <MarketingTopbar variant="editorial" />
      <main className="dashboard-editorial-main">
        <header className="dashboard-editorial-heading">
          <h1>Live Score</h1>
        </header>

        <section className="dashboard-editorial-section dashboard-editorial-section-live">
          <div className="dashboard-editorial-section-head">
            <div>
              <h2>Event Sedang Live</h2>
            </div>
          </div>
          {events.length === 0 ? (
            <div className="dashboard-editorial-empty">
              <p>Belum ada event yang sedang live.</p>
              <Link href="/jadwal-race-pushbike">Lihat jadwal event</Link>
            </div>
          ) : (
            <div className="dashboard-editorial-grid">
              {events.map((event, index) => {
                const settings = settingsByEvent.get(event.id)
                return (
                  <EventCard
                    key={event.id}
                    event={{ ...event, event_scope: settings?.event_scope ?? 'PUBLIC' }}
                    index={index}
                    logoUrl={settings?.logo}
                    slogan={settings?.slogan}
                    variant="editorial"
                  />
                )
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
