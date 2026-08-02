'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/src/lib/supabaseClient'
import { useHighVisibility } from '../../../hooks/useHighVisibility'
import { buildCategoryBaseOrder, compareMotoWorkflowSequence } from '../../../lib/motoSequence'
import { isMotoLive } from '../../../lib/motoStatus'
import CheckerTopbar from '../../../components/CheckerTopbar'
import LoadingState from '../../../components/LoadingState'
import { usePageVisibility } from '../../../lib/usePageVisibility'
import { useApiFetch } from '@/src/hooks/useApiFetch'

type EventItem = {
  id: string
  name: string
  event_date: string
  status: string
}

type CategoryItem = {
  id: string
  label: string
  year?: number
  gender?: 'BOY' | 'GIRL' | 'MIX'
}

type MotoItem = {
  id: string
  moto_name: string
  moto_order: number
  status: string
  category_id?: string
}

type RiderItem = {
  id: string
  name: string
  no_plate_display: string
  gate_position?: number
}

type Action =
  | { type: 'finish'; riderId: string; position: number }
  | { type: 'dnf'; riderId: string }

type EventFlags = {
  penalty_enabled: boolean
  absent_enabled: boolean
  dns_enabled: boolean
  dnf_enabled: boolean
  dnf_progress_enabled: boolean
}

type PenaltyBadgeItem = {
  code: string
  points: number
}

type FinisherPollData = {
  statuses: Array<{
    rider_id: string
    participation_status?: string | null
  }>
  results: Array<{
    rider_id: string
    finish_order?: number | null
    result_status?: string | null
    dnf_progress_percent?: number | null
  }>
  penalties: Array<{
    rider_id: string
    rule_code?: string | null
    penalty_point?: number | null
    rider_penalty_approvals?:
      | { approval_status?: string | null }
      | Array<{ approval_status?: string | null }>
      | null
  }>
  locked: boolean
}

type SubmittedMotoNotice = {
  category: string
  motoName: string
}

const VIBRATE_MS = 30
const LONG_PRESS_MS = 800

const PenaltyBadges = ({ items }: { items?: PenaltyBadgeItem[] }) => {
  if (!items?.length) return null
  return (
    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
      {items.slice(0, 3).map((item, index) => (
        <span
          key={`${item.code}-${item.points}-${index}`}
          className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-amber-700"
        >
          {item.code} +{item.points}
        </span>
      ))}
      {items.length > 3 && (
        <span className="inline-flex rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-600">
          +{items.length - 3}
        </span>
      )}
    </span>
  )
}

