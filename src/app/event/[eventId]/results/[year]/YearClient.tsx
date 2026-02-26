'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import EmptyState from '../../../../../components/EmptyState'
import LoadingState from '../../../../../components/LoadingState'
import PublicTopbar from '../../../../../components/PublicTopbar'
import StatusBadge from '../../../../../components/StatusBadge'
import { getCategoriesByYear, getMotosByCategory, type RiderCategory, type MotoItem } from '../../../../../lib/eventService'
import { isMotoFinished, isMotoLive, isMotoUpcoming } from '../../../../../lib/motoStatus'

type CategoryStatus = 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'

const normalize = (value: string) => value.toLowerCase()

const statusOptions: Array<'ALL' | 'LIVE' | 'FINISHED'> = ['ALL', 'LIVE', 'FINISHED']

export default function YearClient({ eventId, year }: { eventId: string; year: string }) {
  const [categories, setCategories] = useState<(RiderCategory & { status: CategoryStatus })[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LIVE' | 'FINISHED'>('ALL')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const base = await getCategoriesByYear(eventId, year)
      const withStatus = await Promise.all(
        base.map(async (category) => {
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
      setCategories(withStatus)
      setLoading(false)
    }
    if (eventId) load()
  }, [eventId, year])

  const filtered = categories.filter((item) => {
    const matchesQuery = normalize(item.label).includes(normalize(query))
    const matchesStatus = statusFilter === 'ALL' || item.status === statusFilter
    return matchesQuery && matchesStatus
  })

  return (
    <div className="public-page">
      <PublicTopbar />
      <main className="public-main">
        <section className="public-hero">
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-rose-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
          <div className="relative z-10 grid gap-3">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-rose-300">Results Explorer</p>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">Race Categories {year}</h1>
            <p className="max-w-2xl text-sm font-semibold text-slate-200 sm:text-base">
              Filter category berdasarkan nama dan status race.
            </p>
          </div>
        </section>

        <section className="public-panel-light">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari race category..."
              className="public-filter"
            />
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-full border px-3 py-2 text-xs font-extrabold uppercase tracking-[0.12em] transition-colors sm:text-sm ${
                    statusFilter === status
                      ? 'border-rose-300 bg-rose-50 text-rose-600'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {loading && <LoadingState />}
            {!loading && filtered.length === 0 && <EmptyState label="Belum ada race category." />}
            {filtered.map((category) => (
              <Link
                key={category.id}
                href={`/event/${eventId}/live-score/${encodeURIComponent(category.id)}`}
                className="group rounded-2xl border border-slate-200 bg-white p-4 no-underline shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(15,23,42,0.12)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="grid gap-1">
                    <div className="text-lg font-black text-slate-900">{category.label}</div>
                    <div className="text-xs font-semibold text-slate-500">
                      Year {category.year_min ?? category.year} - {category.year_max ?? category.year}
                    </div>
                  </div>
                  <StatusBadge label={category.status} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
