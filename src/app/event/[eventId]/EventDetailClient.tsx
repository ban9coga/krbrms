'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import StatusBadge from '../../../components/StatusBadge'
import LoadingState from '../../../components/LoadingState'
import EmptyState from '../../../components/EmptyState'
import PublicTopbar from '../../../components/PublicTopbar'
import SponsorMarquee from '../../../components/SponsorMarquee'
import { compareMotoSequence } from '../../../lib/motoSequence'
import { buildGoogleMapsUrl, buildQrCodeUrl } from '../../../lib/publicLinks'
import {
  getEventById,
  getEventCategories,
  getMotoResults,
  getRidersByEvent,
  type LeaderboardRow,
  type MotoItem,
  type EventItem,
  type RiderCategory,
  type RiderPublicItem,
} from '../../../lib/eventService'

const categoryCoverGradients = [
  'linear-gradient(140deg,#0f172a 0%,#1e293b 52%,#4f1d2f 100%)',
  'linear-gradient(140deg,#111827 0%,#1d4ed8 52%,#4c1d95 100%)',
  'linear-gradient(140deg,#0b1220 0%,#14532d 52%,#0f766e 100%)',
  'linear-gradient(140deg,#1f2937 0%,#334155 52%,#7f1d1d 100%)',
]

export default function EventDetailClient({ eventId }: { eventId: string }) {
  const hideRegistrationAndVenueActions = eventId === '1d063c20-af89-4416-a578-cc06b824adc2'
  const [event, setEvent] = useState<EventItem | null>(null)
  const [categories, setCategories] = useState<RiderCategory[]>([])
  const [liveMotos, setLiveMotos] = useState<MotoItem[]>([])
  const [liveResults, setLiveResults] = useState<Record<string, LeaderboardRow[]>>({})
  const [liveLoading, setLiveLoading] = useState<Record<string, boolean>>({})
  const [expandedMotoId, setExpandedMotoId] = useState<string>('')
  const [stageResults, setStageResults] = useState<
    Record<
      string,
      Array<{
        id: string
        stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'FINAL'
        final_class: string | null
        position: number | null
        riders: { name: string; no_plate_display: string } | null
      }>
    >
  >({})
  const [stageLoading, setStageLoading] = useState<Record<string, boolean>>({})
  const [riders, setRiders] = useState<RiderPublicItem[]>([])
  const [riderPage, setRiderPage] = useState(1)
  const riderPageSize = 24
  const [riderTotal, setRiderTotal] = useState(0)
  const [showRiders, setShowRiders] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [eventData, categoryData, riderData, motoRes] = await Promise.all([
        getEventById(eventId),
        getEventCategories(eventId),
        getRidersByEvent(eventId, 1, riderPageSize),
        fetch(`/api/motos?event_id=${eventId}`),
      ])
      setEvent(eventData)
      setCategories(categoryData.filter((c) => c.enabled))
      setRiders(riderData.data)
      setRiderTotal(riderData.total)
      setRiderPage(1)
      const motoJson = await motoRes.json()
      const motos = (motoJson.data ?? []) as MotoItem[]
      setLiveMotos(motos.filter((m) => m.status === 'LIVE'))
      setLoading(false)
    }
    if (eventId) load()
  }, [eventId])

  const loadMore = async () => {
    if (loadingMore) return
    const nextPage = riderPage + 1
    setLoadingMore(true)
    try {
      const data = await getRidersByEvent(eventId, nextPage, riderPageSize)
      setRiders((prev) => [...prev, ...data.data])
      setRiderTotal(data.total)
      setRiderPage(nextPage)
    } finally {
      setLoadingMore(false)
    }
  }

  const canLoadMore = riders.length < riderTotal
  const eventDate = event ? new Date(event.event_date) : null
  const formattedDate = eventDate
    ? eventDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
    : null
  const eventLogoUrl = event?.event_logo_url ?? null
  const sponsorLogoUrls = event?.sponsor_logo_urls ?? []
  const business = event?.business_settings ?? null
  const publicEventTitle = business?.public_event_title?.trim() || event?.name || 'Event Detail'
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
  const daysToEvent =
    eventDate ? Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
  const mapsUrl = event ? buildGoogleMapsUrl(event.name, event.location) : null
  const mapsQrUrl = mapsUrl ? buildQrCodeUrl(mapsUrl, 220) : null

  const categoryLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) {
      map.set(c.id, c.label)
    }
    return map
  }, [categories])

  const liveMotosSorted = useMemo(() => {
    const yearMinMap = new Map<string, number>()
    const yearMaxMap = new Map<string, number>()
    const genderMap = new Map<string, RiderCategory['gender']>()
    for (const c of categories) {
      const minYear = typeof c.year_min === 'number' ? c.year_min : c.year
      const maxYear = typeof c.year_max === 'number' ? c.year_max : c.year
      yearMinMap.set(c.id, minYear)
      yearMaxMap.set(c.id, maxYear)
      genderMap.set(c.id, c.gender)
    }
    const genderOrder = { BOY: 0, GIRL: 1, MIX: 2 } as const
    return [...liveMotos].sort((a, b) => {
      const ayMax = yearMaxMap.get(a.category_id) ?? 0
      const byMax = yearMaxMap.get(b.category_id) ?? 0
      if (byMax !== ayMax) return byMax - ayMax
      const ayMin = yearMinMap.get(a.category_id) ?? ayMax
      const byMin = yearMinMap.get(b.category_id) ?? byMax
      if (byMin !== ayMin) return byMin - ayMin
      const ag = genderOrder[genderMap.get(a.category_id) ?? 'MIX'] ?? 9
      const bg = genderOrder[genderMap.get(b.category_id) ?? 'MIX'] ?? 9
      if (ag !== bg) return ag - bg
      return compareMotoSequence(a, b)
    })
  }, [liveMotos, categories])

  const categoryCards = useMemo(() => {
    const genderOrder = { BOY: 0, GIRL: 1, MIX: 2 } as const
    return [...categories].sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year
      return genderOrder[a.gender] - genderOrder[b.gender]
    })
  }, [categories])

  const toggleLiveResults = async (motoId: string, categoryId: string) => {
    if (event?.status !== 'LIVE') return
    if (expandedMotoId === motoId) {
      setExpandedMotoId('')
      return
    }
    setExpandedMotoId(motoId)
    if (liveResults[motoId]) return
    setLiveLoading((prev) => ({ ...prev, [motoId]: true }))
    try {
      const data = await getMotoResults(motoId)
      setLiveResults((prev) => ({ ...prev, [motoId]: data }))
      if (!stageResults[categoryId]) {
        setStageLoading((prev) => ({ ...prev, [categoryId]: true }))
        const res = await fetch(
          `/api/public/events/${eventId}/advanced-race/results?category_id=${categoryId}`
        )
        const json = await res.json()
        setStageResults((prev) => ({ ...prev, [categoryId]: json.data ?? [] }))
        setStageLoading((prev) => ({ ...prev, [categoryId]: false }))
      }
    } finally {
      setLiveLoading((prev) => ({ ...prev, [motoId]: false }))
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <PublicTopbar />
      <div className="mx-auto w-full max-w-[1500px] px-2 py-4 sm:px-4 md:px-6 md:py-8">
        {loading && <LoadingState label="Memuat detail event..." />}
        {!loading && !event && <EmptyState label="Event tidak ditemukan." />}

        {event && (
          <div className="grid gap-6">
            <section className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(125deg,#090f1d_0%,#1e293b_42%,#78350f_100%)] px-5 py-8 shadow-[0_34px_90px_rgba(15,23,42,0.3)] sm:px-8 md:rounded-[2.5rem] md:px-12 md:py-10">
              <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-amber-400/15 blur-3xl" />
              <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
              <div className="relative z-10 grid gap-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="grid gap-2">
                    <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-amber-300">Event Detail</p>
                    {publicBrandName && (
                      <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-amber-100/90">
                        {publicBrandName}
                      </p>
                    )}
                    <h1 className="text-3xl font-black leading-tight tracking-tight text-white md:text-5xl">
                      {publicEventTitle}
                    </h1>
                    {publicTagline && (
                      <p className="max-w-3xl text-sm font-semibold text-slate-200 md:text-base">{publicTagline}</p>
                    )}
                    <div className="flex flex-wrap gap-3 text-sm font-semibold text-slate-200 md:text-base">
                      <span className="inline-flex items-center gap-2">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 text-amber-300">
                          <path d="M12 20s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" strokeLinecap="round" />
                          <circle cx="12" cy="10" r="2.3" />
                        </svg>
                        {event.location || '-'}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 text-amber-300">
                          <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
                          <path d="M7.5 3.5v4M16.5 3.5v4M3.5 10h17" strokeLinecap="round" />
                        </svg>
                        {formattedDate ?? '-'}
                      </span>
                    </div>
                    {(showEventOwner || showOperatingCommittee || showScoringSupport) && (
                      <div className="flex flex-wrap gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-slate-100">
                        {showEventOwner && (
                          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1">
                            Event Owner: {eventOwnerName}
                          </span>
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
                  <StatusBadge
                    label={
                      event.status === 'LIVE'
                        ? 'Ongoing Event'
                        : event.status === 'FINISHED'
                        ? 'Completed Event'
                        : 'Coming Soon'
                    }
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (event.status === 'UPCOMING') return
                      setShowRiders((v) => !v)
                    }}
                    disabled={event.status === 'UPCOMING'}
                    className={`rounded-2xl border p-4 text-left transition-colors ${
                      event.status === 'UPCOMING'
                        ? 'cursor-not-allowed border-slate-600 bg-slate-900/35 text-slate-400'
                        : 'border-slate-500 bg-slate-900/50 text-white hover:border-amber-300/60'
                    }`}
                  >
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-300">Total Riders</p>
                    <p className="mt-2 text-3xl font-black">{event.status === 'UPCOMING' ? '-' : riderTotal}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-300">
                      {event.status === 'UPCOMING' ? 'Terkunci sampai LIVE' : showRiders ? 'Sembunyikan' : 'Klik untuk lihat'}
                    </p>
                  </button>

                  <div className="rounded-2xl border border-slate-500 bg-slate-900/50 p-4 text-white">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-300">Total Categories</p>
                    <p className="mt-2 text-3xl font-black">{categories.length}</p>
                  </div>

                  <div className="rounded-2xl border border-slate-500 bg-slate-900/50 p-4 text-white">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-300">Countdown</p>
                    <p className="mt-2 text-2xl font-black">
                      {event.status === 'UPCOMING' && daysToEvent !== null
                        ? `${Math.max(daysToEvent, 0)} hari lagi`
                        : event.status === 'LIVE'
                        ? 'Sedang berlangsung'
                        : 'Selesai'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {event.status === 'LIVE' && (
                    <Link
                      href={`/event/${event.id}/display`}
                      className="inline-flex items-center rounded-xl border border-emerald-300/60 bg-emerald-500/20 px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-emerald-100 transition-colors hover:bg-emerald-500/35"
                    >
                      Live Board
                    </Link>
                  )}
                  {event.status === 'UPCOMING' && !hideRegistrationAndVenueActions && (
                    <Link
                      href={`/event/${event.id}/register`}
                      className="inline-flex items-center rounded-xl bg-amber-400 px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-amber-300"
                    >
                      Register Rider
                    </Link>
                  )}
                </div>

                {!hideRegistrationAndVenueActions && mapsUrl && mapsQrUrl && (
                  <div className="grid gap-4 rounded-[1.7rem] border border-white/10 bg-slate-950/30 p-4 backdrop-blur-sm md:grid-cols-[140px_1fr] md:items-center">
                    <img
                      src={mapsQrUrl}
                      alt={`QR Google Maps ${event.name}`}
                      className="h-[140px] w-[140px] rounded-2xl border border-white/15 bg-white p-2 object-contain"
                    />
                    <div className="grid gap-3">
                      <div className="grid gap-1">
                        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-300">Venue Navigation</p>
                        <h2 className="text-xl font-black tracking-tight text-white md:text-2xl">Scan QR atau buka Google Maps untuk langsung ke lokasi event.</h2>
                        <p className="max-w-2xl text-sm font-semibold leading-6 text-slate-200">
                          Cocok untuk pengunjung yang buka detail event dari laptop, layar panitia, atau ingin membagikan lokasi venue dengan cepat.
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center rounded-xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-white/20"
                        >
                          Buka Google Maps
                        </a>
                        <span className="inline-flex items-center rounded-xl border border-white/10 bg-slate-900/35 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-200">
                          Scan QR untuk rute cepat
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <SponsorMarquee
              businessSettings={business}
              sponsorLogoUrls={sponsorLogoUrls}
              placement="event_page"
              title={business?.sponsor_section_title?.trim() || 'Official Sponsors'}
              subtitle={
                business?.sponsor_section_subtitle?.trim() ||
                'Partner dan sponsor yang ikut mendukung event ini.'
              }
            />

            <section
              id="race-categories"
              className="rounded-[1.5rem] border border-slate-800 bg-slate-900 px-4 py-5 text-slate-100 shadow-[0_20px_40px_rgba(2,6,23,0.2)] sm:px-6"
            >
              <div className="mb-4 flex items-center gap-2">
                <h2 className="text-2xl font-black tracking-tight text-white">Race Categories</h2>
                {event.status === 'UPCOMING' && <StatusBadge label="Locked" />}
              </div>

              {event.status === 'UPCOMING' ? (
                <div className="rounded-2xl border border-dashed border-slate-600 bg-slate-950/40 p-4 text-sm font-semibold text-slate-300">
                  Live results akan muncul saat event LIVE.
                </div>
              ) : (
                <div className="grid gap-5">
                  {categoryCards.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-600 bg-slate-950/40 p-4 text-sm font-semibold text-slate-300">
                      Belum ada category untuk live results.
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {categoryCards.map((category, idx) => (
                        <article
                          key={category.id}
                          className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/70 shadow-[0_12px_30px_rgba(2,6,23,0.25)]"
                        >
                          <div className="relative h-28 overflow-hidden">
                            <div
                              className="absolute inset-0"
                              style={
                                eventLogoUrl
                                  ? {
                                      backgroundImage: `linear-gradient(140deg,rgba(2,6,23,0.72) 0%,rgba(15,23,42,0.52) 45%,rgba(76,29,149,0.42) 100%), url(${eventLogoUrl})`,
                                      backgroundSize: 'cover',
                                      backgroundPosition: 'center',
                                    }
                                  : { backgroundImage: categoryCoverGradients[idx % categoryCoverGradients.length] }
                              }
                            />
                            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
                            <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full border border-white/20" />
                            <div className="absolute left-3 top-3 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white backdrop-blur-sm">
                              Category
                            </div>
                            <div className="absolute bottom-3 left-3 right-3 text-xl font-black uppercase leading-tight text-white">
                              {category.label}
                            </div>
                          </div>
                          <div className="grid gap-3 p-3">
                            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{category.label}</p>
                            <Link
                              href={`/event/${eventId}/live-score/${encodeURIComponent(category.id)}`}
                              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-white transition-colors hover:bg-emerald-500"
                            >
                              {event.status === 'FINISHED' ? 'View Results' : 'View Live Results'}
                            </Link>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}

                  {event.status === 'LIVE' && (liveMotosSorted.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-600 bg-slate-950/40 p-4 text-sm font-semibold text-slate-300">
                      Belum ada moto yang LIVE.
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-slate-400">Live Moto Feed</p>
                      {liveMotosSorted.map((m) => {
                        const results = liveResults[m.id] ?? []
                        const isOpen = expandedMotoId === m.id
                        const isLoading = liveLoading[m.id]
                        const topRows = results.slice(0, 5)
                        const stageRows = stageResults[m.category_id] ?? []
                        const stageLoadingFlag = stageLoading[m.category_id]
                        const stageGroups = {
                          QUARTER_FINAL: stageRows.filter((r) => r.stage === 'QUARTER_FINAL'),
                          SEMI_FINAL: stageRows.filter((r) => r.stage === 'SEMI_FINAL'),
                          FINAL: stageRows.filter((r) => r.stage === 'FINAL'),
                        }

                        return (
                          <div key={m.id} className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/70">
                            <button
                              type="button"
                              onClick={() => toggleLiveResults(m.id, m.category_id)}
                              className="flex w-full items-center justify-between gap-3 p-4 text-left transition-colors hover:bg-slate-900/70"
                            >
                              <div className="grid gap-1">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                  {categoryLabel.get(m.category_id) ?? 'Unknown Category'}
                                </p>
                                <p className="text-base font-black text-white">
                                  {m.moto_order}. {m.moto_name}
                                </p>
                              </div>
                              <span className="text-xs font-extrabold uppercase tracking-wide text-amber-300">
                                {isOpen ? 'Hide results' : 'View results'}
                              </span>
                            </button>

                            {isOpen && (
                              <div className="grid gap-3 border-t border-slate-700/80 p-4">
                                {isLoading ? (
                                  <div className="text-sm font-semibold text-slate-300">Loading results...</div>
                                ) : topRows.length === 0 ? (
                                  <div className="text-sm font-semibold text-slate-300">Belum ada hasil.</div>
                                ) : (
                                  topRows.map((row) => (
                                    <div
                                      key={`${m.id}-${row.position}-${row.bike_number}`}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm font-semibold text-slate-100"
                                    >
                                      <div>
                                        #{row.position} {row.rider_name}
                                      </div>
                                      <div>
                                        {row.bike_number} | {row.total_point == null ? '-' : `${row.total_point} pts`}
                                      </div>
                                    </div>
                                  ))
                                )}

                                <Link
                                  href={`/event/${eventId}#race-categories`}
                                  className="inline-flex w-fit items-center rounded-lg border border-slate-500 px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-slate-800"
                                >
                                  Kembali ke race categories
                                </Link>

                                <div className="mt-1 text-sm font-extrabold uppercase tracking-wide text-slate-300">
                                  Qualification to Next Stages
                                </div>

                                {stageLoadingFlag ? (
                                  <div className="text-sm font-semibold text-slate-300">Loading stage results...</div>
                                ) : stageRows.length === 0 ? (
                                  <div className="text-sm font-semibold text-slate-300">Belum ada hasil stage.</div>
                                ) : (
                                  <div className="grid gap-2">
                                    {(['QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'] as const).map((stage) => {
                                      const rows = stageGroups[stage]
                                      if (!rows || rows.length === 0) return null
                                      return (
                                        <div
                                          key={stage}
                                          className="grid gap-2 rounded-xl border border-slate-700 bg-slate-900/60 p-3"
                                        >
                                          <div className="text-xs font-extrabold uppercase tracking-wide text-amber-300">
                                            {stage}
                                          </div>
                                          {rows.slice(0, 8).map((r) => (
                                            <div
                                              key={r.id}
                                              className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-slate-100"
                                            >
                                              <div>
                                                {r.riders?.no_plate_display ?? '-'} {r.riders?.name ?? '-'}
                                              </div>
                                              <div>{r.final_class ? r.final_class : r.position ? `Rank ${r.position}` : '-'}</div>
                                            </div>
                                          ))}
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {event.status === 'UPCOMING' ? (
              <section className="rounded-[1.5rem] border border-slate-300 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.1)] sm:p-6">
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="text-2xl font-black tracking-tight text-slate-900">Riders</h2>
                  <StatusBadge label="Locked" />
                </div>
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                  Daftar rider akan muncul saat event LIVE.
                </div>
              </section>
            ) : showRiders ? (
              <section className="rounded-[1.5rem] border border-slate-300 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.1)] sm:p-6">
                <div className="mb-4 flex items-end justify-between gap-3">
                  <h2 className="text-2xl font-black tracking-tight text-slate-900">Riders</h2>
                  <div className="text-sm font-bold text-slate-600">Total: {riderTotal}</div>
                </div>

                {riders.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                    Belum ada rider terdaftar.
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {riders.map((rider) => (
                    <div key={rider.id} className="grid grid-cols-[64px_1fr] items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                      <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl border border-slate-300 bg-white text-xs font-black text-slate-700">
                        {rider.photo_thumbnail_url ? (
                          <img
                            src={rider.photo_thumbnail_url}
                            alt={rider.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            loading="lazy"
                          />
                        ) : (
                          rider.no_plate_display
                        )}
                      </div>
                      <div className="grid gap-1">
                        <div className="text-sm font-black text-slate-900">{rider.no_plate_display}</div>
                        <div className="text-sm font-semibold text-slate-800">{rider.name}</div>
                        <div className="text-xs font-semibold text-slate-500">
                          {rider.gender} - {rider.date_of_birth}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {canLoadMore && (
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="mt-4 inline-flex items-center rounded-xl bg-amber-400 px-4 py-2 text-sm font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:bg-amber-200"
                  >
                    {loadingMore ? 'Loading...' : 'Load More'}
                  </button>
                )}
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}


