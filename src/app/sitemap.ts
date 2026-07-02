import { MetadataRoute } from 'next'
import { adminClient } from '../lib/auth'
import { SITE_URL } from '../lib/structuredData'

type SitemapEntry = MetadataRoute.Sitemap[number]
type SitemapChangeFrequency = NonNullable<SitemapEntry['changeFrequency']>

type PublicEventSitemapRow = {
  id: string
  status: string | null
  event_date: string | null
  created_at: string | null
  updated_at: string | null
}

const getEventChangeFrequency = (status: string | null): SitemapChangeFrequency => {
  if (status === 'LIVE') return 'hourly'
  if (status === 'UPCOMING') return 'daily'
  return 'monthly'
}

const getEventPriority = (status: string | null) => {
  if (status === 'LIVE') return 0.95
  if (status === 'UPCOMING') return 0.9
  return 0.65
}

const getLastModified = (event: PublicEventSitemapRow) => {
  const dateValue = event.updated_at || event.created_at || event.event_date
  return dateValue ? new Date(dateValue) : new Date()
}

const loadPublicEventRoutes = async (): Promise<SitemapEntry[]> => {
  try {
    const { data, error } = await adminClient
      .from('events')
      .select('id, status, event_date, created_at, updated_at')
      .eq('is_public', true)
      .order('event_date', { ascending: false })

    if (error) return []

    const events = (data ?? []) as PublicEventSitemapRow[]
    const eventPages = events.map((event) => ({
      url: `${SITE_URL}/event/${event.id}`,
      lastModified: getLastModified(event),
      changeFrequency: getEventChangeFrequency(event.status),
      priority: getEventPriority(event.status),
    }))

    const resultPages = events
      .filter((event) => event.status === 'LIVE' || event.status === 'FINISHED')
      .map((event) => ({
        url: `${SITE_URL}/event/${event.id}/results`,
        lastModified: getLastModified(event),
        changeFrequency: getEventChangeFrequency(event.status),
        priority: event.status === 'LIVE' ? 0.9 : 0.75,
      }))

    return [...eventPages, ...resultPages]
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: SitemapEntry[] = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE_URL}/dashboard`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/jadwal-race-pushbike`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.95,
    },
    {
      url: `${SITE_URL}/live-results`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.85,
    },
    {
      url: `${SITE_URL}/registration-status`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ]

  const eventRoutes = await loadPublicEventRoutes()
  return [...staticRoutes, ...eventRoutes]
}