export default function JuryFinishPage() {
  const apiFetch = useApiFetch()
  const [events, setEvents] = useState<EventItem[]>([])
  const [eventId, setEventId] = useState('')
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [motos, setMotos] = useState<MotoItem[]>([])
  const [selectedMotoId, setSelectedMotoId] = useState('')
  const [riders, setRiders] = useState<RiderItem[]>([])
  const [role, setRole] = useState<string | null>(null)
  const [motoLocked, setMotoLocked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refreshingSelector, setRefreshingSelector] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [pressedId, setPressedId] = useState<string | null>(null)
  const [dnsActionRiderId, setDnsActionRiderId] = useState<string | null>(null)
  const [penaltiesByRider, setPenaltiesByRider] = useState<Record<string, number>>({})
  const [penaltyBadgesByRider, setPenaltyBadgesByRider] = useState<Record<string, PenaltyBadgeItem[]>>({})
  const [participationByRider, setParticipationByRider] = useState<Record<string, string>>({})
  const [flags, setFlags] = useState<EventFlags>({
    penalty_enabled: true,
    absent_enabled: true,
    dns_enabled: true,
    dnf_enabled: true,
    dnf_progress_enabled: false,
  })

  const [finishOrder, setFinishOrder] = useState<string[]>([])
  const [dnfRiders, setDnfRiders] = useState<string[]>([])
  const [dnfProgressByRider, setDnfProgressByRider] = useState<Record<string, number>>({})
  const [dnfProgressRiderId, setDnfProgressRiderId] = useState<string | null>(null)
  const [dnfProgressDraft, setDnfProgressDraft] = useState('')
  const [actions, setActions] = useState<Action[]>([])
  const [submitNotice, setSubmitNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [submittedMotoNotice, setSubmittedMotoNotice] = useState<SubmittedMotoNotice | null>(null)
  const { highVisibility, toggleHighVisibility } = useHighVisibility('jury-finish-high-visibility')

  const pressTimers = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({})
  const longPressFired = useRef<Record<string, boolean>>({})
  const motosRef = useRef<MotoItem[]>([])
  const pressedIdRef = useRef<string | null>(null)
  const savingRef = useRef(false)
  const actionsCountRef = useRef(0)
  const localEditingRef = useRef(false)
  const selectedMotoLiveRef = useRef({ id: '', live: false })

  useEffect(() => {
    pressedIdRef.current = pressedId
  }, [pressedId])

  useEffect(() => {
    savingRef.current = saving
  }, [saving])

  useEffect(() => {
    actionsCountRef.current = actions.length
  }, [actions.length])

  useEffect(() => {
    motosRef.current = motos
  }, [motos])

  useEffect(() => {
    localEditingRef.current = Boolean(pressedId || saving || actions.length > 0)
  }, [actions.length, pressedId, saving])

  useEffect(() => {
    if (!submitNotice) return
    const timer = window.setTimeout(() => setSubmitNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [submitNotice])

  const pickNextSelectableMotoId = useCallback((list: MotoItem[], currentMotoId: string) => {
    const selectableRows = list.filter((m) => !['LOCKED', 'FINISHED'].includes((m.status ?? '').toUpperCase()))
    if (!selectableRows.length) return ''
    if (currentMotoId && selectableRows.some((m) => m.id === currentMotoId && isMotoLive(m.status))) {
      return currentMotoId
    }
    const liveMoto = selectableRows.find((m) => isMotoLive(m.status))
    if (liveMoto) return liveMoto.id
    const nextMoto = selectableRows.find(
      (m) => (m.status ?? '').toUpperCase() === 'READY' || (m.status ?? '').toUpperCase() === 'UPCOMING'
    )
    if (nextMoto) return nextMoto.id
    return selectableRows[0].id
  }, [])

  useEffect(() => {
    const loadEvents = async () => {
      const res = await apiFetch('/api/jury/events?status=LIVE')
      setEvents(res.data ?? [])
      if (!eventId && res.data?.length) setEventId(res.data[0].id)
    }
    void loadEvents()
  }, [apiFetch, eventId])

  useEffect(() => {
    const loadRole = async () => {
      const { data } = await supabase.auth.getUser()
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>
      const appMeta = (data.user?.app_metadata ?? {}) as Record<string, unknown>
      const r =
        (typeof meta.role === 'string' ? meta.role : null) ||
        (typeof appMeta.role === 'string' ? appMeta.role : null)
      setRole(r)
    }
    loadRole()
  }, [])

  const loadAll = useCallback(async () => {
    if (!eventId) return
    const [motoRes, catRes, flagRes] = await Promise.all([
      apiFetch(`/api/jury/events/${eventId}/moto-state`),
      apiFetch(`/api/events/${eventId}/categories`),
      apiFetch(`/api/jury/events/${eventId}/modules`),
    ])
    setFlags(
      (flagRes.data as EventFlags | null) ?? {
        penalty_enabled: true,
        absent_enabled: true,
        dns_enabled: true,
        dnf_enabled: true,
        dnf_progress_enabled: false,
      }
    )
    const catRows = (catRes.data ?? []) as CategoryItem[]
    setCategories(catRows)
    const rawMotos = (motoRes.data ?? []) as MotoItem[]
    const categoryBaseOrder = buildCategoryBaseOrder(rawMotos)
    const workflowMotos = [...rawMotos].sort((a, b) => compareMotoWorkflowSequence(a, b, categoryBaseOrder))
    setMotos(workflowMotos)
    setSelectedMotoId((prev) => pickNextSelectableMotoId(workflowMotos, prev))
    return workflowMotos
  }, [apiFetch, eventId, pickNextSelectableMotoId])

  const refreshMotoState = useCallback(async () => {
    if (!eventId) return null
    const motoRes = await apiFetch(`/api/jury/events/${eventId}/moto-state`)
    const rawMotos = (motoRes.data ?? []) as MotoItem[]
    const categoryBaseOrder = buildCategoryBaseOrder(rawMotos)
    const workflowMotos = [...rawMotos].sort((a, b) => compareMotoWorkflowSequence(a, b, categoryBaseOrder))
    const nextSelectedMotoId = pickNextSelectableMotoId(workflowMotos, selectedMotoId)

    setMotos(workflowMotos)
    if (nextSelectedMotoId !== selectedMotoId) setSelectedMotoId(nextSelectedMotoId)

    return { motos: workflowMotos, selectedMotoId: nextSelectedMotoId }
  }, [apiFetch, eventId, pickNextSelectableMotoId, selectedMotoId])

  const categoryLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) map.set(c.id, c.label)
    return map
  }, [categories])

  const selectedMoto = useMemo(() => motos.find((m) => m.id === selectedMotoId) ?? null, [motos, selectedMotoId])
  const selectedMotoLive = isMotoLive(selectedMoto?.status)
  const selectedCategoryLabel = selectedMoto
    ? categoryLabel.get(selectedMoto.category_id ?? '') ?? 'Unknown Category'
    : null
  const selectableMotos = useMemo(
    () => motos.filter((m) => !['LOCKED', 'FINISHED'].includes((m.status ?? '').toUpperCase())),
    [motos]
  )

  const applyFinisherPollData = useCallback((data: FinisherPollData, targetMoto: MotoItem | null) => {
    const existingResults = data.results ?? []
    const finishFromServer = [...existingResults]
      .filter((r) => r.result_status === 'FINISH' && r.finish_order != null)
      .sort((a, b) => Number(a.finish_order ?? 9999) - Number(b.finish_order ?? 9999))
      .map((r) => r.rider_id)
    const dnfFromServer = existingResults
      .filter((r) => r.result_status === 'DNF')
      .map((r) => r.rider_id)
    const dnfProgressMap = Object.fromEntries(
      existingResults
        .filter((r) => r.result_status === 'DNF' && r.dnf_progress_percent != null)
        .map((r) => [r.rider_id, Number(r.dnf_progress_percent)])
    )
    const dnsFromServer = existingResults
      .filter((r) => r.result_status === 'DNS')
      .map((r) => r.rider_id)

    const statusMap: Record<string, string> = {}
    for (const row of data.statuses ?? []) {
      if (row?.rider_id && row?.participation_status) {
        statusMap[row.rider_id] = row.participation_status
      }
    }
    for (const riderId of dnsFromServer) statusMap[riderId] = 'DNS'

    const blockedRiderIds = new Set(
      Object.entries(statusMap)
        .filter(([, status]) => status === 'DNS' || status === 'ABSENT')
        .map(([riderId]) => riderId)
    )
    const penaltyMap: Record<string, number> = {}
    const badgeMap: Record<string, PenaltyBadgeItem[]> = {}
    for (const row of data.penalties ?? []) {
      const approval = Array.isArray(row.rider_penalty_approvals)
        ? row.rider_penalty_approvals[0]?.approval_status
        : row.rider_penalty_approvals?.approval_status
      if (approval !== 'APPROVED') continue
      const points = Number(row.penalty_point ?? 0)
      penaltyMap[row.rider_id] = (penaltyMap[row.rider_id] ?? 0) + points
      const items = badgeMap[row.rider_id] ?? []
      items.push({ code: String(row.rule_code ?? 'PEN').toUpperCase(), points })
      badgeMap[row.rider_id] = items
    }

    setActions([])
    setHasSubmitted(!isMotoLive(targetMoto?.status) && existingResults.length > 0)
    setFinishOrder(finishFromServer.filter((riderId) => !blockedRiderIds.has(riderId)))
    setDnfRiders(dnfFromServer.filter((riderId) => !blockedRiderIds.has(riderId)))
    setDnfProgressByRider(dnfProgressMap)
    setParticipationByRider(statusMap)
    setPenaltiesByRider(penaltyMap)
    setPenaltyBadgesByRider(badgeMap)
    setMotoLocked(Boolean(data.locked))
  }, [])

  const loadRiders = useCallback(async (motoIdOverride?: string, force = false) => {
    if (!force && localEditingRef.current) return
    const targetMotoId = motoIdOverride ?? selectedMotoId
    if (!eventId || !targetMotoId) {
      setRiders([])
      setFinishOrder([])
      setDnfRiders([])
      setDnfProgressByRider({})
      setActions([])
      setPenaltiesByRider({})
      setPenaltyBadgesByRider({})
      setParticipationByRider({})
      setMotoLocked(false)
      return
    }
    const targetMoto = motosRef.current.find((m) => m.id === targetMotoId) ?? null
    const [res, pollRes] = await Promise.all([
      apiFetch(`/api/jury/motos/${targetMotoId}/riders`),
      apiFetch(`/api/jury/events/${eventId}/finisher-poll?moto_id=${targetMotoId}`),
    ])
    if (!force && localEditingRef.current) return
    setRiders((res.data ?? []) as RiderItem[])
    applyFinisherPollData((pollRes.data ?? {}) as FinisherPollData, targetMoto)
  }, [apiFetch, applyFinisherPollData, eventId, selectedMotoId])

  useEffect(() => {
    void loadRiders()
  }, [loadRiders])

  // The selector may already point to this moto while it changes from READY
  // to LIVE. Reload the grid once so Finisher can start immediately.
  useEffect(() => {
    const previous = selectedMotoLiveRef.current
    const becameLiveForSameMoto =
      previous.id === selectedMotoId &&
      !previous.live &&
      selectedMotoLive &&
      Boolean(selectedMotoId)

    selectedMotoLiveRef.current = { id: selectedMotoId, live: selectedMotoLive }
    if (becameLiveForSameMoto) {
      void loadRiders(selectedMotoId, true)
    }
  }, [loadRiders, selectedMotoId, selectedMotoLive])

  const refreshFinisherPollingState = useCallback(async (motoId: string, targetMoto: MotoItem | null) => {
    if (!eventId || !motoId) return
    const response = await apiFetch(`/api/jury/events/${eventId}/finisher-poll?moto_id=${motoId}`)
    applyFinisherPollData((response.data ?? {}) as FinisherPollData, targetMoto)
  }, [apiFetch, applyFinisherPollData, eventId])

  // Consolidated polling loop with page visibility awareness.
  // Keeps the active race fresh with only moto-state plus one combined Finisher poll.
  const isPageVisible = usePageVisibility()
  useEffect(() => {
    if (!eventId) return
    void loadAll()

    if (!isPageVisible) return

    const interval = window.setInterval(() => {
      if (pressedId || actions.length > 0 || saving) return
      void (async () => {
        try {
          const state = await refreshMotoState()
          if (!state?.selectedMotoId) return

          const currentSelectedMoto = state.motos.find((m) => m.id === state.selectedMotoId) ?? null
          const selectionChanged = state.selectedMotoId !== selectedMotoId
          if (!selectionChanged && isMotoLive(currentSelectedMoto?.status) && !hasSubmitted) {
            await refreshFinisherPollingState(state.selectedMotoId, currentSelectedMoto)
          }
        } catch {
          // Keep the finisher's current local state when a background poll fails.
        }
      })()
    }, 15000)
    return () => window.clearInterval(interval)
  }, [eventId, selectedMotoId, isPageVisible, hasSubmitted, pressedId, actions.length, saving, loadAll, loadRiders, refreshFinisherPollingState, refreshMotoState])

  const availableRiders = useMemo(() => {
    const finished = new Set(finishOrder)
    const dnf = new Set(dnfRiders)
    return riders.filter((r) => {
      if (finished.has(r.id) || dnf.has(r.id)) return false
      const status = participationByRider[r.id]
      if (status === 'DNS' || status === 'ABSENT') return false
      return true
    })
  }, [riders, finishOrder, dnfRiders, participationByRider])

  const finishSequence = useMemo(() => {
    return finishOrder.map((id, idx) => ({ id, position: idx + 1 }))
  }, [finishOrder])

  const dnsRiders = useMemo(() => {
    return riders
      .filter((r) => participationByRider[r.id] === 'DNS' || participationByRider[r.id] === 'ABSENT')
      .map((r) => r.id)
  }, [participationByRider, riders])

  const completedRiderCount = useMemo(() => {
    const completed = new Set<string>()
    finishOrder.forEach((id) => completed.add(id))
    dnfRiders.forEach((id) => completed.add(id))
    dnsRiders.forEach((id) => completed.add(id))
    return completed.size
  }, [dnfRiders, dnsRiders, finishOrder])
  const allRidersHaveResult = riders.length > 0 && completedRiderCount >= riders.length
  const submitDisabled =
    hasSubmitted || saving || role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive || !allRidersHaveResult

  const vibrate = () => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(VIBRATE_MS)
    }
  }

  const syncToSupabase = async (
    riderId: string,
    position: number | null,
    status: 'FINISH' | 'DNF',
    dnfProgressPercent: number | null = null
  ) => {
    if (!selectedMoto) return
    await supabase.from('results').upsert(
      {
        event_id: eventId,
        moto_id: selectedMoto.id,
        rider_id: riderId,
        finish_order: position,
        result_status: status,
        dnf_progress_percent: status === 'DNF' ? dnfProgressPercent : null,
      },
      { onConflict: 'moto_id,rider_id' }
    )
  }

  const removeFromSupabase = async (riderId: string) => {
    if (!selectedMoto) return
    await supabase.from('results').delete().eq('moto_id', selectedMoto.id).eq('rider_id', riderId)
  }

  const handleFinish = (riderId: string) => {
    if (role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive) return
    if (finishOrder.includes(riderId) || dnfRiders.includes(riderId)) return
    localEditingRef.current = true
    const position = finishOrder.length + 1
    setFinishOrder((prev) => [...prev, riderId])
    setActions((prev) => [...prev, { type: 'finish', riderId, position }])
    vibrate()
    syncToSupabase(riderId, position, 'FINISH')
  }

  const saveDNF = (riderId: string, progressPercent: number | null) => {
    if (role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive || !flags.dnf_enabled) return
    if (finishOrder.includes(riderId) || dnfRiders.includes(riderId)) return
    localEditingRef.current = true
    setDnfRiders((prev) => [...prev, riderId])
    if (progressPercent != null) setDnfProgressByRider((prev) => ({ ...prev, [riderId]: progressPercent }))
    setActions((prev) => [...prev, { type: 'dnf', riderId }])
    vibrate()
    void syncToSupabase(riderId, null, 'DNF', progressPercent)
  }

  const handleDNF = (riderId: string) => {
    if (role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive || !flags.dnf_enabled) return
    if (finishOrder.includes(riderId) || dnfRiders.includes(riderId)) return
    if (flags.dnf_progress_enabled) {
      setDnfProgressRiderId(riderId)
      setDnfProgressDraft('')
      return
    }
    saveDNF(riderId, null)
  }

  const handleConfirmDNFProgress = () => {
    if (!dnfProgressRiderId) return
    const progress = Number(dnfProgressDraft)
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      setSubmitNotice({ type: 'error', message: 'Progress DNF harus diisi antara 0 sampai 100%.' })
      return
    }
    const riderId = dnfProgressRiderId
    setDnfProgressRiderId(null)
    saveDNF(riderId, progress)
  }

  const handleSetDns = async (rider: RiderItem) => {
    if (!selectedMoto || role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive || !flags.dns_enabled) return
    if (finishOrder.includes(rider.id) || dnfRiders.includes(rider.id)) return
    const confirmed = window.confirm(
      `Tetapkan DNS untuk ${rider.no_plate_display} - ${rider.name}?\n\nRider akan dikeluarkan dari input urutan finish dan dapat di-undo sebelum Submit Result.`
    )
    if (!confirmed) return

    const previousStatus = participationByRider[rider.id]
    setDnsActionRiderId(rider.id)
    setParticipationByRider((prev) => ({ ...prev, [rider.id]: 'DNS' }))
    try {
      await apiFetch(`/api/jury/events/${eventId}/rider-status`, {
        method: 'POST',
        body: JSON.stringify({
          rider_id: rider.id,
          participation_status: 'DNS',
          registration_order: rider.gate_position ?? 0,
          moto_id: selectedMoto.id,
        }),
      })
      vibrate()
    } catch (error: unknown) {
      setParticipationByRider((prev) => ({ ...prev, [rider.id]: previousStatus ?? 'ACTIVE' }))
      setSubmitNotice({ type: 'error', message: error instanceof Error ? error.message : 'Gagal menetapkan DNS.' })
    } finally {
      setDnsActionRiderId(null)
    }
  }

  const handleUndoDns = async (rider: RiderItem) => {
    if (!selectedMoto || role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive) return
    const confirmed = window.confirm(`Batalkan DNS untuk ${rider.no_plate_display} - ${rider.name}?`)
    if (!confirmed) return

    const previousStatus = participationByRider[rider.id]
    setDnsActionRiderId(rider.id)
    setParticipationByRider((prev) => ({ ...prev, [rider.id]: 'ACTIVE' }))
    try {
      await apiFetch(
        `/api/jury/events/${eventId}/rider-status?rider_id=${encodeURIComponent(rider.id)}&moto_id=${encodeURIComponent(selectedMoto.id)}`,
        { method: 'DELETE' }
      )
      vibrate()
    } catch (error: unknown) {
      setParticipationByRider((prev) => ({ ...prev, [rider.id]: previousStatus ?? 'DNS' }))
      setSubmitNotice({ type: 'error', message: error instanceof Error ? error.message : 'Gagal membatalkan DNS.' })
    } finally {
      setDnsActionRiderId(null)
    }
  }

  const handleUndo = () => {
    if (actions.length === 0) return
    localEditingRef.current = actions.length - 1 > 0
    const last = actions[actions.length - 1]
    setActions((prev) => prev.slice(0, -1))
    if (last.type === 'finish') {
      setFinishOrder((prev) => prev.filter((id) => id !== last.riderId))
    } else {
      setDnfRiders((prev) => prev.filter((id) => id !== last.riderId))
      setDnfProgressByRider((prev) => {
        const next = { ...prev }
        delete next[last.riderId]
        return next
      })
    }
    vibrate()
    removeFromSupabase(last.riderId)
  }

  const handleSubmitHeat = async () => {
    if (role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive) return
    if (!selectedMoto) return
    if (!allRidersHaveResult) {
      setSubmitNotice({
        type: 'error',
        message: `Belum bisa submit. Baru ${completedRiderCount}/${riders.length} rider yang masuk hasil.`,
      })
      return
    }
    localEditingRef.current = true
    setSaving(true)
    setSubmitNotice(null)
    try {
      const payload = [
        ...finishSequence.map((f) => ({
          event_id: eventId,
          moto_id: selectedMoto.id,
          rider_id: f.id,
          finish_order: f.position,
          result_status: 'FINISH',
          dnf_progress_percent: null,
        })),
        ...[...dnfRiders]
          .sort((a, b) => Number(dnfProgressByRider[b] ?? -1) - Number(dnfProgressByRider[a] ?? -1))
          .map((id, index) => ({
          event_id: eventId,
          moto_id: selectedMoto.id,
          rider_id: id,
          finish_order: flags.dnf_progress_enabled ? finishSequence.length + index + 1 : null,
          result_status: 'DNF',
          dnf_progress_percent: flags.dnf_progress_enabled ? dnfProgressByRider[id] ?? null : null,
        })),
      ]
      if (payload.length) {
        await apiFetch(`/api/jury/motos/${selectedMoto.id}/results`, {
          method: 'POST',
          body: JSON.stringify({
            results: payload.map(({ rider_id, finish_order, result_status, dnf_progress_percent }) => ({
              rider_id,
              finish_order,
              result_status,
              dnf_progress_percent,
            })),
          }),
        })
      }
      setHasSubmitted(true)
      setMotos((prev) =>
        prev.map((m) => (m.id === selectedMoto.id ? { ...m, status: 'PROVISIONAL' } : m))
      )
      setSubmittedMotoNotice({
        category: categoryLabel.get(selectedMoto.category_id ?? '') ?? 'Unknown Category',
        motoName: selectedMoto.moto_name,
      })
    } catch (error: unknown) {
      setSubmitNotice({
        type: 'error',
        message: error instanceof Error ? error.message : 'Submit result gagal.',
      })
    } finally {
      localEditingRef.current = false
      setSaving(false)
    }
  }

  const handleSubmittedMotoNoticeClose = async () => {
    setSubmittedMotoNotice(null)
    await handleRefreshMotoSelector()
  }


  const handleRefreshMotoSelector = async () => {
    if (refreshingSelector) return
    setRefreshingSelector(true)
    try {
      const state = await refreshMotoState()
      if (!state?.selectedMotoId) return

      // A changed selector triggers the rider-grid effect exactly once. When
      // the selector already points here, reload its grid too: the moto may
      // have changed from READY to LIVE since the previous background poll.
      if (state.selectedMotoId === selectedMotoId) {
        void loadRiders(state.selectedMotoId, true)
      }
    } finally {
      setRefreshingSelector(false)
    }
  }

  const onCardPointerDown = (event: React.PointerEvent<HTMLButtonElement>, riderId: string) => {
    event.preventDefault()
    localEditingRef.current = true
    setPressedId(riderId)
    longPressFired.current[riderId] = false
    if (pressTimers.current[riderId]) clearTimeout(pressTimers.current[riderId] as ReturnType<typeof setTimeout>)
    pressTimers.current[riderId] = setTimeout(() => {
      longPressFired.current[riderId] = true
      handleDNF(riderId)
    }, LONG_PRESS_MS)
  }

  const onCardPointerUp = (event: React.PointerEvent<HTMLButtonElement>, riderId: string) => {
    event.preventDefault()
    setPressedId(null)
    const timer = pressTimers.current[riderId]
    if (timer) clearTimeout(timer)
    pressTimers.current[riderId] = null
    if (!longPressFired.current[riderId]) {
      handleFinish(riderId)
    }
  }

  const onCardPointerLeave = (riderId: string) => {
    setPressedId(null)
    const timer = pressTimers.current[riderId]
    if (timer) clearTimeout(timer)
    pressTimers.current[riderId] = null
  }

  return (
    <div className="public-page">
      <CheckerTopbar title="Jury Finish Panel" />
      <main className="public-main max-w-[1500px] pb-36">
        <section className="public-hero">
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-amber-400/15 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
          <div className="relative z-10 grid gap-3">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-300">Jury Finish</p>
            <div className="rounded-[22px] border border-emerald-300/30 bg-emerald-300/10 px-5 py-4 shadow-[0_0_28px_rgba(52,211,153,0.12)]">
              <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-emerald-200">Kategori Aktif</div>
              <div className={`${highVisibility ? 'text-4xl md:text-6xl' : 'text-3xl md:text-5xl'} mt-2 font-black tracking-tight text-white`}>
                {selectedCategoryLabel ?? 'Pilih Moto'}
              </div>
              <div className={`${highVisibility ? 'text-base sm:text-lg' : 'text-sm sm:text-base'} mt-2 font-semibold text-slate-200`}>
                {selectedMoto?.moto_name ?? 'Belum ada moto dipilih'} |{' '}
                {flags.dnf_enabled
                  ? 'Tap rider untuk finish, tahan 800ms untuk DNF.'
                  : 'Tap rider untuk finish. Modul DNF sedang nonaktif.'}
              </div>
            </div>
          </div>
        </section>

        <section className="public-panel-light">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Event LIVE</label>
              <select
                value={eventId}
                onChange={(e) => {
                  setEventId(e.target.value)
                  setSelectedMotoId('')
                }}
                className="public-filter"
              >
                {events.length === 0 && <option value="">Belum ada event LIVE</option>}
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name} - {ev.status}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Moto</label>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <select value={selectedMotoId} onChange={(e) => setSelectedMotoId(e.target.value)} className="public-filter">
                  {selectableMotos.length === 0 && <option value="">Belum ada moto aktif</option>}
                  {selectableMotos.map((m) => (
                    <option key={m.id} value={m.id} disabled={!isMotoLive(m.status)}>
                      {m.moto_order}. {m.moto_name} - {categoryLabel.get(m.category_id ?? '') ?? 'Unknown'} - {m.status}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void handleRefreshMotoSelector()}
                  disabled={saving || refreshingSelector}
                  aria-busy={refreshingSelector}
                  className={`finisher-refresh-btn ${refreshingSelector ? 'is-loading is-pressed' : ''}`}
                >
                  <span className="finisher-refresh-shadow" />
                  <span className="finisher-refresh-edge" />
                  <span className="finisher-refresh-front">
                    <span className={`finisher-refresh-icon ${refreshingSelector ? 'is-spinning' : ''}`} aria-hidden="true">
                      ↻
                    </span>
                    {refreshingSelector ? 'Memuat' : 'Refresh'}
                  </span>
                </button>
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={toggleHighVisibility}
              className={`rounded-xl border px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.08em] transition-colors ${highVisibility
                  ? 'border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200'
                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                }`}
            >
              {highVisibility ? 'Mode Besar Aktif' : 'Mode Besar'}
            </button>
          </div>
        </section>

        {events.length === 0 && (
          <section className="rounded-xl border border-amber-300 bg-amber-100 px-4 py-3 text-sm font-bold text-amber-800">
            Tidak ada event LIVE untuk Jury Finish. Set event ke LIVE dulu.
          </section>
        )}
        {events.length === 0 && (
          <div className="text-xs font-semibold text-slate-500">Admin: ubah status event ke LIVE agar Jury Finish aktif.</div>
        )}
        {motoLocked && (
          <section className="rounded-xl border border-amber-300 bg-amber-100 px-4 py-3 text-sm font-bold text-amber-800">
            MOTO LOCKED - input disabled.
          </section>
        )}
        {selectedMoto && !selectedMotoLive && (
          <section className="rounded-xl border border-amber-300 bg-amber-100 px-4 py-3 text-sm font-bold text-amber-800">
            Moto masih {selectedMoto.status}. Input hanya bisa saat LIVE.
          </section>
        )}
        {submitNotice && (
          <section
            className={`rounded-xl px-4 py-3 text-sm font-bold ${submitNotice.type === 'success'
                ? 'border border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border border-rose-300 bg-rose-50 text-rose-800'
              }`}
          >
            {submitNotice.message}
          </section>
        )}
        <section className="flex flex-wrap gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-extrabold tracking-[0.12em] ${flags.dns_enabled
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-rose-300 bg-rose-50 text-rose-800'
              }`}
          >
            DNS {flags.dns_enabled ? 'ON' : 'OFF'}
          </span>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-extrabold tracking-[0.12em] ${flags.dnf_enabled
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-rose-300 bg-rose-50 text-rose-800'
              }`}
          >
            DNF {flags.dnf_enabled ? 'ON' : 'OFF'}
          </span>
        </section>

        <div className="layout-grid">
          <section className="public-panel-light">
            <div className="mb-3 text-xs font-extrabold uppercase tracking-[0.15em] text-slate-500">Input Grid</div>
            <div className="input-grid">
              {availableRiders.map((r) => {
                return (
                  <div key={r.id} className="grid gap-2">
                    <button
                      type="button"
                      className={`finisher-rider-btn ${pressedId === r.id ? 'is-pressed' : ''
                        } ${highVisibility ? 'is-large' : ''}`}
                      onContextMenu={(event) => event.preventDefault()}
                      onPointerDown={(event) => onCardPointerDown(event, r.id)}
                      onPointerUp={(event) => onCardPointerUp(event, r.id)}
                      onPointerLeave={() => onCardPointerLeave(r.id)}
                      onPointerCancel={() => onCardPointerLeave(r.id)}
                      disabled={role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive || dnsActionRiderId === r.id}
                    >
                      <span className="finisher-rider-shadow" />
                      <span className="finisher-rider-edge" />
                      <span className="finisher-rider-front">
                        <span className="finisher-rider-plate">{r.no_plate_display}</span>
                        <span className="finisher-rider-name">{r.name}</span>
                        <span className="finisher-rider-cue">Tap = Finish</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSetDns(r)}
                      disabled={role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive || !flags.dns_enabled || dnsActionRiderId === r.id}
                      className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-extrabold uppercase tracking-[0.1em] text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {dnsActionRiderId === r.id ? 'Menyimpan DNS...' : 'Set DNS'}
                    </button>
                  </div>
                )
              })}
              {availableRiders.length === 0 && (
                <div className="col-span-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-center text-sm font-semibold text-slate-500">
                  {selectedMotoLive ? 'Tidak ada rider yang tersisa di grid.' : 'Pilih moto LIVE terlebih dahulu.'}
                </div>
              )}
            </div>
            <div className="mt-2 text-xs font-semibold text-slate-500">
              {flags.dnf_enabled ? 'Tap untuk Finish, tahan kartu 800ms untuk DNF, atau gunakan Set DNS.' : 'DNF dimatikan dari menu Penalties.'}
            </div>

            <div className="jf-actions mt-4">
              <div
                aria-live="polite"
                className={`jf-submit-progress ${allRidersHaveResult ? 'is-complete' : ''}`}
              >
                <span>Hasil rider</span>
                <strong>{completedRiderCount}/{riders.length}</strong>
                <em>{allRidersHaveResult ? 'Siap disubmit' : `${Math.max(riders.length - completedRiderCount, 0)} belum masuk hasil`}</em>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={actions.length === 0 || hasSubmitted || motoLocked}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-extrabold uppercase tracking-[0.1em] text-slate-800 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Undo Terakhir
                </button>
                <button
                  type="button"
                  onClick={handleSubmitHeat}
                  disabled={submitDisabled}
                  className="w-full rounded-xl border border-emerald-300 bg-emerald-500 px-4 py-3 text-sm font-extrabold uppercase tracking-[0.1em] text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Submitting...' : 'Submit Result'}
                </button>
              </div>
            </div>
            {selectedMotoLive && !allRidersHaveResult && (
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-700">
                Submit aktif setelah semua rider masuk hasil: Finish, DNF, DNS, atau Absent. Saat ini {completedRiderCount}/{riders.length}.
              </div>
            )}

            <details className="jf-starter-list mt-4">
              <summary>
                <span>Starter List</span>
                <span>{riders.length} rider</span>
              </summary>
              <div className="mt-3 grid gap-2">
                {riders.map((r) => {
                  const startStatus = participationByRider[r.id]
                  const status = finishOrder.includes(r.id)
                    ? 'FINISH'
                    : dnfRiders.includes(r.id)
                      ? 'DNF'
                      : startStatus === 'DNS'
                        ? 'DNS'
                        : startStatus === 'ABSENT'
                          ? 'ABSENT'
                          : 'READY'
                  const badgeClass =
                    status === 'READY'
                      ? 'border-slate-300 text-slate-700'
                      : status === 'FINISH'
                        ? 'border-emerald-300 text-emerald-800'
                        : 'border-amber-300 text-amber-800'
                  return (
                    <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                      <div className="font-semibold text-slate-700">
                        {r.no_plate_display} - {r.name}
                      </div>
                      {status !== 'READY' && (
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold tracking-[0.08em] ${badgeClass}`}>
                          {status}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </details>
          </section>

          <aside className="public-panel-light">
            <div className="mb-3 text-xs font-extrabold uppercase tracking-[0.15em] text-slate-500">Live Result</div>
            <div className="grid gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className={`${highVisibility ? 'text-xs' : 'text-[10px]'} font-extrabold uppercase tracking-[0.12em] text-slate-500`}>Finish Order</div>
                <div className="mt-2 grid gap-1.5">
                  {finishSequence.map((f) => {
                    const rider = riders.find((r) => r.id === f.id)
                    const penalty = penaltiesByRider[f.id] ?? 0
                    const penaltyBadges = penaltyBadgesByRider[f.id] ?? []
                    return (
                      <div key={f.id} className={`${highVisibility ? 'text-base' : 'text-sm'} font-semibold text-slate-700`}>
                        {f.position}. {rider?.no_plate_display} - {rider?.name}
                        {penalty ? ` (+${penalty})` : ''}
                        <PenaltyBadges items={penaltyBadges} />
                      </div>
                    )
                  })}
                  {finishSequence.length === 0 && <div className="text-sm font-semibold text-slate-500">Belum ada hasil.</div>}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className={`${highVisibility ? 'text-xs' : 'text-[10px]'} font-extrabold uppercase tracking-[0.12em] text-slate-500`}>DNF</div>
                <div className="mt-2 grid gap-1.5">
                  {dnfRiders.map((id) => {
                    const rider = riders.find((r) => r.id === id)
                    const penalty = penaltiesByRider[id] ?? 0
                    const penaltyBadges = penaltyBadgesByRider[id] ?? []
                    return (
                      <div key={id} className={`${highVisibility ? 'text-base' : 'text-sm'} font-semibold text-amber-700`}>
                        {rider?.no_plate_display} - {rider?.name}
                        {flags.dnf_progress_enabled && dnfProgressByRider[id] != null ? ` (${dnfProgressByRider[id]}%)` : ''}
                        {penalty ? ` (+${penalty})` : ''}
                        <PenaltyBadges items={penaltyBadges} />
                      </div>
                    )
                  })}
                  {dnfRiders.length === 0 && <div className="text-sm font-semibold text-slate-500">Kosong.</div>}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className={`${highVisibility ? 'text-xs' : 'text-[10px]'} font-extrabold uppercase tracking-[0.12em] text-slate-500`}>DNS / ABSENT</div>
                <div className="mt-2 grid gap-1.5">
                  {dnsRiders.map((id) => {
                    const rider = riders.find((r) => r.id === id)
                    const status = participationByRider[id] === 'ABSENT' ? 'ABSENT' : 'DNS'
                    const penalty = penaltiesByRider[id] ?? 0
                    const penaltyBadges = penaltyBadgesByRider[id] ?? []
                    const canUndoDns = Boolean(
                      rider &&
                        status === 'DNS' &&
                        role !== 'RACE_DIRECTOR' &&
                        !motoLocked &&
                        selectedMotoLive &&
                        !hasSubmitted
                    )
                    return (
                      <div key={id} className="flex flex-wrap items-center justify-between gap-2">
                        <div className={`${highVisibility ? 'text-base' : 'text-sm'} font-semibold text-rose-700`}>
                          {rider?.no_plate_display} - {rider?.name} ({status})
                          {penalty ? ` (+${penalty})` : ''}
                          <PenaltyBadges items={penaltyBadges} />
                        </div>
                        {canUndoDns && rider && (
                          <button
                            type="button"
                            onClick={() => void handleUndoDns(rider)}
                            disabled={dnsActionRiderId === rider.id}
                            className="rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-sky-800 transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {dnsActionRiderId === rider.id ? 'Memuat...' : 'Undo DNS'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                  {dnsRiders.length === 0 && <div className="text-sm font-semibold text-slate-500">Kosong.</div>}
                </div>
              </div>

            </div>
          </aside>
        </div>

        {dnfProgressRiderId && (
          <div className="fixed inset-0 z-[81] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="dnf-progress-title">
            <section className="w-full max-w-sm rounded-2xl border border-amber-200 bg-white p-5 shadow-2xl">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-amber-700">DNF Berdasarkan Progres Trek</p>
              <h2 id="dnf-progress-title" className="mt-2 text-xl font-black text-slate-900">
                {riders.find((rider) => rider.id === dnfProgressRiderId)?.no_plate_display} - {riders.find((rider) => rider.id === dnfProgressRiderId)?.name}
              </h2>
              <label className="mt-5 grid gap-2 text-sm font-bold text-slate-700">
                Progres saat DNF (0-100%)
                <input
                  autoFocus
                  inputMode="decimal"
                  min="0"
                  max="100"
                  step="0.01"
                  type="number"
                  value={dnfProgressDraft}
                  onChange={(event) => setDnfProgressDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleConfirmDNFProgress()
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-lg font-black text-slate-900 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                  placeholder="Contoh: 75"
                />
              </label>
              <p className="mt-3 text-sm text-slate-500">Progres lebih jauh akan mendapat urutan DNF dan point lebih baik.</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setDnfProgressRiderId(null)} className="rounded-xl border border-slate-300 px-3 py-3 text-sm font-extrabold text-slate-700">
                  Batal
                </button>
                <button type="button" onClick={handleConfirmDNFProgress} className="rounded-xl bg-amber-500 px-3 py-3 text-sm font-extrabold text-slate-950 shadow-sm hover:bg-amber-400">
                  Simpan DNF
                </button>
              </div>
            </section>
          </div>
        )}

        {submittedMotoNotice && (
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="submitted-moto-title"
          >
            <section className="w-full max-w-md rounded-2xl border border-emerald-200 bg-white p-6 text-center shadow-2xl">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-3xl font-black text-emerald-700">
                OK
              </div>
              <p className="mt-4 text-xs font-extrabold uppercase tracking-[0.16em] text-emerald-700">Hasil Tersimpan</p>
              <h2 id="submitted-moto-title" className="mt-2 text-2xl font-black text-slate-900">
                Result telah disubmit
              </h2>
              <p className="mt-3 text-sm font-semibold text-slate-600">
                {submittedMotoNotice.category} | {submittedMotoNotice.motoName}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Status moto sekarang PROVISIONAL. Tekan OK untuk memperbarui moto yang ditampilkan.
              </p>
              <button
                type="button"
                onClick={() => void handleSubmittedMotoNoticeClose()}
                className="mt-6 w-full rounded-xl border border-emerald-300 bg-emerald-500 px-4 py-3 text-sm font-extrabold uppercase tracking-[0.1em] text-white transition-colors hover:bg-emerald-400"
              >
                OK
              </button>
            </section>
          </div>
        )}
        {saving && (
          <div
            className="fixed inset-0 z-[79] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm"
            role="status"
            aria-live="polite"
          >
            <div className="grid w-full max-w-sm gap-3">
              <LoadingState label="Menyimpan hasil moto..." />
              <p className="text-center text-sm font-bold text-white">
                Menyimpan urutan finish dan menyiapkan alur moto berikutnya.
              </p>
            </div>
          </div>
        )}
      </main>
      <style jsx>{`
        .layout-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: 1fr;
        }
        .input-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px 12px;
          padding-top: 8px;
        }
        .finisher-refresh-btn {
          position: relative;
          min-width: 118px;
          min-height: 48px;
          padding: 0;
          border: 0;
          background: transparent;
          cursor: pointer;
          outline-offset: 4px;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }
        .finisher-refresh-shadow,
        .finisher-refresh-edge {
          position: absolute;
          inset: 0;
          border-radius: 12px;
          pointer-events: none;
        }
        .finisher-refresh-shadow {
          background: rgba(15, 23, 42, 0.2);
          filter: blur(3px);
          transform: translateY(4px);
          transition: transform 120ms ease, filter 120ms ease;
        }
        .finisher-refresh-edge {
          background: linear-gradient(to left, hsl(217, 33%, 34%), hsl(217, 33%, 48%), hsl(217, 33%, 34%));
        }
        .finisher-refresh-front {
          position: relative;
          display: inline-flex;
          min-height: 48px;
          width: 100%;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 0 14px;
          border-radius: 12px;
          background: hsl(217, 70%, 62%);
          color: white;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.24);
          box-shadow: inset 0 2px 3px rgba(255, 255, 255, 0.42), inset 0 -2px 3px rgba(0, 0, 0, 0.16);
          transform: translateY(-5px);
          transition: transform 110ms cubic-bezier(0.3, 0.7, 0.4, 1), background-color 150ms ease;
        }
        .finisher-refresh-btn:hover:not(:disabled) .finisher-refresh-front {
          transform: translateY(-7px);
          background: hsl(217, 70%, 67%);
        }
        .finisher-refresh-btn:hover:not(:disabled) .finisher-refresh-shadow {
          transform: translateY(6px);
          filter: blur(5px);
        }
        .finisher-refresh-btn.is-pressed .finisher-refresh-front,
        .finisher-refresh-btn:active:not(:disabled) .finisher-refresh-front {
          transform: translateY(-1px);
          transition-duration: 45ms;
        }
        .finisher-refresh-btn.is-pressed .finisher-refresh-shadow,
        .finisher-refresh-btn:active:not(:disabled) .finisher-refresh-shadow {
          transform: translateY(1px);
          filter: blur(1px);
          transition-duration: 45ms;
        }
        .finisher-refresh-btn:disabled {
          cursor: wait;
          opacity: 0.82;
        }
        .finisher-refresh-btn:focus-visible {
          outline: 3px solid rgba(59, 130, 246, 0.45);
          border-radius: 12px;
        }
        .finisher-refresh-icon {
          display: inline-flex;
          font-size: 18px;
          line-height: 1;
        }
        .finisher-refresh-icon.is-spinning {
          animation: finisher-refresh-spin 0.8s linear infinite;
        }
        @keyframes finisher-refresh-spin {
          to { transform: rotate(360deg); }
        }
        .finisher-rider-btn {
          position: relative;
          min-width: 0;
          min-height: 120px;
          padding: 0;
          border: 0;
          background: transparent;
          cursor: pointer;
          outline-offset: 4px;
          -webkit-tap-highlight-color: transparent;
          -webkit-touch-callout: none;
          touch-action: manipulation;
          user-select: none;
          -webkit-user-select: none;
        }
        .finisher-rider-btn.is-large {
          min-height: 144px;
        }
        .finisher-rider-shadow,
        .finisher-rider-edge {
          position: absolute;
          inset: 0;
          border-radius: 16px;
          pointer-events: none;
        }
        .finisher-rider-shadow {
          background: rgba(15, 23, 42, 0.2);
          filter: blur(5px);
          transform: translateY(6px);
          transition: transform 120ms ease, filter 120ms ease;
          will-change: transform;
        }
        .finisher-rider-edge {
          background: linear-gradient(
            to left,
            hsl(222, 47%, 24%) 0%,
            hsl(217, 33%, 38%) 12%,
            hsl(217, 33%, 38%) 88%,
            hsl(222, 47%, 24%) 100%
          );
        }
        .finisher-rider-front {
          position: relative;
          display: flex;
          min-height: 120px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 14px 10px;
          border-radius: 16px;
          background: hsl(217, 70%, 62%);
          box-shadow:
            inset 0 2px 3px rgba(255, 255, 255, 0.42),
            inset 0 -2px 3px rgba(0, 0, 0, 0.16);
          color: white;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.24);
          transform: translateY(-7px);
          transition: transform 110ms cubic-bezier(0.3, 0.7, 0.4, 1), background-color 150ms ease;
          will-change: transform;
        }
        .finisher-rider-btn.is-large .finisher-rider-front {
          min-height: 144px;
        }
        .finisher-rider-btn:hover:not(:disabled) .finisher-rider-front {
          transform: translateY(-9px);
        }
        .finisher-rider-btn:hover:not(:disabled) .finisher-rider-shadow {
          filter: blur(7px);
          transform: translateY(9px);
        }
        .finisher-rider-btn.is-pressed .finisher-rider-front,
        .finisher-rider-btn:active:not(:disabled) .finisher-rider-front {
          transform: translateY(-2px);
          transition-duration: 45ms;
        }
        .finisher-rider-btn.is-pressed .finisher-rider-shadow,
        .finisher-rider-btn:active:not(:disabled) .finisher-rider-shadow {
          filter: blur(2px);
          transform: translateY(2px);
          transition-duration: 45ms;
        }
        .finisher-rider-btn:focus-visible {
          outline: 4px solid rgba(59, 130, 246, 0.45);
          border-radius: 16px;
        }
        .finisher-rider-btn:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }
        .finisher-rider-plate {
          font-size: 44px;
          font-weight: 950;
          line-height: 1;
          letter-spacing: 0.5px;
        }
        .finisher-rider-name {
          margin-top: 7px;
          max-width: 100%;
          overflow-wrap: anywhere;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.2;
          text-align: center;
        }
        .finisher-rider-cue {
          margin-top: 10px;
          border: 1px solid rgba(255, 255, 255, 0.45);
          border-radius: 999px;
          padding: 3px 9px;
          background: rgba(15, 23, 42, 0.18);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .finisher-rider-btn.is-large .finisher-rider-plate {
          font-size: 56px;
        }
        .finisher-rider-btn.is-large .finisher-rider-name {
          font-size: 14px;
        }
        .jf-actions {
          background: rgba(241, 245, 249, 0.94);
          padding: 10px;
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
        }
        .jf-submit-progress {
          display: grid;
          grid-template-columns: auto auto 1fr;
          align-items: center;
          gap: 8px;
          border: 1px solid rgba(245, 158, 11, 0.45);
          border-radius: 12px;
          padding: 10px 12px;
          background: #fffbeb;
          color: #92400e;
          font-size: 12px;
          font-weight: 800;
        }
        .jf-submit-progress strong {
          font-size: 20px;
          line-height: 1;
        }
        .jf-submit-progress em {
          justify-self: end;
          font-size: 11px;
          font-style: normal;
          text-align: right;
        }
        .jf-submit-progress.is-complete {
          border-color: rgba(16, 185, 129, 0.45);
          background: #ecfdf5;
          color: #065f46;
        }
        .jf-starter-list {
          border-top: 1px dashed #cbd5e1;
          padding-top: 14px;
        }
        .jf-starter-list summary {
          display: flex;
          cursor: pointer;
          list-style: none;
          align-items: center;
          justify-content: space-between;
          color: #64748b;
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .jf-starter-list summary::-webkit-details-marker {
          display: none;
        }
        .jf-starter-list summary span:last-child {
          border: 1px solid #cbd5e1;
          border-radius: 999px;
          padding: 3px 8px;
          color: #334155;
          font-size: 10px;
          letter-spacing: 0.06em;
        }
        @media (min-width: 1280px) {
          .layout-grid {
            grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
          }
          .input-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (max-width: 640px) {
          .jf-actions {
            padding: 8px;
            flex-direction: column;
          }
          .jf-actions > button {
            width: 100%;
          }
          .jf-submit-progress {
            grid-template-columns: auto auto;
          }
          .jf-submit-progress em {
            grid-column: 1 / -1;
            justify-self: start;
            text-align: left;
          }
          .finisher-rider-btn,
          .finisher-rider-front {
            min-height: 136px;
          }
          .finisher-rider-plate {
            font-size: 48px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .finisher-rider-front,
          .finisher-rider-shadow {
            transition: none;
          }
        }
      `}</style>
    </div>
  )
}
