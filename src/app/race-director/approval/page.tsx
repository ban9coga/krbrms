'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CheckerTopbar from '../../../components/CheckerTopbar'
import { compareMotoSequence } from '../../../lib/motoSequence'
import { supabase } from '../../../lib/supabaseClient'

type StatusUpdate = {
  id: string
  rider_id: string
  proposed_status: string
  created_by: string
  created_at: string
}

type PenaltyRow = {
  id: string
  rider_id: string
  stage: string
  rule_code: string
  penalty_point: number
  note?: string | null
  created_at: string
}

type MotoRow = {
  id: string
  moto_name: string
  moto_order: number
  status: string
  category_id?: string
}

type EventItem = {
  id: string
  name: string
  status: string
}

type CategoryItem = {
  id: string
  label: string
  year?: number
  enabled?: boolean
}

type RiderItem = {
  id: string
  name: string
  no_plate_display: string
}

const normalizeRole = (value: string | null | undefined) => String(value ?? '').trim().toUpperCase()
const getErrorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Request failed')

export default function RaceDirectorApprovalPage() {
  const [eventId, setEventId] = useState('')
  const [events, setEvents] = useState<EventItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [statusUpdates, setStatusUpdates] = useState<StatusUpdate[]>([])
  const [penalties, setPenalties] = useState<PenaltyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [approvalMode, setApprovalMode] = useState<'AUTO' | 'DIRECTOR'>('AUTO')
  const [motos, setMotos] = useState<MotoRow[]>([])
  const [lockedMap, setLockedMap] = useState<Record<string, boolean>>({})
  const [role, setRole] = useState<string | null>(null)
  const [riderMap, setRiderMap] = useState<Record<string, RiderItem>>({})
  const [gateStatus, setGateStatus] = useState<
    Array<{
      moto_id: string
      moto_name: string
      category_id?: string | null
      category_label?: string
      status: string
      total: number
      ready: number
      absent: number
      warnings?: number
    }>
  >([])
  const [gateCategoryId, setGateCategoryId] = useState<string>('ALL')
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null)
  const [showAuditLogs, setShowAuditLogs] = useState(false)
  const [actionNotice, setActionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [decisionModal, setDecisionModal] = useState<{
    type: 'status' | 'penalty'
    id: string
    decision: 'APPROVE' | 'REJECT'
    reason: string
  } | null>(null)
  const [decisionSubmitting, setDecisionSubmitting] = useState(false)
  const [auditLogs, setAuditLogs] = useState<
    Array<{
      id: string
      action_type: string
      performed_by: string
      rider_id: string | null
      moto_id: string | null
      reason: string | null
      created_at: string
    }>
  >([])
  const isFetchingRef = useRef(false)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const apiFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Request failed')
    return json
  }, [])

  const showNotice = useCallback((type: 'success' | 'error', message: string) => {
    setActionNotice({ type, message })
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = setTimeout(() => {
      setActionNotice(null)
    }, 4200)
  }, [])

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const loadEvents = async () => {
      try {
        const res = await apiFetch('/api/jury/events?status=LIVE,UPCOMING')
        const rows = (res.data ?? []) as EventItem[]
        setEvents(rows)
        if (!eventId && rows.length) {
          const live = rows.find((ev) => String(ev.status).toUpperCase() === 'LIVE')
          setEventId((live ?? rows[0]).id)
        }
      } catch (err: unknown) {
        showNotice('error', getErrorMessage(err))
      }
    }
    loadEvents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const loadRole = async () => {
      const { data } = await supabase.auth.getUser()
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>
      const appMeta = (data.user?.app_metadata ?? {}) as Record<string, unknown>
      const r =
        (typeof meta.role === 'string' ? meta.role : null) ||
        (typeof appMeta.role === 'string' ? appMeta.role : null)
      setRole(normalizeRole(r))
    }
    loadRole()
  }, [])

  const loadEventData = useCallback(
    async ({
      silent = false,
      includeHeavy = true,
      showRefreshing = false,
      notifyOnError = false,
    }: {
      silent?: boolean
      includeHeavy?: boolean
      showRefreshing?: boolean
      notifyOnError?: boolean
    } = {}) => {
      if (!eventId || isFetchingRef.current) return false
      isFetchingRef.current = true
      if (!silent) setLoading(true)
      if (showRefreshing) setRefreshing(true)
      try {
        const fetchAllRiders = async () => {
          const all: RiderItem[] = []
          let page = 1
          const pageSize = 200
          let total = 0
          do {
            const qs = new URLSearchParams({
              event_id: eventId,
              page: String(page),
              page_size: String(pageSize),
            })
            const res = await apiFetch(`/api/riders?${qs.toString()}`)
            const rows = (res.data ?? []) as RiderItem[]
            total = Number(res.total ?? 0)
            all.push(...rows)
            page++
          } while (all.length < total)
          const map: Record<string, RiderItem> = {}
          for (const r of all) map[r.id] = r
          return map
        }

        const [approvalRes, modeRes, motoRes, lockRes, catRes, gateRes, auditRes, riderRes] = await Promise.all([
          apiFetch(`/api/race-director/approvals?event_id=${eventId}`),
          apiFetch(`/api/race-director/mode?event_id=${eventId}`),
          fetch(`/api/motos?event_id=${eventId}`),
          apiFetch(`/api/jury/events/${eventId}/locks`),
          fetch(`/api/events/${eventId}/categories`),
          apiFetch(`/api/race-director/events/${eventId}/gate-status`),
          includeHeavy ? apiFetch(`/api/race-director/audit?event_id=${eventId}`) : Promise.resolve(null),
          includeHeavy ? fetchAllRiders() : Promise.resolve(null),
        ])

        setStatusUpdates(approvalRes.status_updates ?? [])
        setPenalties(approvalRes.penalties ?? [])
        setApprovalMode((modeRes.data?.approval_mode as 'AUTO' | 'DIRECTOR') ?? 'AUTO')
        const motoJson = await motoRes.json()
        setMotos(motoJson.data ?? [])
        const lockList = (lockRes.data ?? []) as Array<{ moto_id: string }>
        const map: Record<string, boolean> = {}
        for (const row of lockList) map[row.moto_id] = true
        setLockedMap(map)
        const catJson = await catRes.json()
        setCategories((catJson.data ?? []) as CategoryItem[])
        setGateStatus(gateRes.data ?? [])
        if (includeHeavy) {
          setAuditLogs(
            (auditRes as {
              data?: Array<{
                id: string
                action_type: string
                performed_by: string
                rider_id: string | null
                moto_id: string | null
                reason: string | null
                created_at: string
              }>
            } | null)?.data ?? []
          )
          setRiderMap((riderRes as Record<string, RiderItem> | null) ?? {})
        }
        setLastSyncAt(new Date().toLocaleTimeString())
        return true
      } catch (err: unknown) {
        if (notifyOnError) showNotice('error', getErrorMessage(err))
        return false
      } finally {
        if (!silent) setLoading(false)
        if (showRefreshing) setRefreshing(false)
        isFetchingRef.current = false
      }
    },
    [apiFetch, eventId, showNotice]
  )

  useEffect(() => {
    void loadEventData({ silent: false, includeHeavy: true, notifyOnError: true })
  }, [loadEventData])

  useEffect(() => {
    if (!eventId) return
    const lightTimer = setInterval(() => {
      void loadEventData({ silent: true, includeHeavy: false })
    }, 5000)
    const heavyTimer = setInterval(() => {
      void loadEventData({ silent: true, includeHeavy: true })
    }, 20000)
    return () => {
      clearInterval(lightTimer)
      clearInterval(heavyTimer)
    }
  }, [eventId, loadEventData])

  const categoriesSorted = useMemo(() => {
    return categories
      .filter((c) => c.enabled !== false)
      .sort((a, b) => {
      const ay = typeof a.year === 'number' ? a.year : 0
      const by = typeof b.year === 'number' ? b.year : 0
      return by - ay
    })
  }, [categories])

  const enabledCategoryIds = useMemo(() => {
    return new Set(categories.filter((c) => c.enabled !== false).map((c) => c.id))
  }, [categories])

  useEffect(() => {
    if (gateCategoryId === 'ALL') return
    const exists = categories.some((c) => c.id === gateCategoryId && c.enabled !== false)
    if (!exists) setGateCategoryId('ALL')
  }, [categories, gateCategoryId])

  useEffect(() => {
    if (gateCategoryId !== 'ALL') return
    const firstEnabled = categoriesSorted[0]
    if (firstEnabled?.id) setGateCategoryId(firstEnabled.id)
  }, [gateCategoryId, categoriesSorted])

  const filteredGateStatus = useMemo(() => {
    const enabledOnly = gateStatus.filter(
      (row) => typeof row.category_id === 'string' && enabledCategoryIds.has(row.category_id)
    )
    if (gateCategoryId === 'ALL') return enabledOnly
    return enabledOnly.filter((row) => row.category_id === gateCategoryId)
  }, [gateStatus, gateCategoryId, enabledCategoryIds])

  const motosByCategory = useMemo(() => {
    const grouped = new Map<string, MotoRow[]>()
    for (const m of motos) {
      const catId = m.category_id ?? 'unknown'
      const list = grouped.get(catId) ?? []
      list.push(m)
      grouped.set(catId, list)
    }
    for (const [key, list] of grouped.entries()) {
      list.sort(compareMotoSequence)
      grouped.set(key, list)
    }
    return grouped
  }, [motos])

  const sortedStatusUpdates = useMemo(() => {
    return [...statusUpdates].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [statusUpdates])

  const sortedPenalties = useMemo(() => {
    return [...penalties].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [penalties])

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime()
    const sec = Math.max(0, Math.floor(diff / 1000))
    const min = Math.floor(sec / 60)
    const hr = Math.floor(min / 60)
    if (hr > 0) return `${hr}h ${min % 60}m ago`
    if (min > 0) return `${min}m ago`
    return `${sec}s ago`
  }

  const openDecisionModal = (type: 'status' | 'penalty', id: string, decision: 'APPROVE' | 'REJECT') => {
    if (approvalMode === 'AUTO') return
    setDecisionModal({ type, id, decision, reason: '' })
  }

  const handleSubmitDecision = async () => {
    if (!decisionModal || decisionSubmitting) return
    setDecisionSubmitting(true)
    const payloadReason = decisionModal.reason.trim()
    try {
      if (decisionModal.type === 'status') {
        await apiFetch('/api/race-director/approvals/status', {
          method: 'POST',
          body: JSON.stringify({
            update_id: decisionModal.id,
            decision: decisionModal.decision,
            reason: payloadReason || null,
          }),
        })
      } else {
        await apiFetch('/api/race-director/approvals/penalty', {
          method: 'POST',
          body: JSON.stringify({
            penalty_id: decisionModal.id,
            decision: decisionModal.decision,
            reason: payloadReason || null,
          }),
        })
      }
      const refreshed = await loadEventData({ silent: true, includeHeavy: false })
      setDecisionModal(null)
      if (refreshed) {
      showNotice(
        'success',
        `${decisionModal.type === 'status' ? 'Status' : 'Penalty'} ${
          decisionModal.decision === 'APPROVE' ? 'disetujui' : 'ditolak'
        }.`
      )
      } else {
        showNotice('error', 'Keputusan tersimpan, tapi refresh data gagal.')
      }
    } catch (err: unknown) {
      showNotice('error', getErrorMessage(err))
    } finally {
      setDecisionSubmitting(false)
    }
  }

  const handleSaveMode = async () => {
    try {
      await apiFetch('/api/race-director/mode', {
        method: 'PATCH',
        body: JSON.stringify({ event_id: eventId, approval_mode: approvalMode }),
      })
      const refreshed = await loadEventData({ silent: true, includeHeavy: false })
      showNotice(refreshed ? 'success' : 'error', refreshed ? 'Mode approval diperbarui.' : 'Mode tersimpan, refresh gagal.')
    } catch (err: unknown) {
      showNotice('error', getErrorMessage(err))
    }
  }

  const handleLock = async (motoId: string, lock: boolean) => {
    if (lock) {
      const ok = confirm(
        'Lock Moto?\n\nThis will finalize results and freeze modifications.\nThis action should only be done after all approvals are completed.'
      )
      if (!ok) return
    }
    try {
      const targetStatus = lock ? 'LOCKED' : 'PROVISIONAL'
      await apiFetch(`/api/motos/${motoId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: targetStatus }),
      })
      const refreshed = await loadEventData({ silent: true, includeHeavy: false })
      showNotice(
        refreshed ? 'success' : 'error',
        refreshed ? (lock ? 'Moto dikunci.' : 'Moto dibuka kembali.') : 'Status moto tersimpan, refresh gagal.'
      )
    } catch (err: unknown) {
      showNotice('error', getErrorMessage(err))
    }
  }

  const handleManualRefresh = async () => {
    const ok = await loadEventData({ silent: true, includeHeavy: true, showRefreshing: true, notifyOnError: true })
    if (ok) showNotice('success', 'Data diperbarui.')
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-100 text-slate-900">
      <CheckerTopbar title="Race Director Panel" />
      <main className="public-main max-w-[1500px]">
        <section className="public-hero">
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-amber-400/15 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
          <div className="relative z-10 grid gap-2">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-300">Race Director</p>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">Kontrol Approval & Kunci Moto</h1>
            <p className="max-w-2xl text-sm font-semibold text-slate-200 sm:text-base">
              Approval status/penalty, penguncian moto, dan audit.
            </p>
          </div>
        </section>

        <section className="public-panel-light">
          <div className="grid gap-3">
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="public-filter">
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} - {ev.status}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={approvalMode}
                onChange={(e) => setApprovalMode(e.target.value as 'AUTO' | 'DIRECTOR')}
                className="public-filter max-w-[220px]"
              >
                <option value="AUTO">AUTO</option>
                <option value="DIRECTOR">DIRECTOR</option>
              </select>
              <button
                type="button"
                onClick={handleSaveMode}
                className="inline-flex items-center justify-center rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.1em] text-emerald-800 transition-colors hover:bg-emerald-200"
              >
                Simpan Mode
              </button>
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={loading || refreshing || !eventId}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.1em] text-slate-800 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {refreshing ? 'Memuat...' : 'Segarkan'}
              </button>
              <div
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-[0.12em] ${
                  approvalMode === 'AUTO'
                    ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                    : 'border-amber-300 bg-amber-100 text-amber-800'
                }`}
              >
                {approvalMode === 'AUTO' ? 'MODE AUTO APPROVAL' : 'MODE APPROVAL DIRECTOR'}
              </div>
              <div className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                Sinkron: {lastSyncAt ?? '-'}
              </div>
            </div>
          </div>
        </section>

        {actionNotice && (
          <section
            className={`rounded-xl border px-4 py-3 text-sm font-bold ${
              actionNotice.type === 'error'
                ? 'border-amber-300 bg-amber-100 text-amber-800'
                : 'border-emerald-300 bg-emerald-100 text-emerald-800'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span>{actionNotice.message}</span>
              <button
                type="button"
                onClick={() => setActionNotice(null)}
                className="rounded-full border border-current px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.08em]"
              >
                Tutup
              </button>
            </div>
          </section>
        )}

        {loading && (
          <div className="public-panel-light">
            <div className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-600">Memuat...</div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="public-panel-light">
            <div style={{ fontSize: 12, fontWeight: 800, color: '#333' }}>Pending Status</div>
            <div style={{ fontSize: 22, fontWeight: 950 }}>{statusUpdates.length}</div>
          </div>
          <div className="public-panel-light">
            <div style={{ fontSize: 12, fontWeight: 800, color: '#333' }}>Pending Penalties</div>
            <div style={{ fontSize: 22, fontWeight: 950 }}>{penalties.length}</div>
          </div>
          <div className="public-panel-light">
            <div style={{ fontSize: 12, fontWeight: 800, color: '#333' }}>Locked Motos</div>
            <div style={{ fontSize: 22, fontWeight: 950 }}>
              {Object.values(lockedMap).filter(Boolean).length}
            </div>
          </div>
          <div className="public-panel-light">
            <div style={{ fontSize: 12, fontWeight: 800, color: '#333' }}>Gate Status</div>
            <div style={{ marginTop: 8 }}>
              <select
                value={gateCategoryId}
                onChange={(e) => setGateCategoryId(e.target.value)}
                className="public-filter"
                style={{ width: '100%' }}
              >
                <option value="ALL">Semua Kategori</option>
                {categoriesSorted.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              {filteredGateStatus.length === 0 && (
                <div style={{ fontSize: 12, color: '#333' }}>
                  {gateCategoryId === 'ALL' ? 'Belum ada data.' : 'Belum ada moto untuk kategori ini.'}
                </div>
              )}
              {filteredGateStatus.map((g) => (
                <div
                  className="rd-gate-row"
                  key={g.moto_id}
                  style={{
                    border: '2px solid #111',
                    borderRadius: 10,
                    padding: '6px 8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    background:
                      g.status === 'READY'
                        ? '#bfead2'
                        : g.status === 'CHECKING'
                        ? '#ffe9a8'
                        : '#fff',
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  <span>{gateCategoryId === 'ALL' ? `${g.category_label ?? 'Category'} - ${g.moto_name}` : g.moto_name}</span>
                  <span className="rd-gate-meta">
                    {g.status}
                    {g.warnings && g.warnings > 0 ? ` (WARN ${g.warnings})` : ''}
                    {' | '}
                    {g.ready}/{g.total}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <section className="public-panel-light">
            <div style={{ fontWeight: 900, fontSize: 18 }}>Status Updates</div>
            {statusUpdates.length === 0 && <div style={{ marginTop: 8 }}>Tidak ada status pending.</div>}
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              {sortedStatusUpdates.map((u) => {
                const rider = riderMap[u.rider_id]
                const riderLabel = rider ? `${rider.no_plate_display} - ${rider.name}` : u.rider_id
                const statusBadge =
                  u.proposed_status === 'ABSENT'
                    ? '#fee2e2'
                    : u.proposed_status === 'DNS'
                    ? '#ffe9a8'
                    : '#bfead2'
                return (
                <div
                  key={u.id}
                  style={{
                    border: '2px solid #111',
                    borderRadius: 12,
                    background: '#eaf7ee',
                    padding: 12,
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{riderLabel}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: 999,
                        border: '2px solid #111',
                        background: statusBadge,
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      {u.proposed_status}
                    </span>
                    <span style={{ fontSize: 12, color: '#333' }}>{timeAgo(u.created_at)}</span>
                  </div>
                  <div
                    className="rd-action-grid"
                    style={{ display: 'grid', gap: 8, marginTop: 6, gridTemplateColumns: '1fr 1fr' }}
                  >
                    <button
                      disabled={approvalMode === 'AUTO'}
                      onClick={() => openDecisionModal('status', u.id, 'APPROVE')}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '2px solid #111',
                        background: '#bfead2',
                        fontWeight: 900,
                        cursor: approvalMode === 'AUTO' ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Setujui
                    </button>
                    <button
                      disabled={approvalMode === 'AUTO'}
                      onClick={() => openDecisionModal('status', u.id, 'REJECT')}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '2px solid #111',
                        background: '#ffd7d7',
                        fontWeight: 900,
                        cursor: approvalMode === 'AUTO' ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Tolak
                    </button>
                  </div>
                </div>
              )})}
            </div>
          </section>

          <section className="public-panel-light">
            <div style={{ fontWeight: 900, fontSize: 18 }}>Approval Penalty</div>
            {penalties.length === 0 && <div style={{ marginTop: 8 }}>Tidak ada penalty pending.</div>}
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              {sortedPenalties.map((p) => {
                const rider = riderMap[p.rider_id]
                const riderLabel = rider ? `${rider.no_plate_display} - ${rider.name}` : p.rider_id
                return (
                <div
                  key={p.id}
                  style={{
                    border: '2px solid #111',
                    borderRadius: 12,
                    background: '#eaf7ee',
                    padding: 12,
                    display: 'grid',
                    gap: 6,
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{riderLabel}</div>
                  <div>Rule: {p.rule_code} (+{p.penalty_point})</div>
                  {p.note && <div style={{ fontSize: 12, color: '#333' }}>Note: {p.note}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#333' }}>{timeAgo(p.created_at)}</span>
                  </div>
                  <div
                    className="rd-action-grid"
                    style={{ display: 'grid', gap: 8, marginTop: 6, gridTemplateColumns: '1fr 1fr' }}
                  >
                    <button
                      disabled={approvalMode === 'AUTO'}
                      onClick={() => openDecisionModal('penalty', p.id, 'APPROVE')}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '2px solid #111',
                        background: '#bfead2',
                        fontWeight: 900,
                        cursor: approvalMode === 'AUTO' ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Setujui
                    </button>
                    <button
                      disabled={approvalMode === 'AUTO'}
                      onClick={() => openDecisionModal('penalty', p.id, 'REJECT')}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '2px solid #111',
                        background: '#ffd7d7',
                        fontWeight: 900,
                        cursor: approvalMode === 'AUTO' ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Tolak
                    </button>
                  </div>
                </div>
              )})}
            </div>
          </section>

          <section className="public-panel-light">
            <div style={{ fontWeight: 900, fontSize: 18 }}>Moto Locking</div>
            {motos.length === 0 && <div style={{ marginTop: 8 }}>Tidak ada moto.</div>}
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              {categoriesSorted.map((cat) => {
                const list = motosByCategory.get(cat.id) ?? []
                if (list.length === 0) return null
                const isOpen = openCategoryId === cat.id
                return (
                  <div
                    key={cat.id}
                    style={{
                      border: '2px solid #111',
                      borderRadius: 12,
                      background: '#fff',
                      padding: 12,
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenCategoryId(isOpen ? null : cat.id)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '2px solid #111',
                        background: '#2ecc71',
                        fontWeight: 900,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {cat.label} {isOpen ? 'v' : '>'}
                    </button>
                    {isOpen && (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {list.map((m) => {
                          const status = (m.status ?? '').toUpperCase()
                          const isLocked = status === 'LOCKED'
                          const canUnlock = isLocked && role === 'SUPER_ADMIN'
                          const canLock = status === 'PROVISIONAL' || status === 'PROTEST_REVIEW'
                          const showLockDisabled = status === 'UPCOMING'
                          return (
                            <div
                              key={m.id}
                              style={{
                                border: '2px solid #111',
                                borderRadius: 12,
                                background: isLocked ? '#dbeafe' : '#eaf7ee',
                                padding: 12,
                                display: 'grid',
                                gap: 6,
                              }}
                            >
                              <div style={{ fontWeight: 900 }}>
                                {m.moto_order}. {m.moto_name}
                              </div>
                              <div style={{ fontSize: 12, color: '#333' }}>{m.status}</div>
                              <div
                                style={{
                                  fontSize: 11,
                                  fontWeight: 900,
                                  padding: '4px 8px',
                                  borderRadius: 999,
                                  border: '2px solid #111',
                                  background:
                                    status === 'LOCKED'
                                      ? '#93c5fd'
                                      : status === 'PROVISIONAL'
                                      ? '#ffe9a8'
                                      : status === 'PROTEST_REVIEW'
                                      ? '#ffd7d7'
                                      : '#bfead2',
                                  width: 'fit-content',
                                }}
                              >
                                {status || 'UNKNOWN'}
                              </div>
                              {status === 'LIVE' && (
                                <div
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 900,
                                    padding: '4px 8px',
                                    borderRadius: 999,
                                    border: '2px solid #111',
                                    background: '#ffe9a8',
                                    width: 'fit-content',
                                  }}
                                >
                                  Race sedang berjalan
                                </div>
                              )}
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {showLockDisabled && (
                                  <button
                                    disabled
                                    title="Moto harus LIVE/PROVISIONAL sebelum bisa dikunci."
                                    style={{
                                      padding: '8px 12px',
                                      borderRadius: 10,
                                      border: '2px solid #111',
                                      background: '#f3f4f6',
                                      fontWeight: 900,
                                      cursor: 'not-allowed',
                                    }}
                                  >
                                    Kunci
                                  </button>
                                )}
                                {canLock && (
                                  <button
                                    onClick={() => handleLock(m.id, true)}
                                    style={{
                                      padding: '8px 12px',
                                      borderRadius: 10,
                                      border: '2px solid #111',
                                      background: '#ffd7d7',
                                      fontWeight: 900,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Kunci
                                  </button>
                                )}
                                {canUnlock && (
                                  <button
                                    onClick={() => handleLock(m.id, false)}
                                    style={{
                                      padding: '8px 12px',
                                      borderRadius: 10,
                                      border: '2px solid #b40000',
                                      background: '#ffd7d7',
                                      color: '#b40000',
                                      fontWeight: 900,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Buka Kunci
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="public-panel-light">
            <div className="rd-section-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>Audit Log (Last 100)</div>
              <button
                type="button"
                onClick={() => setShowAuditLogs((prev) => !prev)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 10,
                  border: '2px solid #111',
                  background: '#fff',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                {showAuditLogs ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>
            {showAuditLogs && (
              <>
                {auditLogs.length === 0 && <div style={{ marginTop: 8 }}>Belum ada log audit.</div>}
                <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        border: '2px solid #111',
                        borderRadius: 12,
                        background: '#fff',
                        padding: 12,
                        display: 'grid',
                        gap: 4,
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>
                        {new Date(log.created_at).toLocaleString()} - {log.action_type}
                      </div>
                      <div style={{ fontSize: 12, color: '#333' }}>
                        Oleh: {log.performed_by}
                        {log.rider_id ? ` - Rider: ${log.rider_id}` : ''}
                        {log.moto_id ? ` - Moto: ${log.moto_id}` : ''}
                      </div>
                      {log.reason && <div style={{ fontSize: 12, color: '#333' }}>Alasan: {log.reason}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
      {decisionModal && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/55 p-4">
          <div className="w-full max-w-[560px] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="grid gap-2">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Catatan Keputusan</p>
              <h2 className="text-xl font-black text-slate-900">
                {decisionModal.decision === 'APPROVE' ? 'Setujui' : 'Tolak'}{' '}
                {decisionModal.type === 'status' ? 'Status' : 'Penalty'}
              </h2>
              <p className="text-sm font-semibold text-slate-600">
                Tambahkan alasan (opsional) lalu konfirmasi aksi.
              </p>
            </div>
            <div className="mt-4 grid gap-2">
              <label className="text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Alasan (opsional)</label>
              <textarea
                value={decisionModal.reason}
                onChange={(e) =>
                  setDecisionModal((prev) => (prev ? { ...prev, reason: e.target.value } : prev))
                }
                rows={4}
                disabled={decisionSubmitting}
                className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none ring-0 focus:border-slate-500"
                placeholder="Contoh: rider tidak hadir di gate, bukti dari checker..."
              />
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDecisionModal(null)}
                disabled={decisionSubmitting}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.1em] text-slate-700 transition-colors hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSubmitDecision}
                disabled={decisionSubmitting}
                className={`rounded-xl border px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.1em] transition-colors ${
                  decisionModal.decision === 'APPROVE'
                    ? 'border-emerald-300 bg-emerald-500 text-white hover:bg-emerald-400'
                    : 'border-amber-300 bg-amber-400 text-white hover:bg-amber-300'
                }`}
              >
                {decisionSubmitting
                  ? 'Memproses...'
                  : `Konfirmasi ${decisionModal.decision === 'APPROVE' ? 'Setujui' : 'Tolak'}`}
              </button>
            </div>
          </div>
        </div>
      )}
      <style jsx>{`
        @media (max-width: 640px) {
          .rd-action-grid {
            grid-template-columns: 1fr;
          }
          .rd-gate-row {
            flex-direction: column;
            align-items: flex-start;
          }
          .rd-gate-meta {
            width: 100%;
          }
          .rd-section-head {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  )
}


