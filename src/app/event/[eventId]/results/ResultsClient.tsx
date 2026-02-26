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
import { isMotoFinished, isMotoLive, isMotoUpcoming } from '../../../../lib/motoStatus'

type CategoryStatus = 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'

const cardGradients = [
  'linear-gradient(140deg,#0f172a 0%,#1e293b 52%,#4f1d2f 100%)',
  'linear-gradient(140deg,#111827 0%,#1d4ed8 52%,#4c1d95 100%)',
  'linear-gradient(140deg,#0b1220 0%,#14532d 52%,#0f766e 100%)',
  'linear-gradient(140deg,#1f2937 0%,#334155 52%,#7f1d1d 100%)',
]

export default function ResultsClient({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventItem | null>(null)
  const [categories, setCategories] = useState<(RiderCategory & { status: CategoryStatus })[]>([])
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
            const hasLive = motos.some((m) => isMotoLive(m.status))
            const hasFinished = motos.some((m) => isMotoFinished(m.status))
            const hasUpcoming = motos.some((m) => isMotoUpcoming(m.status))
            const status: CategoryStatus = hasLive
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
    <div className="public-page">
      <PublicTopbar />
      <main className="public-main">
        <section className="public-hero">
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-rose-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
          <div className="relative z-10 grid gap-3">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-rose-300">Public Results</p>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">
              {event ? event.name : 'Event Results'}
            </h1>
            <p className="max-w-3xl text-sm font-semibold text-slate-200 sm:text-base">
              Pilih race category untuk melihat peringkat, live score, dan update hasil balap.
            </p>
          </div>
        </section>

        <section className="public-panel-light">
          <PageSection title="Race Categories">
            {loading && <LoadingState />}
            {!loading && categories.length === 0 && <EmptyState label="Belum ada race category untuk event ini." />}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {categories.map((category, idx) => (
                <div
                  key={category.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/event/${eventId}/live-score/${encodeURIComponent(category.id)}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      router.push(`/event/${eventId}/live-score/${encodeURIComponent(category.id)}`)
                    }
                  }}
                  className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_30px_rgba(15,23,42,0.1)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(15,23,42,0.14)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400"
                >
                  <div className="relative h-24 overflow-hidden">
                    <div className="absolute inset-0" style={{ backgroundImage: cardGradients[idx % cardGradients.length] }} />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
                      <div className="truncate text-lg font-black text-white">{category.label}</div>
                      <StatusBadge label={category.status} tone="dark" />
                    </div>
                  </div>

                  <div className="grid gap-3 p-4">
                    <div className="flex flex-wrap gap-2">
                      <span className="public-chip">{category.gender}</span>
                      <span className="public-chip">
                        {category.year_min ?? category.year} - {category.year_max ?? category.year}
                      </span>
                    </div>
                    <Link
                      href={`/event/${eventId}/live-score/${encodeURIComponent(category.id)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex w-fit items-center rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] text-emerald-700 transition-colors hover:bg-emerald-100"
                    >
                      View Live Score
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </PageSection>
        </section>
      </main>
    </div>
  )
}
