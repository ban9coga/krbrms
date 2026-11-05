'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { formatMotoDisplayName } from '@/src/lib/motoDisplayOrder'
import { useApiFetch } from '@/src/hooks/useApiFetch'
import { useEventRaceRealtime } from '@/src/hooks/useEventRaceRealtime'
import { usePageVisibility } from '@/src/lib/usePageVisibility'

type EventItem = {
  id: string
  name: string
  status: 'UPCOMING' | 'LIVE' | 'FINISHED'
  event_date?: string | null
  location?: string | null
}

type CategoryItem = {
  id: string
  label: string
  enabled: boolean
  sequence_order?: number | null
  year_min?: number | null
  year_max?: number | null
  gender: 'BOY' | 'GIRL' | 'MIX'
}

type MotoGateRider = {
  gate_position: number
  rider_id: string
  name?: string
  no_plate_display?: string
  club?: string | null
}

type MotoItem = {
  id: string
  category_id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'READY' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
  is_published?: boolean | null
  checker_prep_ready_at?: string | null
  provisional_at?: string | null
  gates?: MotoGateRider[]
}

const STATUS_BADGE_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  LIVE: { bg: 'bg-rose-500/15', text: 'text-rose-600 dark:text-rose-400', border: 'border-rose-500/40', label: 'LIVE' },
  READY: { bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-500/40', label: 'READY' },
  UPCOMING: { bg: 'bg-sky-500/15', text: 'text-sky-700 dark:text-sky-400', border: 'border-sky-500/40', label: 'UPCOMING' },
  PROVISIONAL: { bg: 'bg-amber-500/15', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-500/40', label: 'PROVISIONAL' },
  PROTEST_REVIEW: { bg: 'bg-purple-500/15', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-500/40', label: 'PROTEST' },
  LOCKED: { bg: 'bg-slate-500/15', text: 'text-slate-600 dark:text-slate-400', border: 'border-slate-500/40', label: 'LOCKED' },
  FINISHED: { bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-500/40', label: 'FINISHED' },
}

export default function RaceDayClient({ eventId }: { eventId: string }) {
  const isPageVisible = usePageVisibility()
  const apiFetch = useApiFetch()

  const [eventData, setEventData] = useState<EventItem | null>(null)
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [motos, setMotos] = useState<MotoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [actionBusyId, setActionBusyId] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date())

  // Filter & Search
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'PROVISIONAL' | 'LOCKED'>('ACTIVE')
  const [searchQuery, setSearchQuery] = useState('')

  // Toast / Status Message
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ type, message })
    setTimeout(() => {
      setFeedback((prev) => (prev?.message === message ? null : prev))
    }, 4000)
  }, [])

  // Load all race day data
  const loadData = useCallback(async () => {
    if (!eventId) return
    try {
      const [eventRes, catRes, gateRes, motoRes] = await Promise.all([
        apiFetch(`/api/events/${eventId}`),
        apiFetch(`/api/events/${eventId}/categories`),
        apiFetch(`/api/events/${eventId}/gate-order`),
        apiFetch(`/api/motos?event_id=${eventId}`),
      ])

      const eventJson = await eventRes.json().catch(() => ({}))
      const catJson = await catRes.json().catch(() => ({}))
      const gateJson = await gateRes.json().catch(() => ({}))
      const motoJson = await motoRes.json().catch(() => ({}))

      if (eventJson?.data) {
        setEventData(eventJson.data)
      }

      const enabledCats = ((catJson?.data ?? []) as CategoryItem[]).filter((c) => c.enabled)
      setCategories(enabledCats)

      // Collect moto rows and gate counts
      let finalMotos: MotoItem[] = []
      const gateData = gateJson?.data

      if (gateData && typeof gateData === 'object' && !Array.isArray(gateData)) {
        // Returned by-category map
        const allGateMotos = Object.values(gateData).flat() as MotoItem[]
        if (allGateMotos.length > 0) {
          finalMotos = allGateMotos
        }
      } else if (Array.isArray(gateData) && gateData.length > 0) {
        finalMotos = gateData as MotoItem[]
      }

      // If gate-order returned nothing, fallback to standard motos query
      if (finalMotos.length === 0 && Array.isArray(motoJson?.data)) {
        finalMotos = motoJson.data as MotoItem[]
      }

      // Sort by moto_order
      finalMotos.sort((a, b) => a.moto_order - b.moto_order)
      setMotos(finalMotos)
      setLastRefreshedAt(new Date())
    } catch (err: unknown) {
      console.error('Failed to load Race Day data:', err)
      showToast('Gagal memuat data Race Day.', 'error')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [apiFetch, eventId, showToast])

  // Initial load
  useEffect(() => {
    void loadData()
  }, [loadData])

  // Realtime hook
  useEventRaceRealtime({
    eventId,
    enabled: isPageVisible,
    onRaceStateChanged: () => {
      void loadData()
    },
  })

  // Category lookup
  const categoryMap = useMemo(() => {
    const map = new Map<string, CategoryItem>()
    for (const c of categories) {
      map.set(c.id, c)
    }
    return map
  }, [categories])

  // Active Moto Sequence (sorted by moto_order)
  const sortedMotos = useMemo(() => {
    return [...motos].sort((a, b) => a.moto_order - b.moto_order)
  }, [motos])

  // Current LIVE Moto
  const liveMoto = useMemo(() => {
    return sortedMotos.find((m) => m.status === 'LIVE') ?? null
  }, [sortedMotos])

  // Next Moto candidate (READY or UPCOMING that comes next in sequence)
  const nextMoto = useMemo(() => {
    if (sortedMotos.length === 0) return null
    const isCandidate = (m: MotoItem) => m.status === 'READY' || m.status === 'UPCOMING'
    if (liveMoto) {
      const liveIndex = sortedMotos.findIndex((m) => m.id === liveMoto.id)
      if (liveIndex >= 0) {
        const after = sortedMotos.slice(liveIndex + 1).find(isCandidate)
        if (after) return after
      }
    }
    return sortedMotos.find(isCandidate) ?? null
  }, [sortedMotos, liveMoto])

  // Filtered Motos for Table
  const filteredMotos = useMemo(() => {
    return sortedMotos.filter((moto) => {
      if (selectedCategory !== 'ALL' && moto.category_id !== selectedCategory) {
        return false
      }
      if (statusFilter === 'ACTIVE') {
        if (!['UPCOMING', 'READY', 'LIVE'].includes(moto.status)) return false
      } else if (statusFilter === 'PROVISIONAL') {
        if (!['PROVISIONAL', 'PROTEST_REVIEW'].includes(moto.status)) return false
      } else if (statusFilter === 'LOCKED') {
        if (moto.status !== 'LOCKED' && moto.status !== 'FINISHED') return false
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const catName = categoryMap.get(moto.category_id)?.label?.toLowerCase() ?? ''
        const mName = moto.moto_name.toLowerCase()
        if (!catName.includes(q) && !mName.includes(q)) return false
      }

      return true
    })
  }, [sortedMotos, selectedCategory, statusFilter, searchQuery, categoryMap])

  // Handlers
  const handleToggleEventStatus = async (targetStatus: 'UPCOMING' | 'LIVE' | 'FINISHED') => {
    if (!eventData || eventData.status === targetStatus) return
    const statusLabels: Record<string, string> = {
      LIVE: 'LIVE (Mulai Event)',
      UPCOMING: 'UPCOMING (Pause / Belum Mulai)',
      FINISHED: 'FINISHED (Event Selesai)',
    }

    const ok = confirm(`Ubah status Event menjadi ${statusLabels[targetStatus]}?`)
    if (!ok) return

    setActionBusyId('event_status')
    try {
      const res = await apiFetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: targetStatus }),
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || 'Gagal mengubah status event')
      }
      setEventData((prev) => (prev ? { ...prev, status: targetStatus } : null))
      showToast(`Status Event berhasil diubah menjadi ${targetStatus}!`)
      await loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengubah status event'
      alert(msg)
    } finally {
      setActionBusyId(null)
    }
  }

  const handleSetMotoLive = async (targetMoto: MotoItem) => {
    if (targetMoto.status === 'LIVE') return

    // Check if another moto is currently LIVE
    if (liveMoto && liveMoto.id !== targetMoto.id) {
      const ok = confirm(
        `Moto "${formatMotoDisplayName(liveMoto.moto_name)}" saat ini masih LIVE.\n\nSelesaikan moto tersebut (ubah jadi PROVISIONAL) dan jadikan "${formatMotoDisplayName(targetMoto.moto_name)}" LIVE?`
      )
      if (!ok) return

      setActionBusyId(targetMoto.id)
      try {
        // 1. Advance previous LIVE to PROVISIONAL
        await apiFetch(`/api/motos/${liveMoto.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'PROVISIONAL' }),
        })

        // 2. Set target moto to LIVE
        const res = await apiFetch(`/api/motos/${targetMoto.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'LIVE' }),
        })
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}))
          throw new Error(errJson.error || 'Gagal menjadikan moto LIVE')
        }

        showToast(`${formatMotoDisplayName(targetMoto.moto_name)} sekarang LIVE!`)
        await loadData()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Gagal mengaktifkan moto LIVE'
        alert(msg)
      } finally {
        setActionBusyId(null)
      }
      return
    }

    // No moto currently live
    const ok = confirm(`Jadikan ${formatMotoDisplayName(targetMoto.moto_name)} LIVE sekarang?`)
    if (!ok) return

    setActionBusyId(targetMoto.id)
    try {
      const res = await apiFetch(`/api/motos/${targetMoto.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'LIVE' }),
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || 'Gagal mengubah moto ke LIVE')
      }
      showToast(`${formatMotoDisplayName(targetMoto.moto_name)} sekarang LIVE!`)
      await loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengubah moto ke LIVE'
      alert(msg)
    } finally {
      setActionBusyId(null)
    }
  }

  const handleUpdateMotoStatus = async (
    moto: MotoItem,
    newStatus: 'UPCOMING' | 'READY' | 'PROVISIONAL'
  ) => {
    if (moto.status === newStatus) return
    const ok = confirm(
      `Ubah status "${formatMotoDisplayName(moto.moto_name)}" dari ${moto.status} menjadi ${newStatus}?`
    )
    if (!ok) return

    setActionBusyId(moto.id)
    try {
      const res = await apiFetch(`/api/motos/${moto.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || 'Gagal mengubah status moto')
      }
      showToast(`Status moto diubah menjadi ${newStatus}.`)
      await loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengubah status'
      alert(msg)
    } finally {
      setActionBusyId(null)
    }
  }

  const handleLockMoto = async (moto: MotoItem) => {
    const ok = confirm(
      `Kunci (Lock) hasil "${formatMotoDisplayName(moto.moto_name)}"?\n\nHasil akan dianggap final dan tahapan berikutnya (jika ada) akan dihitung otomatis.`
    )
    if (!ok) return

    setActionBusyId(moto.id)
    try {
      const res = await apiFetch(`/api/motos/${moto.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'LOCKED' }),
      })
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}))
        throw new Error(errJson.error || 'Gagal mengunci moto')
      }
      showToast(`Moto ${formatMotoDisplayName(moto.moto_name)} berhasil dikunci (LOCKED).`)
      await loadData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunci moto'
      alert(msg)
    } finally {
      setActionBusyId(null)
    }
  }

  const handleMoveSequence = async (motoId: string, direction: -1 | 1) => {
    const activeMotos = [...sortedMotos]
    const currentIndex = activeMotos.findIndex((m) => m.id === motoId)
    const targetIndex = currentIndex + direction
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= activeMotos.length) return

    // Optimistic reorder
    const reordered = [...activeMotos]
    const [moved] = reordered.splice(currentIndex, 1)
    reordered.splice(targetIndex, 0, moved)

    const updated = reordered.map((m, idx) => ({ ...m, moto_order: idx + 1 }))
    const updateMap = new Map(updated.map((m) => [m.id, m]))

    setMotos((prev) => prev.map((m) => updateMap.get(m.id) ?? m))

    const changed = updated.filter((m) => {
      const original = sortedMotos.find((orig) => orig.id === m.id)
      return original && original.moto_order !== m.moto_order
    })

    try {
      await Promise.all(
        changed.map((m) =>
          apiFetch(`/api/motos/${m.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ moto_order: m.moto_order }),
          })
        )
      )
      showToast('Urutan moto berhasil diperbarui.')
    } catch (err) {
      console.error('Failed to save sequence:', err)
      showToast('Gagal menyimpan urutan baru.', 'error')
      await loadData()
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 pb-16">
      {/* Toast Notification */}
      {feedback && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-5 py-3.5 text-sm font-semibold shadow-2xl transition-all ${
            feedback.type === 'error'
              ? 'bg-rose-600 text-white'
              : 'bg-slate-900 text-emerald-400 border border-emerald-500/30'
          }`}
        >
          <span>{feedback.type === 'error' ? '⚠️' : '✓'}</span>
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Top Banner / Event Header Card */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2.5 py-1 text-xs font-black tracking-wide text-amber-600 dark:text-amber-400">
                ⚡ RACE DAY COMMAND CENTER
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                Live Sync
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              {eventData?.name ?? 'Memuat Event...'}
            </h1>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              {eventData?.location || 'Sirkuit Pushbike'} • {eventData?.event_date || 'Hari Ini'}
            </p>
          </div>

          {/* Event Status Controls */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5 dark:border-slate-800 dark:bg-slate-800/60">
              <button
                type="button"
                onClick={() => handleToggleEventStatus('UPCOMING')}
                disabled={actionBusyId === 'event_status' || eventData?.status === 'UPCOMING'}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  eventData?.status === 'UPCOMING'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                ⏸️ Upcoming
              </button>
              <button
                type="button"
                onClick={() => handleToggleEventStatus('LIVE')}
                disabled={actionBusyId === 'event_status' || eventData?.status === 'LIVE'}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-black transition-all ${
                  eventData?.status === 'LIVE'
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 animate-pulse'
                    : 'text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                🔴 LIVE EVENT
              </button>
              <button
                type="button"
                onClick={() => handleToggleEventStatus('FINISHED')}
                disabled={actionBusyId === 'event_status' || eventData?.status === 'FINISHED'}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  eventData?.status === 'FINISHED'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                🏁 Finished
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setRefreshing(true)
                void loadData()
              }}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              title={`Terakhir diperbarui: ${lastRefreshedAt.toLocaleTimeString()}`}
            >
              <svg
                className={`h-4 w-4 ${refreshing ? 'animate-spin text-amber-500' : 'text-slate-400'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Quick Launch Panel */}
        <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">
              Quick Launcher Petugas & Layar:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/jc"
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 transition hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300"
              >
                🚦 Jury Checker (JC Gate)
                <span className="text-[10px] opacity-60">↗</span>
              </Link>
              <Link
                href="/jury/finish"
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
              >
                🏁 Jury Finisher (JF)
                <span className="text-[10px] opacity-60">↗</span>
              </Link>
              <Link
                href={`/event/${eventId}/display`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300"
              >
                📺 TV Display Live
                <span className="text-[10px] opacity-60">↗</span>
              </Link>
              <Link
                href={`/event/${eventId}/live-score`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-bold text-purple-700 transition hover:bg-purple-100 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-300"
              >
                📱 Public Live Score
                <span className="text-[10px] opacity-60">↗</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Hero Widget: Race Action Hub (Active LIVE vs Next Moto) */}
      <div className="grid gap-5 md:grid-cols-2">
        {/* Card 1: Currently LIVE Moto */}
        <div
          className={`relative overflow-hidden rounded-2xl border p-6 transition-all ${
            liveMoto
              ? 'border-rose-400 bg-gradient-to-br from-rose-50/90 via-white to-rose-50/30 shadow-lg shadow-rose-500/10 dark:border-rose-800 dark:from-rose-950/30 dark:via-slate-900 dark:to-slate-900'
              : 'border-dashed border-slate-300 bg-slate-50/60 p-6 dark:border-slate-800 dark:bg-slate-900/40'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black tracking-wide uppercase ${
                liveMoto
                  ? 'bg-rose-500 text-white animate-pulse'
                  : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${liveMoto ? 'bg-white' : 'bg-slate-400'}`} />
              {liveMoto ? 'MOTO SEDANG LIVE' : 'TIDAK ADA MOTO LIVE'}
            </span>
            {liveMoto && (
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Urutan #{liveMoto.moto_order}
              </span>
            )}
          </div>

          {liveMoto ? (
            <div className="mt-4 space-y-4">
              <div>
                <span className="inline-block rounded-md bg-rose-100 px-2 py-0.5 text-xs font-black text-rose-800 dark:bg-rose-900/60 dark:text-rose-200">
                  {categoryMap.get(liveMoto.category_id)?.label ?? 'Kategori'}
                </span>
                <h3 className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
                  {formatMotoDisplayName(liveMoto.moto_name)}
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Gate: {liveMoto.gates?.length ?? 0} Pembalap terdaftar di starting gate
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => handleUpdateMotoStatus(liveMoto, 'PROVISIONAL')}
                  disabled={actionBusyId === liveMoto.id}
                  className="rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-black text-white shadow-md shadow-amber-500/20 transition hover:bg-amber-600 active:scale-95"
                >
                  🏁 Selesaikan Moto (Set PROVISIONAL)
                </button>
                <button
                  type="button"
                  onClick={() => handleUpdateMotoStatus(liveMoto, 'READY')}
                  disabled={actionBusyId === liveMoto.id}
                  className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  ↩️ Balik ke READY
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
              <p className="font-semibold">Sirkuit saat ini sedang kosong.</p>
              <p className="mt-1 text-xs">
                Pilih moto pada kolom berikutnya atau daftar di bawah untuk memulai balapan LIVE.
              </p>
            </div>
          )}
        </div>

        {/* Card 2: Next Moto in Queue */}
        <div
          className={`relative overflow-hidden rounded-2xl border p-6 transition-all ${
            nextMoto
              ? 'border-emerald-300 bg-gradient-to-br from-emerald-50/70 via-white to-emerald-50/20 shadow-lg shadow-emerald-500/10 dark:border-emerald-800 dark:from-emerald-950/20 dark:via-slate-900 dark:to-slate-900'
              : 'border-dashed border-slate-300 bg-slate-50/60 p-6 dark:border-slate-800 dark:bg-slate-900/40'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black tracking-wide uppercase ${
                nextMoto?.status === 'READY'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-sky-600 text-white'
              }`}
            >
              ⚡ BERIKUTNYA DALAM URUTAN
            </span>
            {nextMoto && (
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                Urutan #{nextMoto.moto_order}
              </span>
            )}
          </div>

          {nextMoto ? (
            <div className="mt-4 space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-block rounded-md bg-slate-200 px-2 py-0.5 text-xs font-black text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                    {categoryMap.get(nextMoto.category_id)?.label ?? 'Kategori'}
                  </span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-black ${
                      nextMoto.status === 'READY'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                        : 'bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200'
                    }`}
                  >
                    {nextMoto.status === 'READY' ? 'GATE READY ✓' : 'UPCOMING'}
                  </span>
                </div>
                <h3 className="mt-1.5 text-2xl font-black text-slate-900 dark:text-white">
                  {formatMotoDisplayName(nextMoto.moto_name)}
                </h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Gate: {nextMoto.gates?.length ?? 0} Pembalap terdaftar di starting gate
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => handleSetMotoLive(nextMoto)}
                  disabled={actionBusyId === nextMoto.id}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white shadow-md shadow-emerald-600/30 transition hover:bg-emerald-700 active:scale-95"
                >
                  <span>▶️</span>
                  <span>MULAI LIVE SEKARANG</span>
                </button>
                {nextMoto.status === 'UPCOMING' && (
                  <button
                    type="button"
                    onClick={() => handleUpdateMotoStatus(nextMoto, 'READY')}
                    disabled={actionBusyId === nextMoto.id}
                    className="rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                  >
                    Tandai READY
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
              <p className="font-semibold">Semua moto dalam antrean telah selesai atau belum dibuat.</p>
              <p className="mt-1 text-xs">Cek tab Provisional atau Locked untuk melihat hasil balapan.</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Table Section: Sequence & Quick Status Controller */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Table Filter & Header */}
        <div className="border-b border-slate-200 p-5 dark:border-slate-800">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                Urutan & Status Moto Race Day
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Atur urutan moto (▲/▼), aktifkan status LIVE, atau ubah status moto dengan 1 klik.
              </p>
            </div>

            {/* Status Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-800/60">
              <button
                type="button"
                onClick={() => setStatusFilter('ACTIVE')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  statusFilter === 'ACTIVE'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Aktif ({sortedMotos.filter((m) => ['UPCOMING', 'READY', 'LIVE'].includes(m.status)).length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('PROVISIONAL')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  statusFilter === 'PROVISIONAL'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Provisional ({sortedMotos.filter((m) => ['PROVISIONAL', 'PROTEST_REVIEW'].includes(m.status)).length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('LOCKED')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  statusFilter === 'LOCKED'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Locked / Selesai ({sortedMotos.filter((m) => m.status === 'LOCKED' || m.status === 'FINISHED').length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                Semua ({sortedMotos.length})
              </button>
            </div>
          </div>

          {/* Search & Category Filter */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari moto atau kategori..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 pl-9 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <svg
                className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            <div className="w-full sm:w-64">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="ALL">Semua Kategori ({categories.length})</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="p-12 text-center text-sm font-semibold text-slate-400">
            Memuat daftar moto...
          </div>
        ) : filteredMotos.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">
            Tidak ada moto yang cocok dengan filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-[11px] font-black uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <tr>
                  <th className="py-3 pl-5 pr-2 w-28">Urutan (#)</th>
                  <th className="px-3 py-3 w-40">Kategori</th>
                  <th className="px-3 py-3">Nama Moto</th>
                  <th className="px-3 py-3 w-28">Riders</th>
                  <th className="px-3 py-3 w-32">Status</th>
                  <th className="py-3 pl-3 pr-5 text-right">Aksi Cepat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredMotos.map((moto, index) => {
                  const badgeStyle = STATUS_BADGE_STYLES[moto.status] ?? STATUS_BADGE_STYLES.UPCOMING
                  const isBusy = actionBusyId === moto.id
                  const isFirst = index === 0
                  const isLast = index === filteredMotos.length - 1

                  return (
                    <tr
                      key={moto.id}
                      className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                        moto.status === 'LIVE' ? 'bg-rose-500/5 font-semibold' : ''
                      }`}
                    >
                      {/* Urutan & Move Up/Down */}
                      <td className="py-3.5 pl-5 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 w-6">
                            {moto.moto_order}
                          </span>
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleMoveSequence(moto.id, -1)}
                              disabled={isFirst || moto.status === 'LOCKED'}
                              title="Pindahkan ke atas"
                              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-20 dark:hover:bg-slate-700 dark:hover:text-white"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveSequence(moto.id, 1)}
                              disabled={isLast || moto.status === 'LOCKED'}
                              title="Pindahkan ke bawah"
                              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-800 disabled:opacity-20 dark:hover:bg-slate-700 dark:hover:text-white"
                            >
                              ▼
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Kategori */}
                      <td className="px-3 py-3.5">
                        <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {categoryMap.get(moto.category_id)?.label ?? 'Kategori'}
                        </span>
                      </td>

                      {/* Moto Name */}
                      <td className="px-3 py-3.5">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {formatMotoDisplayName(moto.moto_name)}
                        </span>
                      </td>

                      {/* Riders on Gate */}
                      <td className="px-3 py-3.5">
                        <span className="font-semibold text-slate-600 dark:text-slate-400">
                          {moto.gates?.length ?? 0} rider
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td className="px-3 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
                        >
                          {moto.status === 'LIVE' && (
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                          )}
                          {badgeStyle.label}
                        </span>
                      </td>

                      {/* Quick Actions */}
                      <td className="py-3.5 pl-3 pr-5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 1-Click LIVE */}
                          {moto.status !== 'LIVE' && moto.status !== 'LOCKED' && (
                            <button
                              type="button"
                              onClick={() => handleSetMotoLive(moto)}
                              disabled={isBusy}
                              className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-rose-700 active:scale-95 disabled:opacity-50"
                              title="Jadikan Moto ini LIVE sekarang"
                            >
                              ▶ LIVE
                            </button>
                          )}

                          {/* If UPCOMING, Quick Set READY */}
                          {moto.status === 'UPCOMING' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateMotoStatus(moto, 'READY')}
                              disabled={isBusy}
                              className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                            >
                              Set READY
                            </button>
                          )}

                          {/* If LIVE, Quick Finish / Provisional */}
                          {moto.status === 'LIVE' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateMotoStatus(moto, 'PROVISIONAL')}
                              disabled={isBusy}
                              className="rounded-lg bg-amber-500 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-amber-600 active:scale-95"
                            >
                              🏁 Selesai
                            </button>
                          )}

                          {/* If PROVISIONAL, Quick Lock */}
                          {moto.status === 'PROVISIONAL' && (
                            <button
                              type="button"
                              onClick={() => handleLockMoto(moto)}
                              disabled={isBusy}
                              className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
                            >
                              🔒 Kunci (Lock)
                            </button>
                          )}

                          {/* Emergency Status Override Dropdown */}
                          <select
                            value={moto.status}
                            onChange={(e) => {
                              const val = e.target.value
                              if (val === 'LIVE') handleSetMotoLive(moto)
                              else if (val === 'LOCKED') handleLockMoto(moto)
                              else if (val === 'UPCOMING' || val === 'READY' || val === 'PROVISIONAL') {
                                handleUpdateMotoStatus(moto, val)
                              }
                            }}
                            disabled={isBusy}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            title="Override status manual"
                          >
                            <option value="UPCOMING">UPCOMING</option>
                            <option value="READY">READY</option>
                            <option value="LIVE">LIVE</option>
                            <option value="PROVISIONAL">PROVISIONAL</option>
                            <option value="LOCKED">LOCKED</option>
                          </select>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
