'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import EmptyState from '../../../../components/EmptyState'
import LoadingState from '../../../../components/LoadingState'
import PageSection from '../../../../components/PageSection'
import PublicTopbar from '../../../../components/PublicTopbar'
import StatusBadge from '../../../../components/StatusBadge'
import {
  getEventById,
  getEventCategories,
  getMotosByCategory,
  type EventItem,
  type RiderCategory,
  type MotoItem,
} from '../../../../lib/eventService'

export default function ResultsClient({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventItem | null>(null)
  const [categories, setCategories] = useState<
    (RiderCategory & { status: 'UPCOMING' | 'LIVE' | 'FINISHED' })[]
  >([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const eventData = await getEventById(eventId)
      const base = await getEventCategories(eventId)
      const withStatus = await Promise.all(
        base
          .filter((c) => c.enabled)
          .map(async (category) => {
            const motos: MotoItem[] = await getMotosByCategory(category.id)
            const hasLive = motos.some((m) => m.status === 'LIVE')
            const hasFinished = motos.some((m) => m.status === 'FINISHED')
            const hasUpcoming = motos.some((m) => m.status === 'UPCOMING')
            const status: 'UPCOMING' | 'LIVE' | 'FINISHED' = hasLive
              ? 'LIVE'
              : hasFinished && hasUpcoming
              ? 'LIVE'
              : hasFinished
              ? 'FINISHED'
              : 'UPCOMING'
            return { ...category, status }
          })
      )
      const genderOrder = { BOY: 0, GIRL: 1, MIX: 2 } as const
      const statusOrder = { LIVE: 0, UPCOMING: 1, FINISHED: 2 } as const
      withStatus.sort((a, b) => {
        const sa = statusOrder[a.status] ?? 9
        const sb = statusOrder[b.status] ?? 9
        if (sa !== sb) return sa - sb
        if (b.year !== a.year) return b.year - a.year
        const ag = genderOrder[a.gender] ?? 9
        const bg = genderOrder[b.gender] ?? 9
        if (ag !== bg) return ag - bg
        return a.label.localeCompare(b.label)
      })
      setEvent(eventData)
      setCategories(withStatus)
      setLoading(false)
    }
    if (eventId) load()
  }, [eventId])

  return (
    <div style={{ minHeight: '100vh', background: '#eaf7ee', color: '#111' }}>
      <PublicTopbar />
      <div style={{ maxWidth: '840px', margin: '0 auto', padding: '24px 20px 48px' }}>
        <div style={{ fontWeight: 800, marginBottom: 12 }}>{event ? event.name : 'Event Results'}</div>
        <PageSection title="Race Categories">
          {loading && <LoadingState />}
          {!loading && categories.length === 0 && <EmptyState label="Belum ada race category untuk event ini." />}
          <div style={{ display: 'grid', gap: '12px' }}>
            {categories.map((category) => (
              <div
                key={category.id}
                role="button"
                tabIndex={0}
                onClick={() =>
                  router.push(`/event/${eventId}/results/${category.year}/${encodeURIComponent(category.id)}`)
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    router.push(`/event/${eventId}/results/${category.year}/${encodeURIComponent(category.id)}`)
                  }
                }}
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  border: '2px solid #111',
                  background: '#fff',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'grid', gap: 6 }}>
                  <div>{category.label}</div>
                  <Link
                    href={`/event/${eventId}/live-score/${encodeURIComponent(category.id)}`}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      display: 'inline-block',
                      padding: '6px 10px',
                      borderRadius: 999,
                      border: '2px solid #111',
                      background: '#bfead2',
                      color: '#111',
                      fontWeight: 900,
                      textDecoration: 'none',
                      width: 'fit-content',
                    }}
                  >
                    View Live Score
                  </Link>
                </div>
                <StatusBadge label={category.status} />
              </div>
            ))}
          </div>
        </PageSection>
      </div>
    </div>
  )
}

