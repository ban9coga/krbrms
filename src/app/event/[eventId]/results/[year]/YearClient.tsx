'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import EmptyState from '../../../../../components/EmptyState'
import LoadingState from '../../../../../components/LoadingState'
import PublicTopbar from '../../../../../components/PublicTopbar'
import StatusBadge from '../../../../../components/StatusBadge'
import {
  getCategoriesByYear,
  getEventById,
  getMotosByCategory,
  type EventItem,
  type RiderCategory,
  type MotoItem,
} from '../../../../../lib/eventService'
import { isMotoFinished, isMotoLive, isMotoUpcoming } from '../../../../../lib/motoStatus'

type CategoryStatus = 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'

const normalize = (value: string) => value.toLowerCase()

const statusOptions: Array<'ALL' | 'LIVE' | 'FINISHED'> = ['ALL', 'LIVE', 'FINISHED']

export default function YearClient({ eventId, year }: { eventId: string; year: string }) {
  const [event, setEvent] = useState<EventItem | null>(null)
  const [categories, setCategories] = useState<(RiderCategory & { status: CategoryStatus })[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LIVE' | 'FINISHED'>('ALL')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [eventData, base] = await Promise.all([getEventById(eventId), getCategoriesByYear(eventId, year)])
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
      setEvent(eventData)
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
  const business = event?.business_settings ?? null
  const publicEventTitle = business?.public_event_title?.trim() || event?.name || `Race Categories ${year}`
  const publicBrandName = business?.public_brand_name?.trim() || ''
  const publicTagline = business?.public_tagline?.trim() || ''
  const showEventOwner = Boolean(business?.show_event_owner_publicly && business?.event_owner_name?.trim())
  const showOperatingCommittee = Boolean(
    business?.show_operating_committee_publicly &&
      (business?.operating_committee_label?.trim() || business?.operating_committee_name?.trim())
  )
  const showScoringSupport = Boolean(
    business?.show_scoring_support_publicly &&
      (business?.scoring_support_label?.trim() || business?.scoring_support_name?.trim())
  )
  const eventOwnerName = business?.event_owner_name?.trim() || ''
  const operatingCommitteeLabel =
    business?.operating_committee_label?.trim() || business?.operating_committee_name?.trim() || ''
  const scoringSupportLabel =
    business?.scoring_support_label?.trim() || business?.scoring_support_name?.trim() || ''

  return (
    <div className="public-page">
      <PublicTopbar />
      <main className="public-main">
        <section className="public-hero">
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-amber-400/15 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
          <div className="relative z-10 grid gap-3">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-300">Results Explorer</p>
            {publicBrandName && (
              <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-amber-100/90">{publicBrandName}</p>
            )}
            <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">{publicEventTitle}</h1>
            <p className="max-w-2xl text-sm font-semibold text-slate-200 sm:text-base">
              {publicTagline || `Filter race category ${year} berdasarkan nama dan status race.`}
            </p>
            {(showEventOwner || showOperatingCommittee || showScoringSupport) && (
              <div className="flex flex-wrap gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-100">
                {showEventOwner && (
                  <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">Event Owner: {eventOwnerName}</span>
                )}
                {showOperatingCommittee && (
                  <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
                    Operating Committee: {operatingCommitteeLabel}
                  </span>
                )}
                {showScoringSupport && (
                  <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
                    Scoring Support: {scoringSupportLabel}
                  </span>
                )}
              </div>
            )}
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
                      ? 'border-amber-300 bg-amber-50 text-amber-600'
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
                      Year {category.year_min ?? category.year} - {category.year_max ?? category.year} • View & share results
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
