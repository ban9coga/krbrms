'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import StatusBadge from '../../../components/StatusBadge'
import LoadingState from '../../../components/LoadingState'
import EmptyState from '../../../components/EmptyState'
import PublicTopbar from '../../../components/PublicTopbar'
import SponsorMarquee from '../../../components/SponsorMarquee'
import { compareMotoDisplayOrder, formatMotoDisplayName } from '../../../lib/motoDisplayOrder'
import {
  getEventById,
  getEventCategories,
  getMotoResults,
  getRidersByEvent,
  type LeaderboardRow,
  type MotoItem,
  type EventItem,
  type RiderCategory,
} from '../../../lib/eventService'
import type { PublicFinishedEventArchive } from '../../../services/publicFinishedEventArchive'

const categoryCoverGradients = [
  'linear-gradient(140deg,#0f172a 0%,#1e293b 52%,#4f1d2f 100%)',
  'linear-gradient(140deg,#111827 0%,#1d4ed8 52%,#4c1d95 100%)',
  'linear-gradient(140deg,#0b1220 0%,#14532d 52%,#0f766e 100%)',
  'linear-gradient(140deg,#1f2937 0%,#334155 52%,#7f1d1d 100%)',
]

export default function EventDetailClient({
  eventId,
  initialEvent,
  initialArchive,
}: {
  eventId: string
  initialEvent: EventItem | null
  initialArchive?: PublicFinishedEventArchive | null
}) {
  const hideRegistrationAndVenueActions = eventId === '1d063c20-af89-4416-a578-cc06b824adc2'
  const [event, setEvent] = useState<EventItem | null>(initialEvent)
  const [categories, setCategories] = useState<RiderCategory[]>(initialArchive?.categories ?? [])
  const [liveMotos, setLiveMotos] = useState<MotoItem[]>([])
  const [liveResults, setLiveResults] = useState<Record<string, LeaderboardRow[]>>({})
  const [liveLoading, setLiveLoading] = useState<Record<string, boolean>>({})
  const [expandedMotoId, setExpandedMotoId] = useState<string>('')
  const [stageResults, setStageResults] = useState<
    Record<
      string,
      Array<{
        id: string
        stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'REPECHAGE' | 'SEMI_FINAL' | 'FINAL'
        final_class: string | null
        position: number | null
        riders: { name: string; no_plate_display: string } | null
      }>
    >
  >({})
  const [stageLoading, setStageLoading] = useState<Record<string, boolean>>({})
  const [riderTotal, setRiderTotal] = useState(initialArchive?.riderTotal ?? 0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(!initialEvent)
      if (initialArchive) {
        setEvent(initialArchive.event)
        setCategories(initialArchive.categories)
        setRiderTotal(initialArchive.riderTotal)
        setLiveMotos([])
        setLoading(false)
        return
      }
      if (initialEvent?.status === 'FINISHED') {
        try {
          const archiveResponse = await fetch(`/api/public/events/${eventId}/snapshot`)
          if (archiveResponse.ok) {
            const archive = await archiveResponse.json()
            const archiveData = archive.data ?? {}
            setCategories((archiveData.categories ?? []).filter((category: RiderCategory) => category.enabled))
            setRiderTotal(Number(archiveData.rider_total ?? 0))
            setLiveMotos([])
            setLoading(false)
            return
          }
        } catch {
          // Fall through to the existing live source while an older finished event has no archive yet.
        }
      }
      const [eventData, categoryData, riderData, motoRes] = await Promise.all([
        initialEvent ? Promise.resolve(initialEvent) : getEventById(eventId),
        getEventCategories(eventId),
        getRidersByEvent(eventId, 1, 1),
        fetch(`/api/motos?event_id=${eventId}`),
      ])
      setEvent(eventData)
      setCategories(categoryData.filter((c) => c.enabled))
      setRiderTotal(riderData.total)
      const motoJson = await motoRes.json()
      const motos = (motoJson.data ?? []) as MotoItem[]
      setLiveMotos(motos.filter((m) => m.status === 'LIVE'))
      setLoading(false)
    }
    if (eventId) load()
  }, [eventId, initialArchive, initialEvent])

  const totalFilledSlots = useMemo(
    () => categories.reduce((sum, category) => sum + Math.max(0, Number(category.filled ?? 0)), 0),
    [categories]
  )
  const upclassSlotCount = useMemo(
    () => Math.max(0, totalFilledSlots - riderTotal),
    [totalFilledSlots, riderTotal]
  )
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
  const hasDistinctPublicBrandName =
    Boolean(publicBrandName) && publicBrandName.trim().toLocaleLowerCase() !== publicEventTitle.trim().toLocaleLowerCase()
  const showEventOwner = Boolean(business?.show_event_owner_publicly && business?.event_owner_name?.trim())
  const showOperatingCommittee = Boolean(
    business?.show_operating_committee_publicly &&
      (business?.operating_committee_label?.trim() || business?.operating_committee_name?.trim())
  )
  const showScoringSupport = Boolean(
    business?.show_scoring_support_publicly &&
      (business?.scoring_support_label?.trim() || business?.scoring_support_name?.trim())
  )
  const showRaceDirector = Boolean(business?.show_race_director_publicly && business?.race_director_name?.trim())
  const showMc = Boolean(business?.show_mc_publicly && business?.mc_name?.trim())
  const eventOwnerName = business?.event_owner_name?.trim() || ''
  const operatingCommitteeLabel =
    business?.operating_committee_label?.trim() || business?.operating_committee_name?.trim() || ''
  const scoringSupportLabel =
    business?.scoring_support_label?.trim() || business?.scoring_support_name?.trim() || ''
  const raceDirectorName = business?.race_director_name?.trim() || ''
  const mcName = business?.mc_name?.trim() || ''
  const publicStaff = [
    showEventOwner ? { role: 'Event Owner', name: eventOwnerName, photoUrl: business?.event_owner_photo_url?.trim() || '' } : null,
    showOperatingCommittee
      ? { role: 'Operating Committee', name: operatingCommitteeLabel, photoUrl: business?.operating_committee_photo_url?.trim() || '' }
      : null,
    showScoringSupport ? { role: 'Scoring Support', name: scoringSupportLabel, photoUrl: business?.scoring_support_photo_url?.trim() || '' } : null,
    showRaceDirector ? { role: 'Race Director', name: raceDirectorName, photoUrl: business?.race_director_photo_url?.trim() || '' } : null,
    showMc ? { role: 'MC / Announcer', name: mcName, photoUrl: business?.mc_photo_url?.trim() || '' } : null,
  ].filter((staff): staff is { role: string; name: string; photoUrl: string } => staff !== null)
  const daysToEvent =
    eventDate ? Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null
  const registrationOpen = event?.registration_open !== false
  const canDownloadCertificate = Boolean(
    event?.status === 'FINISHED' &&
      business?.certificate_enabled &&
      business?.certificate_template_url &&
      (business?.certificate_participation_enabled !== false || business?.certificate_achievement_enabled)
  )
  const isCategoryFull = (category: RiderCategory) => {
    if (category.is_full === true) return true
    if (typeof category.capacity !== 'number') return false
    if (typeof category.remaining !== 'number') return false
    return category.remaining <= 0
  }
  const canRegister = useMemo(() => {
    if (!event || event.status !== 'UPCOMING' || !registrationOpen) return false
    const enabledCategories = categories.filter((category) => category.enabled)
    if (enabledCategories.length === 0) return true
    return enabledCategories.some((category) => !isCategoryFull(category))
  }, [categories, event, registrationOpen])

  const categoryLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) {
      map.set(c.id, c.label)
    }
    return map
  }, [categories])

  const liveMotosSorted = useMemo(() => {
    return [...liveMotos].sort(compareMotoDisplayOrder)
  }, [liveMotos])

  const categoryCards = useMemo(() => {
    const genderOrder = { BOY: 0, GIRL: 1, MIX: 2 } as const
    return [...categories].sort((a, b) => {
      const aSequence = typeof a.sequence_order === 'number' ? a.sequence_order : null
      const bSequence = typeof b.sequence_order === 'number' ? b.sequence_order : null
      if (aSequence !== null || bSequence !== null) {
        return (aSequence ?? Number.MAX_SAFE_INTEGER) - (bSequence ?? Number.MAX_SAFE_INTEGER)
      }
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
    <div className="public-page public-editorial-page public-editorial-detail bg-[#f5ecd7] text-[#1d0d07]">
      <PublicTopbar />
      <main className="mx-auto w-full max-w-[1500px] px-2 py-4 sm:px-4 md:px-6 md:py-8">
        {loading && <LoadingState label="Memuat detail event..." />}
        {!loading && !event && <EmptyState label="Event tidak ditemukan." />}

        {event && (
          <div className="grid gap-6">
            <section className="public-editorial-event-hero relative overflow-hidden rounded-[2rem] border border-[#4f372b] bg-[#1d0d07] px-5 py-8 shadow-[0_30px_70px_rgba(55,23,9,0.22)] sm:px-8 md:rounded-[2.5rem] md:px-12 md:py-10">
              <div className="relative z-10 grid gap-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="grid gap-2">
                    {hasDistinctPublicBrandName && (
                      <p className="text-sm font-extrabold uppercase text-[#eadcca]">
                        {publicBrandName}
                      </p>
                    )}
                    <h1 className="text-3xl font-black leading-tight text-[#fff8e8] md:text-5xl">
                      {publicEventTitle}
                    </h1>
                    {publicTagline && (
                      <p className="max-w-3xl text-sm font-semibold text-[#c9b7a5] md:text-base">{publicTagline}</p>
                    )}
                    <div className="flex flex-wrap gap-3 text-sm font-semibold text-[#eadcca] md:text-base">
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
                    {publicStaff.length > 0 && (
                      <div className="grid max-w-6xl gap-2 pt-1">
                        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#c9b7a5]">Panitia & Official</p>
                        <div className="flex flex-wrap gap-2 xl:flex-nowrap">
                          {publicStaff.map((staff) => (
                            <div key={staff.role} className="flex min-w-[220px] flex-1 items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-3 py-2">
                              {staff.photoUrl ? (
                                <Image
                                  src={staff.photoUrl}
                                  alt={`Foto ${staff.name}`}
                                  width={52}
                                  height={52}
                                  sizes="52px"
                                  className="h-[52px] w-[52px] shrink-0 rounded-full border border-[#f3c63d]/60 object-cover"
                                />
                              ) : (
                                <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full border border-[#f3c63d]/60 bg-[#2a160d] text-sm font-black text-[#f3c63d]">
                                  {staff.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '-'}
                                </span>
                              )}
                              <span className="grid min-w-0 gap-0.5">
                                <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#c9b7a5]">{staff.role}</span>
                                <span className="truncate text-sm font-extrabold text-[#fff8e8]">{staff.name}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="grid justify-items-end gap-2">
                    <StatusBadge
                      label={
                        event.status === 'LIVE'
                          ? 'Ongoing Event'
                          : event.status === 'FINISHED'
                          ? 'Completed Event'
                          : 'Coming Soon'
                      }
                    />
                    {event.status === 'UPCOMING' && daysToEvent !== null && (
                      <div className="rounded-full border border-[#705547] bg-[#2a160d] px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.1em] text-[#f3c63d]">
                        {Math.max(daysToEvent, 0)} hari lagi
                      </div>
                    )}
                    {event.status !== 'UPCOMING' && (
                      <div className="inline-flex items-center gap-2 rounded-full border border-[#705547] bg-[#2a160d] px-3 py-1.5 text-xs font-bold text-[#eadcca]">
                        <span className="uppercase tracking-[0.1em] text-[#c9b7a5]">Riders</span>
                        <span className="text-base font-black text-[#fff8e8]">{totalFilledSlots}</span>
                        {upclassSlotCount > 0 && <span className="text-[10px] text-[#c9b7a5]">{riderTotal} + {upclassSlotCount} upclass</span>}
                      </div>
                    )}
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
                  {event.status === 'UPCOMING' && !hideRegistrationAndVenueActions && canRegister && (
                    <Link
                      href={`/event/${event.id}/register`}
                      className="public-editorial-register-cta inline-flex min-h-[54px] items-center rounded-full bg-[#f3c63d] px-8 py-3 text-sm font-black uppercase text-[#1d0d07] shadow-[0_12px_28px_rgba(243,198,61,0.24)] transition-transform hover:-translate-y-0.5 hover:bg-[#ffda5a]"
                    >
                      Daftar Sekarang
                    </Link>
                  )}
                  {canDownloadCertificate && (
                    <Link
                      href={`/event/${event.id}/certificate`}
                      className="inline-flex min-h-[54px] items-center rounded-full border border-[#f3c63d]/70 bg-[#2a160d] px-7 py-3 text-sm font-black uppercase text-[#f3c63d] transition-colors hover:bg-[#3e2113]"
                    >
                      Unduh E-Sertifikat
                    </Link>
                  )}
                </div>

                {event.status === 'UPCOMING' && !hideRegistrationAndVenueActions && !canRegister && (
                  <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-4 text-sm font-semibold text-amber-100">
                    {registrationOpen
                      ? 'Pendaftaran event ini telah ditutup karena semua slot kategori sudah penuh.'
                      : 'Pendaftaran event telah ditutup.'}
                  </div>
                )}

              </div>
            </section>

            <section
              id="race-categories"
              className="rounded-[1.5rem] border border-[#4f372b] bg-[#1d0d07] px-4 py-5 text-[#fff8e8] shadow-[0_20px_40px_rgba(55,23,9,0.18)] sm:px-6"
            >
              <div className="mb-4 grid gap-1">
                <h2 className="text-2xl font-black tracking-tight text-white">Race Categories</h2>
                {event.status === 'UPCOMING' && (
                  <p className="text-sm font-semibold text-[#c9b7a5]">Pilih kategori yang sesuai dengan tahun kelahiran rider.</p>
                )}
              </div>

              {event.status === 'UPCOMING' ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {categoryCards.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-600 bg-slate-950/40 p-4 text-sm font-semibold text-slate-300">
                      Belum ada kategori yang dibuka.
                    </div>
                  ) : categoryCards.map((category) => (
                    <article key={category.id} className="rounded-xl border border-[#705547] bg-[#2a160d] px-4 py-3">
                      <h3 className="text-base font-black uppercase text-[#fff8e8]">{category.label}</h3>
                    </article>
                  ))}
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
                              className="inline-flex items-center justify-center rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-extrabold uppercase tracking-[0.12em] text-white transition-colors hover:bg-emerald-600"
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
                          REPECHAGE: stageRows.filter((r) => r.stage === 'REPECHAGE'),
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
                                  {m.moto_order}. {formatMotoDisplayName(m.moto_name)}
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
                                    {(['QUARTER_FINAL', 'REPECHAGE', 'SEMI_FINAL', 'FINAL'] as const).map((stage) => {
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

          </div>
        )}
      </main>
    </div>
  )
}
