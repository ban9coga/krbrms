'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import CheckerTopbar from '../../../../components/CheckerTopbar'
import LoadingState from '../../../../components/LoadingState'
import { useHighVisibility } from '../../../../hooks/useHighVisibility'
import { buildCategoryBaseOrder, compareMotoWorkflowSequence } from '../../../../lib/motoSequence'
import { useApiFetch } from '@/src/hooks/useApiFetch'
import { isMotoLive, isMotoReady, isMotoUpcoming } from '../../../../lib/motoStatus'
import { usePageVisibility } from '../../../../lib/usePageVisibility'
import { useEventRaceRealtime } from '@/src/hooks/useEventRaceRealtime'


type CategoryItem = {
  id: string
  label: string
  year?: number | null
  gender?: 'BOY' | 'GIRL' | 'MIX'
}

type MotoItem = {
  id: string
  moto_name: string
  moto_order: number
  status: string
  category_id?: string
  checker_prep_ready_at?: string | null
}

type MotoReadyConfirmation = {
  categoryLabel: string
  motoName: string
  status: 'READY' | 'LIVE'
}

const getStageWaitCopy = (motoName: string, status: string) => {
  if (status === 'PROTEST_REVIEW') {
    return {
      title: 'Menunggu Review Protes',
      detail: 'Hasil stage ini sedang dalam review. Moto prep berikutnya muncul setelah review selesai.',
    }
  }
  if (/^moto\s*\d+/i.test(motoName)) {
    return { title: 'Menunggu Hasil Kualifikasi Dihitung', detail: 'Sistem sedang menghitung hasil kualifikasi dan menyusun babak berikutnya.' }
  }
  if (/^repechage/i.test(motoName)) {
    return { title: 'Menunggu Hasil Repechage Dihitung', detail: 'Sistem sedang menentukan rider yang lanjut dari Repechage ke babak berikutnya.' }
  }
  if (/^quarter final/i.test(motoName)) {
    return { title: 'Menunggu Hasil Quarter Final Dihitung', detail: 'Sistem sedang menentukan rider yang lanjut dari Quarter Final ke babak berikutnya.' }
  }
  if (/^semi final/i.test(motoName)) {
    return { title: 'Menunggu Hasil Semi Final Dihitung', detail: 'Sistem sedang menentukan rider yang lanjut dari Semi Final ke final.' }
  }
  return { title: 'Menunggu Hasil Stage Dihitung', detail: 'Sistem sedang menyusun moto berikutnya untuk kategori ini.' }
}

type RiderItem = {
  id: string
  name: string
  no_plate_display: string
  gate_position?: number | null
  dq_reason?: string | null
}

type StatusRow = {
  rider_id: string
  participation_status: 'ACTIVE' | 'DNS' | 'DNF' | 'ABSENT'
  registration_order: number
  status_source_role?: string | null
  status_source_label?: string | null
  status_updated_at?: string | null
}

type EventFlags = {
  penalty_enabled: boolean
  absent_enabled: boolean
  dns_enabled: boolean
  dnf_enabled: boolean
}

const isLockedStatus = (status?: string | null) => String(status ?? '').toUpperCase() === 'LOCKED'
const isPrepMotoStatus = (status?: string | null) => isMotoUpcoming(status) || isMotoReady(status)

const isCategoryAwaitingStageCompute = (list: MotoItem[], categoryId?: string | null) => {
  if (!categoryId) return false
  const categoryMotos = list.filter((moto) => moto.category_id === categoryId)
  const nonFinalMotos = categoryMotos.filter((moto) => !/^FINAL\s+/i.test(moto.moto_name))
  if (nonFinalMotos.length === 0) return false

  // A category is only allowed to release the workflow after at least one
  // Final has been generated. Before that, locked Repechage/QF/Semi results
  // still need a compute step and must not send Checker to another category.
  const hasFinalMoto = categoryMotos.some((moto) => /^FINAL\s+/i.test(moto.moto_name))
  if (hasFinalMoto) return false

  const hasPrepOrActiveMoto = categoryMotos.some((moto) => {
    const status = String(moto.status ?? '').toUpperCase()
    return isPrepMotoStatus(status) || status === 'LIVE' || status === 'PROVISIONAL' || status === 'PROTEST_REVIEW'
  })
  if (hasPrepOrActiveMoto) return false

  return nonFinalMotos.every((moto) => isLockedStatus(moto.status))
}

const isCategoryUnfinished = (list: MotoItem[], categoryId?: string | null) => {
  if (!categoryId) return false
  const categoryMotos = list.filter((m) => m.category_id === categoryId)
  if (categoryMotos.length === 0) return false

  const hasActiveOrProvisional = categoryMotos.some((m) => {
    const s = String(m.status ?? '').toUpperCase()
    return s === 'LIVE' || s === 'PROVISIONAL' || s === 'PROTEST_REVIEW'
  })
  if (hasActiveOrProvisional) return true

  if (isCategoryAwaitingStageCompute(list, categoryId)) return true

  return categoryMotos.some((m) => {
    const s = String(m.status ?? '').toUpperCase()
    return s !== 'LOCKED' && s !== 'FINISHED'
  })
}

const pickActiveWorkflowCategoryId = (list: MotoItem[]) => {
  for (const moto of list) {
    if (moto.category_id && isCategoryUnfinished(list, moto.category_id)) return moto.category_id
  }
  return null
}

const pickUpcomingMoto = (list: MotoItem[], anchorMoto?: MotoItem | null) => {
  const selectableUpcoming = list.filter((m) => !isLockedStatus(m.status) && isPrepMotoStatus(m.status))
  if (!anchorMoto) return selectableUpcoming[0] ?? null

  const anchorIndex = list.findIndex((m) => m.id === anchorMoto.id)
  const afterAnchor = anchorIndex >= 0 ? list.slice(anchorIndex + 1) : list
  const sameCategory = (m: MotoItem) => Boolean(anchorMoto.category_id) && m.category_id === anchorMoto.category_id

  const sameCategoryNext =
    afterAnchor.find((m) => sameCategory(m) && !isLockedStatus(m.status) && isPrepMotoStatus(m.status)) ??
    selectableUpcoming.find(sameCategory)

  if (sameCategoryNext) return sameCategoryNext

  if (isCategoryUnfinished(list, anchorMoto.category_id)) {
    return null
  }

  return (
    afterAnchor.find((m) => !isLockedStatus(m.status) && isPrepMotoStatus(m.status)) ??
    selectableUpcoming[0] ??
    null
  )
}

const pickPrepMotoId = (
  list: MotoItem[],
  currentId: string,
  liveMotoId?: string | null,
  currentPrepFinalized = false
) => {
  if (liveMotoId) {
    const liveMoto = list.find((m) => m.id === liveMotoId)
    const nextAfterLive = pickUpcomingMoto(list, liveMoto)
    if (nextAfterLive) return nextAfterLive.id
    if (liveMoto && isCategoryUnfinished(list, liveMoto.category_id)) {
      return liveMoto.id
    }
  }

  // Stage motos are created with a high raw moto_order after compute. Keep the
  // checker on the earliest unfinished category instead of retaining a prep
  // moto from the next category that happened to be selected beforehand.
  const activeCategoryId = pickActiveWorkflowCategoryId(list)
  if (activeCategoryId) {
    const currentMoto = list.find((m) => m.id === currentId)
    if (
      currentMoto?.category_id === activeCategoryId &&
      !isLockedStatus(currentMoto.status) &&
      isPrepMotoStatus(currentMoto.status) &&
      !currentPrepFinalized
    ) {
      return currentId
    }

    const activePrepMoto = list.find(
      (m) => m.category_id === activeCategoryId && !isLockedStatus(m.status) && isPrepMotoStatus(m.status)
    )
    if (activePrepMoto) return activePrepMoto.id

    if (isCategoryAwaitingStageCompute(list, activeCategoryId)) return ''
  }

  if (currentId) {
    const currentMoto = list.find((m) => m.id === currentId)
    if (currentMoto) {
      if (!isLockedStatus(currentMoto.status) && isPrepMotoStatus(currentMoto.status) && !currentPrepFinalized) {
        return currentId
      }
      if (isCategoryUnfinished(list, currentMoto.category_id)) {
        return currentId
      }
    }
  }

  return pickUpcomingMoto(list)?.id ?? ''
}

type SafetyRequirement = {
  id: string
  label: string
  is_required: boolean
  sort_order?: number | null
  penalty_code?: string | null
  icon_key?: string | null
}

type SafetyCheckPayload = {
  rider_id: string
  requirement_id: string
  is_checked: boolean
}

const SAFETY_ICON_OPTIONS = [
  { key: 'helmet', icon: '⛑', shortLabel: 'Helm' },
  { key: 'gloves', icon: '🧤', shortLabel: 'Gloves' },
  { key: 'elbow', icon: '💪', shortLabel: 'Siku' },
  { key: 'knee', icon: '🦵', shortLabel: 'Lutut' },
  { key: 'jersey', icon: '👕', shortLabel: 'Jersey' },
  { key: 'shoes', icon: '👟', shortLabel: 'Sepatu' },
  { key: 'pants', icon: '🩳', shortLabel: 'Celana' },
]

function getSafetyVisual(label: string, iconKey?: string | null) {
  if (iconKey) {
    const matched = SAFETY_ICON_OPTIONS.find((option) => option.key === iconKey)
    if (matched) return matched
  }

  const normalized = label.toLowerCase()

  if (normalized.includes('helm') || normalized.includes('helmet')) {
    return SAFETY_ICON_OPTIONS[0]
  }
  if (normalized.includes('sarung tangan') || normalized.includes('glove') || normalized.includes('gloves')) {
    return SAFETY_ICON_OPTIONS[1]
  }
  if (normalized.includes('siku') || normalized.includes('elbow')) {
    return SAFETY_ICON_OPTIONS[2]
  }
  if (normalized.includes('lutut') || normalized.includes('knee')) {
    return SAFETY_ICON_OPTIONS[3]
  }
  if (normalized.includes('jersey')) {
    return SAFETY_ICON_OPTIONS[4]
  }
  if (normalized.includes('sepatu') || normalized.includes('shoe')) {
    return SAFETY_ICON_OPTIONS[5]
  }
  if (normalized.includes('celana') || normalized.includes('pants')) {
    return SAFETY_ICON_OPTIONS[6]
  }

  return { icon: '✓', shortLabel: label }
}

const buildStatusMap = (
  statusList: Array<{
    rider_id: string
    proposed_status?: string | null
    status_source_role?: string | null
    status_source_label?: string | null
    status_updated_at?: string | null
  }>
) => {
  const nextStatuses: Record<string, StatusRow> = {}
  for (const row of statusList) {
    if (row.proposed_status) {
      nextStatuses[row.rider_id] = {
        rider_id: row.rider_id,
        participation_status: row.proposed_status as StatusRow['participation_status'],
        registration_order: 0,
        status_source_role: row.status_source_role ?? null,
        status_source_label: row.status_source_label ?? null,
        status_updated_at: row.status_updated_at ?? null,
      }
    }
  }
  return nextStatuses
}

export default function JCPage() {
  const isPageVisible = usePageVisibility()
  const apiFetch = useApiFetch()
  const params = useParams()
  const eventId = String(params?.eventId ?? '')
  const initialMotoId = String(params?.motoId ?? '')

  const [motos, setMotos] = useState<MotoItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [selectedMotoId, setSelectedMotoId] = useState(initialMotoId)
  const selectedMotoIdRef = useRef(initialMotoId)
  const manualSelectRef = useRef(false)
  const [riders, setRiders] = useState<RiderItem[]>([])
  const [prepDqRiders, setPrepDqRiders] = useState<RiderItem[]>([])
  const [statuses, setStatuses] = useState<Record<string, StatusRow>>({})
  const [incidentRiders, setIncidentRiders] = useState<RiderItem[]>([])
  const [incidentStatuses, setIncidentStatuses] = useState<Record<string, StatusRow>>({})
  const [flags, setFlags] = useState<EventFlags>({
    penalty_enabled: true,
    absent_enabled: true,
    dns_enabled: true,
    dnf_enabled: true,
  })
  const [loading, setLoading] = useState(false)
  const initialLoadDone = useRef(false)
  const [saving, setSaving] = useState(false)
  const [locked, setLocked] = useState(false)
  const [incidentLocked, setIncidentLocked] = useState(false)
  const [query, setQuery] = useState('')
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [incidentLastUpdated, setIncidentLastUpdated] = useState<string | null>(null)
  const [safetyRequirements, setSafetyRequirements] = useState<SafetyRequirement[]>([])
  const [safetyChecks, setSafetyChecks] = useState<Record<string, Record<string, boolean>>>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const [allReadyDone, setAllReadyDone] = useState(false)
  const [motoReadySaving, setMotoReadySaving] = useState(false)
  const [motoReadyConfirmation, setMotoReadyConfirmation] = useState<MotoReadyConfirmation | null>(null)
  const [bulkReadyState, setBulkReadyState] = useState<{
    motoId: string
    changedStatuses: Record<string, StatusRow | null>
  } | null>(null)
  const [viewportWidth, setViewportWidth] = useState(1280)
  const { highVisibility, toggleHighVisibility } = useHighVisibility('jury-checker-high-visibility')
  const localMutationRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const updateViewportWidth = () => setViewportWidth(window.innerWidth)
    updateViewportWidth()
    window.addEventListener('resize', updateViewportWidth)
    return () => window.removeEventListener('resize', updateViewportWidth)
  }, [])

  const syncPrepMotoUrl = useCallback(
    (motoId: string) => {
      if (!motoId || typeof window === 'undefined') return
      const nextPath = `/jc/${eventId}/${motoId}`
      if (window.location.pathname === nextPath) return
      window.history.replaceState(window.history.state, '', nextPath)
    },
    [eventId]
  )

  useEffect(() => {
    selectedMotoIdRef.current = selectedMotoId
    setRiders([])
    setStatuses({})
    setLastUpdated(null)
  }, [selectedMotoId])

  const loadStaticConfig = useCallback(async () => {
    if (!eventId) return
    const [catRes, flagRes] = await Promise.all([
      fetch(`/api/events/${eventId}/categories`),
      apiFetch(`/api/jury/events/${eventId}/modules`),
    ])
    const catJson = await catRes.json()
    setCategories((catJson.data ?? []) as CategoryItem[])
    setFlags(
      flagRes.data ?? {
        penalty_enabled: true,
        absent_enabled: true,
        dns_enabled: true,
        dnf_enabled: true,
      }
    )
  }, [apiFetch, eventId])

  const loadMotos = useCallback(async (silent = false) => {
    if (!eventId) return
    if (!silent) setLoading(true)
    if (!silent) setErrorMessage(null)
    try {
      const motoJson = await apiFetch(`/api/jury/events/${eventId}/moto-state`)

      const rawMotos = (motoJson.data ?? []) as MotoItem[]
      const categoryBaseOrder = buildCategoryBaseOrder(rawMotos)
      const workflowMotos = [...rawMotos].sort((a, b) => compareMotoWorkflowSequence(a, b, categoryBaseOrder))
      setMotos(workflowMotos)

      // Skip auto-navigation if user just manually selected a moto from dropdown
      if (manualSelectRef.current) {
        manualSelectRef.current = false
        return workflowMotos
      }

      const currentSelectedMotoId = selectedMotoIdRef.current
      const liveMoto = workflowMotos.find((m) => isMotoLive(m.status))
      const nextMotoId = pickPrepMotoId(workflowMotos, currentSelectedMotoId, liveMoto?.id ?? null, allReadyDone)
      if (nextMotoId && nextMotoId !== currentSelectedMotoId) {
        const nextMoto = workflowMotos.find((m) => m.id === nextMotoId)
        selectedMotoIdRef.current = nextMotoId
        setSelectedMotoId(nextMotoId)
        setAllReadyDone(Boolean(nextMoto?.checker_prep_ready_at))
        setBulkReadyState(null)
        syncPrepMotoUrl(nextMotoId)
      }
      if (nextMotoId && nextMotoId === currentSelectedMotoId) {
        const currentMoto = workflowMotos.find((m) => m.id === nextMotoId)
        setAllReadyDone(Boolean(currentMoto?.checker_prep_ready_at))
      }
      if (!nextMotoId && currentSelectedMotoId) {
        selectedMotoIdRef.current = ''
        setSelectedMotoId('')
        setRiders([])
        setPrepDqRiders([])
        setStatuses({})
        setAllReadyDone(false)
        setBulkReadyState(null)
      }
      return workflowMotos
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal memuat data JC.')
    } finally {
      if (!silent) setLoading(false)
    }
    return []
  }, [allReadyDone, apiFetch, eventId, syncPrepMotoUrl])

  useEffect(() => {
    void loadStaticConfig().catch((err: unknown) => {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal memuat konfigurasi checker.')
    })
  }, [loadStaticConfig])

  const incidentMoto = useMemo(() => motos.find((m) => isMotoLive(m.status)) ?? null, [motos])
  const incidentMotoId = incidentMoto?.id ?? ''

  const loadMoto = useCallback(async (silent = false, preserveAllReadyDone = silent) => {
    const targetMotoId = selectedMotoIdRef.current
    if (!targetMotoId || !eventId) {
      setLocked(false)
      setRiders([])
      setStatuses({})
      setLastUpdated(null)
      return
    }
    if (!preserveAllReadyDone) setAllReadyDone(false)
    if (!silent) setLoading(true)
    if (!silent) setErrorMessage(null)
    try {
      const targetMoto = motos.find((m) => m.id === targetMotoId)
      const isMotoLocked = targetMoto ? targetMoto.status === 'LOCKED' : false
      // Update allReadyDone based on the moto's actual checker_prep_ready_at state
      if (targetMoto && !isMotoLocked) {
        setAllReadyDone(Boolean(targetMoto.checker_prep_ready_at))
      }
      
      const [riderRes, statusRes, safetyRes] = await Promise.all([
        apiFetch(`/api/jury/motos/${targetMotoId}/riders`),
        apiFetch(`/api/jury/events/${eventId}/rider-status?moto_id=${targetMotoId}`),
        apiFetch(`/api/jury/motos/${targetMotoId}/safety-checks`),
      ])

      if (selectedMotoIdRef.current !== targetMotoId) return
      setLocked(isMotoLocked)
      if (isMotoLocked) {
        setRiders([])
        setStatuses({})
        setLastUpdated(null)
        await loadMotos(true)
        return
      }
      // Stable-reference update: only replace riders if data actually changed
      const newRiders = (riderRes.data ?? []) as RiderItem[]
      setPrepDqRiders((riderRes.dq_riders ?? []) as RiderItem[])
      setRiders((prev) => {
        if (prev.length === newRiders.length && prev.every((r, i) => r.id === newRiders[i]?.id)) return prev
        return newRiders
      })

      const statusList = (statusRes.data ?? []) as Array<{
        rider_id: string
        proposed_status?: string | null
        status_source_role?: string | null
        status_source_label?: string | null
        status_updated_at?: string | null
      }>
      // Stable-reference update: only replace statuses if data actually changed
      const newStatuses = buildStatusMap(statusList)
      setStatuses((prev) => {
        const prevKeys = Object.keys(prev)
        const nextKeys = Object.keys(newStatuses)
        if (prevKeys.length !== nextKeys.length) return newStatuses
        for (const key of nextKeys) {
          if (
            prev[key]?.participation_status !== newStatuses[key]?.participation_status ||
            prev[key]?.status_source_role !== newStatuses[key]?.status_source_role ||
            prev[key]?.status_source_label !== newStatuses[key]?.status_source_label
          ) return newStatuses
        }
        return prev
      })

      const rawRequirements = (safetyRes.data?.requirements ?? []) as SafetyRequirement[]
      const uniqueSafety = new Map<string, SafetyRequirement>()
      for (const item of rawRequirements) {
        const key = item.label.trim().toLowerCase()
        if (!uniqueSafety.has(key)) uniqueSafety.set(key, item)
      }
      const requirements = Array.from(uniqueSafety.values())
      const checks = (safetyRes.data?.checks ?? []) as Array<{
        rider_id: string
        requirement_id: string
        is_checked: boolean
      }>
      if (requirements.length > 0) setSafetyRequirements(requirements)
      setSafetyChecks((prev) => {
        const next = { ...prev }
        for (const rider of (riderRes.data ?? []) as RiderItem[]) {
          const current = next[rider.id] ?? {}
          const updated: Record<string, boolean> = { ...current }
          for (const item of requirements) {
            if (typeof updated[item.id] !== 'boolean') updated[item.id] = true
          }
          next[rider.id] = updated
        }
        for (const row of checks) {
          const current = next[row.rider_id] ?? {}
          next[row.rider_id] = { ...current, [row.requirement_id]: row.is_checked }
        }
        return next
      })
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (err: unknown) {
      if (!silent) {
        setErrorMessage(err instanceof Error ? err.message : 'Gagal memuat data moto.')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [apiFetch, eventId, motos, loadMotos])



  const loadIncidentMoto = useCallback(async (silent = false) => {
    if (!incidentMotoId || !eventId) {
      setIncidentLocked(false)
      setIncidentRiders([])
      setIncidentStatuses({})
      setIncidentLastUpdated(null)
      return
    }
    if (!silent) setErrorMessage(null)
    try {
      const [lockRes, riderRes, statusRes] = await Promise.all([
        apiFetch(`/api/jury/motos/${incidentMotoId}/lock-status`),
        apiFetch(`/api/jury/motos/${incidentMotoId}/riders`),
        apiFetch(`/api/jury/events/${eventId}/rider-status?moto_id=${incidentMotoId}`),
      ])

      setIncidentLocked(!!lockRes.data)
      if (lockRes.data) {
        await loadMotos(true)
        return
      }
      setIncidentRiders((riderRes.data ?? []) as RiderItem[])

      const statusList = (statusRes.data ?? []) as Array<{
        rider_id: string
        proposed_status?: string | null
        status_source_role?: string | null
        status_source_label?: string | null
        status_updated_at?: string | null
      }>
      setIncidentStatuses(buildStatusMap(statusList))
      setIncidentLastUpdated(new Date().toLocaleTimeString())
    } catch (err: unknown) {
      if (!silent) {
        setErrorMessage(err instanceof Error ? err.message : 'Gagal memuat incident moto LIVE.')
      }
    }
  }, [apiFetch, eventId, incidentMotoId, loadMotos])

  const refreshCheckerPollingState = useCallback(
    async (prepMotoId: string, activeIncidentMotoId: string) => {
      if (!eventId) return
      const params = new URLSearchParams()
      if (prepMotoId) params.set('prep_moto_id', prepMotoId)
      if (activeIncidentMotoId) params.set('incident_moto_id', activeIncidentMotoId)
      const response = await apiFetch(`/api/jury/events/${eventId}/checker-poll?${params.toString()}`)

      if (prepMotoId && response.prep?.moto_id === prepMotoId && selectedMotoIdRef.current === prepMotoId) {
        const nextStatuses = buildStatusMap(response.prep.statuses ?? [])
        setStatuses(nextStatuses)

        const checks = response.prep.checks ?? []
        setSafetyChecks((previous) => {
          const next = { ...previous }
          for (const rider of riders) {
            const riderChecks = { ...(next[rider.id] ?? {}) }
            for (const requirement of safetyRequirements) {
              if (typeof riderChecks[requirement.id] !== 'boolean') riderChecks[requirement.id] = true
            }
            next[rider.id] = riderChecks
          }
          for (const row of checks) {
            next[row.rider_id] = { ...(next[row.rider_id] ?? {}), [row.requirement_id]: row.is_checked }
          }
          return next
        })
        setLastUpdated(new Date().toLocaleTimeString())
      }

      if (activeIncidentMotoId && response.incident?.moto_id === activeIncidentMotoId) {
        setIncidentLocked(Boolean(response.incident.locked))
        setIncidentStatuses(buildStatusMap(response.incident.statuses ?? []))
        setIncidentLastUpdated(new Date().toLocaleTimeString())
      }
    },
    [apiFetch, eventId, riders, safetyRequirements]
  )

  const refreshFromRealtime = useCallback(async () => {
    if (saving || motoReadySaving || localMutationRef.current) return

    try {
      const workflowMotos = (await loadMotos(true)) ?? []
      const liveMotoId = workflowMotos.find((moto) => isMotoLive(moto.status))?.id ?? ''
      const prepMotoId = pickPrepMotoId(workflowMotos, selectedMotoIdRef.current, liveMotoId, allReadyDone)
      await refreshCheckerPollingState(prepMotoId, liveMotoId)
    } catch {
      // The 15-second polling loop remains the fallback if Realtime fails.
    }
  }, [allReadyDone, loadMotos, motoReadySaving, refreshCheckerPollingState, saving])

  useEventRaceRealtime({
    eventId,
    enabled: isPageVisible,
    onRaceStateChanged: refreshFromRealtime,
  })

  // Initial load — only runs once per moto selection
  useEffect(() => {
    if (!eventId) return
    initialLoadDone.current = false
    void loadMotos(false).finally(() => {
      initialLoadDone.current = true
    })
  }, [eventId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!eventId || !selectedMotoId) return
    void loadMoto(false, true)
  }, [eventId, selectedMotoId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!eventId || !incidentMotoId) return
    void loadIncidentMoto(true)
  }, [eventId, incidentMotoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Background polling — always silent, never shows Loading
  useEffect(() => {
    if (!eventId || !isPageVisible) return

    const interval = setInterval(() => {
      void (async () => {
        const workflowMotos = (await loadMotos(true)) ?? []
        const liveMotoId = workflowMotos.find((moto) => isMotoLive(moto.status))?.id ?? ''
        const prepMotoId = pickPrepMotoId(workflowMotos, selectedMotoIdRef.current, liveMotoId, allReadyDone)
        await refreshCheckerPollingState(prepMotoId, liveMotoId)
      })()
    }, 15000)

    return () => clearInterval(interval)
  }, [allReadyDone, eventId, isPageVisible, loadMotos, refreshCheckerPollingState])

  useEffect(() => {
    setSafetyChecks((prev) => {
      const next = { ...prev }
      for (const rider of riders) {
        const current = next[rider.id] ?? {}
        const updated: Record<string, boolean> = { ...current }
        for (const item of safetyRequirements) {
          if (typeof updated[item.id] !== 'boolean') updated[item.id] = true
        }
        next[rider.id] = updated
      }
      return next
    })
  }, [riders, safetyRequirements])

  const categoryLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) map.set(c.id, c.label)
    return map
  }, [categories])

  const selectedMoto = useMemo(() => motos.find((m) => m.id === selectedMotoId) ?? null, [motos, selectedMotoId])
  const workflowPrepMotoId = useMemo(
    () => pickPrepMotoId(motos, selectedMotoId, incidentMotoId, allReadyDone),
    [allReadyDone, incidentMotoId, motos, selectedMotoId]
  )
  const workflowPrepMoto = useMemo(
    () => motos.find((m) => m.id === workflowPrepMotoId) ?? null,
    [motos, workflowPrepMotoId]
  )
  const selectableMotos = useMemo(
    () =>
      motos.filter(
        (m) =>
          !isLockedStatus(m.status) &&
          isPrepMotoStatus(m.status) &&
          // The dropdown follows the prep moto picked by workflow order, not merely the currently LIVE category.
          // This releases the next category only after the current category is actually complete.
          (workflowPrepMoto?.category_id ? m.category_id === workflowPrepMoto.category_id : true)
      ),
    [motos, workflowPrepMoto]
  )
  const selectedMotoUpcoming = isMotoUpcoming(selectedMoto?.status)
  const selectedMotoReady = isMotoReady(selectedMoto?.status)
  const selectedMotoPreppable = !!selectedMoto && !isLockedStatus(selectedMoto.status) && (selectedMotoUpcoming || selectedMotoReady)
  const prepSelectOptions = useMemo(() => {
    if (!selectedMoto || !selectedMotoPreppable || selectableMotos.some((m) => m.id === selectedMoto.id)) {
      return selectableMotos
    }
    return [selectedMoto, ...selectableMotos]
  }, [selectableMotos, selectedMoto, selectedMotoPreppable])
  const bulkReadyApplied = bulkReadyState?.motoId === selectedMotoId
  const activeCategoryWaitingStage = useMemo(() => {
    // A workflow prep moto takes precedence over any completed category that
    // is still eligible for a later compute. Otherwise an older category can
    // hide the prep panel after the selector has already advanced.
    if (workflowPrepMoto) return null

    const categoryIds = Array.from(new Set(motos.map((moto) => moto.category_id).filter(Boolean))) as string[]
    for (const categoryId of categoryIds) {
      const categoryMotos = motos.filter((moto) => moto.category_id === categoryId)
      const hasPrepMoto = categoryMotos.some((moto) => !isLockedStatus(moto.status) && isPrepMotoStatus(moto.status))
      if (hasPrepMoto) continue

      const finalMotos = categoryMotos.filter((moto) => /^FINAL\s+/i.test(moto.moto_name))
      if (finalMotos.length > 0 && finalMotos.every((moto) => isLockedStatus(moto.status))) continue

      const pendingMoto = categoryMotos.find((moto) => ['PROVISIONAL', 'PROTEST_REVIEW'].includes(String(moto.status ?? '').toUpperCase()))
      const lastLockedNonFinalMoto = [...categoryMotos]
        .reverse()
        .find((moto) => isLockedStatus(moto.status) && !/^FINAL\s+/i.test(moto.moto_name))
      const waitingMoto = pendingMoto ?? lastLockedNonFinalMoto
      if (!waitingMoto) continue

      const status = String(waitingMoto.status ?? '').toUpperCase()
      return {
        categoryLabel: categoryLabel.get(categoryId) ?? 'Kategori Terkait',
        ...getStageWaitCopy(waitingMoto.moto_name, status),
      }
    }
    return null
  }, [motos, categoryLabel, workflowPrepMoto])
  const incidentCategoryLabel = incidentMoto
    ? categoryLabel.get(incidentMoto.category_id ?? '') ?? 'Unknown Category'
    : 'Kategori'
  const selectedCategoryLabel = selectedMoto
    ? categoryLabel.get(selectedMoto.category_id ?? '') ?? 'Unknown Category'
    : 'Kategori'
  const hasSafetyRequirements = safetyRequirements.length > 0
  const isCompactLayout = viewportWidth <= 960
  const isMobileLayout = viewportWidth <= 640
  const safetyGridColumns = isMobileLayout ? 'repeat(3, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))'
  const prepActionColumns = isMobileLayout ? '1fr' : 'repeat(2, minmax(0, 1fr))'
  const prepSummaryColumns = isMobileLayout ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))'

  const riderList = useMemo(() => {
    const sorted = [...riders].sort((a, b) => {
      const ga = a.gate_position ?? 9999
      const gb = b.gate_position ?? 9999
      return ga - gb
    })
    return sorted.map((r, idx) => ({
      ...r,
      status: statuses[r.id]?.participation_status ?? 'ACTIVE',
      registration_order: statuses[r.id]?.registration_order ?? r.gate_position ?? idx + 1,
    }))
  }, [riders, statuses])

  const filteredRiders = useMemo(() => {
    if (!query.trim()) return riderList
    const q = query.toLowerCase()
    return riderList.filter((r) => {
      const gate = String(r.gate_position ?? r.registration_order ?? '')
      return r.name.toLowerCase().includes(q) || r.no_plate_display.toLowerCase().includes(q) || gate.includes(q)
    })
  }, [riderList, query])

  const incidentRiderList = useMemo(() => {
    const sorted = [...incidentRiders].sort((a, b) => {
      const ga = a.gate_position ?? 9999
      const gb = b.gate_position ?? 9999
      return ga - gb
    })
    return sorted.map((r, idx) => ({
      ...r,
      status: incidentStatuses[r.id]?.participation_status ?? 'ACTIVE',
      registration_order: incidentStatuses[r.id]?.registration_order ?? r.gate_position ?? idx + 1,
    }))
  }, [incidentRiders, incidentStatuses])

  const incidentSummary = useMemo(() => {
    const total = incidentRiderList.length
    const dns = incidentRiderList.filter((r) => incidentStatuses[r.id]?.participation_status === 'DNS').length
    const ready = incidentRiderList.filter((r) => {
      const status = incidentStatuses[r.id]?.participation_status
      return !status || status === 'ACTIVE'
    }).length
    return {
      total,
      dns,
      ready,
      remaining: Math.max(total - dns, 0),
    }
  }, [incidentRiderList, incidentStatuses])

  const summary = useMemo(() => {
    const s = { total: riderList.length, active: 0, absent: 0, unchecked: 0 }
    for (const r of riderList) {
      const status = statuses[r.id]?.participation_status
      if (status === 'ABSENT') s.absent += 1
      else if (status === 'ACTIVE') s.active += 1
      else s.unchecked += 1
    }
    return s
  }, [riderList, statuses])

  const requiredSafety = useMemo(
    () => safetyRequirements.filter((r) => r.is_required !== false),
    [safetyRequirements]
  )

  const isSafetyOk = useCallback(
    (riderId: string) => requiredSafety.every((item) => safetyChecks[riderId]?.[item.id] === true),
    [requiredSafety, safetyChecks]
  )

  const allPrepReviewed = useMemo(() => {
    return (
      riders.length > 0 &&
      riders.every((r) => {
        const status = statuses[r.id]?.participation_status
        return status === 'ACTIVE' || status === 'ABSENT'
      })
    )
  }, [riders, statuses])

  const handleSaveStatus = async (riderId: string, status: StatusRow['participation_status'], order: number) => {
    if (!selectedMotoId) return
    if (!selectedMotoPreppable || locked) return
    if (status === 'ABSENT' && !flags.absent_enabled) return
    const previousStatus = statuses[riderId]
    setSaving(true)
    setWarningMessage(null)
    setErrorMessage(null)
    try {
      setStatuses((prev) => ({
        ...prev,
        [riderId]: { rider_id: riderId, participation_status: status, registration_order: order },
      }))
      await apiFetch(`/api/jury/events/${eventId}/rider-status`, {
        method: 'POST',
        body: JSON.stringify({
          rider_id: riderId,
          participation_status: status,
          registration_order: order,
          moto_id: selectedMotoId,
        }),
      })
      setLastUpdated(new Date().toLocaleTimeString())
      setTimeout(() => {
        void loadMoto(true)
      }, 350)
    } catch (err: unknown) {
      setStatuses((prev) => {
        const next = { ...prev }
        if (previousStatus) next[riderId] = previousStatus
        else delete next[riderId]
        return next
      })
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menyimpan status rider.')
      await loadMoto(true)
    } finally {
      setSaving(false)
    }
  }

  const handleUndoReady = async (riderId: string) => {
    if (!selectedMotoId) return
    if (!selectedMotoPreppable || locked) return
    const previousStatus = statuses[riderId]
    if (!previousStatus || previousStatus.participation_status !== 'ACTIVE') return
    setSaving(true)
    setWarningMessage(null)
    setErrorMessage(null)
    try {
      setStatuses((prev) => {
        const next = { ...prev }
        delete next[riderId]
        return next
      })
      setAllReadyDone(false)
      setBulkReadyState(null)
      await apiFetch(`/api/jury/events/${eventId}/rider-status?rider_id=${encodeURIComponent(riderId)}&moto_id=${encodeURIComponent(selectedMotoId)}`, {
        method: 'DELETE',
      })
      setLastUpdated(new Date().toLocaleTimeString())
      setTimeout(() => {
        void loadMoto(true)
      }, 350)
    } catch (err: unknown) {
      setStatuses((prev) => ({
        ...prev,
        [riderId]: previousStatus,
      }))
      setErrorMessage(err instanceof Error ? err.message : 'Gagal undo READY rider.')
      await loadMoto(true)
    } finally {
      setSaving(false)
    }
  }

  const handleIncidentDns = async (riderId: string, order: number) => {
    if (!incidentMotoId || incidentLocked) return
    if (!flags.dns_enabled) return
    const previousStatus = incidentStatuses[riderId]
    setSaving(true)
    setWarningMessage(null)
    setErrorMessage(null)
    try {
      setIncidentStatuses((prev) => ({
        ...prev,
        [riderId]: { rider_id: riderId, participation_status: 'DNS', registration_order: order },
      }))
      await apiFetch(`/api/jury/events/${eventId}/rider-status`, {
        method: 'POST',
        body: JSON.stringify({
          rider_id: riderId,
          participation_status: 'DNS',
          registration_order: order,
          moto_id: incidentMotoId,
        }),
      })
      setIncidentLastUpdated(new Date().toLocaleTimeString())
      setTimeout(() => {
        void loadIncidentMoto(true)
      }, 350)
    } catch (err: unknown) {
      setIncidentStatuses((prev) => {
        const next = { ...prev }
        if (previousStatus) next[riderId] = previousStatus
        else delete next[riderId]
        return next
      })
      setErrorMessage(err instanceof Error ? err.message : 'Gagal set DNS rider LIVE.')
      await loadIncidentMoto(true)
    } finally {
      setSaving(false)
    }
  }

  const handleUndoIncidentDns = async (riderId: string) => {
    if (!incidentMotoId || incidentLocked) return
    const previousStatus = incidentStatuses[riderId]
    if (!previousStatus || previousStatus.participation_status !== 'DNS') return
    if (previousStatus.status_source_role && previousStatus.status_source_role !== 'CHECKER') {
      const confirmed = window.confirm(
        `DNS ini ditetapkan oleh ${previousStatus.status_source_label || 'role lain'} (${previousStatus.status_source_role}).\n\nBatalkan DNS dan kembalikan rider ke status aktif?`
      )
      if (!confirmed) return
    }
    setSaving(true)
    setWarningMessage(null)
    setErrorMessage(null)
    try {
      setIncidentStatuses((prev) => {
        const next = { ...prev }
        delete next[riderId]
        return next
      })
      await apiFetch(
        `/api/jury/events/${eventId}/rider-status?rider_id=${encodeURIComponent(riderId)}&moto_id=${encodeURIComponent(incidentMotoId)}`,
        { method: 'DELETE' }
      )
      setIncidentLastUpdated(new Date().toLocaleTimeString())
      setTimeout(() => {
        void loadIncidentMoto(true)
      }, 350)
    } catch (err: unknown) {
      setIncidentStatuses((prev) => ({
        ...prev,
        [riderId]: previousStatus,
      }))
      setErrorMessage(err instanceof Error ? err.message : 'Gagal undo DNS rider LIVE.')
      await loadIncidentMoto(true)
    } finally {
      setSaving(false)
    }
  }

  const handleAllRidersReady = async () => {
    if (!selectedMotoId) return
    if (!selectedMotoPreppable || locked) return
    if (riderList.length === 0) return

    const targetRiders = riderList.filter((rider) => {
      const status = statuses[rider.id]?.participation_status
      return status !== 'ACTIVE' && status !== 'ABSENT'
    })

    if (targetRiders.length === 0) {
      setWarningMessage('Semua rider di moto ini sudah READY atau ABSENT. Tidak ada rider baru yang perlu di-ready-kan massal.')
      setErrorMessage(null)
      return
    }

    const changedStatuses = targetRiders.reduce<Record<string, StatusRow | null>>((acc, rider) => {
      acc[rider.id] = statuses[rider.id] ?? null
      return acc
    }, {})

    setSaving(true)
    setWarningMessage(null)
    setErrorMessage(null)
    try {
      const requests: Array<Promise<unknown>> = []
      if (safetyRequirements.length > 0) {
        const checks: SafetyCheckPayload[] = targetRiders.flatMap((rider) =>
          safetyRequirements.map((item) => ({
            rider_id: rider.id,
            requirement_id: item.id,
            is_checked: safetyChecks[rider.id]?.[item.id] === true,
          }))
        )
        requests.push(
          apiFetch(`/api/jury/motos/${selectedMotoId}/safety-checks`, {
            method: 'POST',
            body: JSON.stringify({ checks }),
          })
        )
      }

      const nextStatuses = targetRiders.reduce<Record<string, StatusRow>>((acc, rider, index) => {
        acc[rider.id] = {
          rider_id: rider.id,
          participation_status: 'ACTIVE',
          registration_order: rider.gate_position ?? rider.registration_order ?? index + 1,
        }
        return acc
      }, {})

      setStatuses((prev) => ({
        ...prev,
        ...nextStatuses,
      }))
      setAllReadyDone(false)

      requests.push(
        apiFetch(`/api/jury/events/${eventId}/rider-status`, {
          method: 'POST',
          body: JSON.stringify({
            changes: targetRiders.map((rider, index) => ({
              rider_id: rider.id,
              participation_status: 'ACTIVE',
              registration_order: rider.gate_position ?? rider.registration_order ?? index + 1,
              moto_id: selectedMotoId,
            })),
          }),
        })
      )
      await Promise.all(requests)

      setBulkReadyState({ motoId: selectedMotoId, changedStatuses })
      setWarningMessage(`${targetRiders.length} rider di ${selectedMoto?.moto_name ?? 'moto ini'} ditandai READY. Kalau ada yang keliru, tekan Undo All Riders Ready.`)
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (err: unknown) {
      const restoredStatuses = Object.entries(changedStatuses).reduce<Record<string, StatusRow>>((acc, [riderId, row]) => {
        if (row) acc[riderId] = row
        return acc
      }, {})
      setStatuses((prev) => {
        const next = { ...prev }
        for (const riderId of targetRiders.map((rider) => rider.id)) {
          delete next[riderId]
        }
        return { ...next, ...restoredStatuses }
      })
      setErrorMessage(err instanceof Error ? err.message : 'Gagal set semua rider READY.')
      await loadMoto(true)
    } finally {
      setSaving(false)
    }
  }

  const handleUndoAllRidersReady = async () => {
    if (!selectedMotoId || !bulkReadyApplied || !bulkReadyState) return
    if (!selectedMotoPreppable || locked) return

    const changedStatuses = bulkReadyState.changedStatuses
    const changedRiderIds = Object.keys(changedStatuses)
    if (changedRiderIds.length === 0) {
      setBulkReadyState(null)
      return
    }

    setSaving(true)
    setWarningMessage(null)
    setErrorMessage(null)
    try {
      const restoredStatuses = Object.entries(changedStatuses).reduce<Record<string, StatusRow>>((acc, [riderId, row]) => {
        if (row) acc[riderId] = row
        return acc
      }, {})
      setStatuses((prev) => {
        const next = { ...prev }
        for (const riderId of changedRiderIds) {
          delete next[riderId]
        }
        return { ...next, ...restoredStatuses }
      })
      setAllReadyDone(false)

      await Promise.all(
        changedRiderIds.map((riderId) => {
          const previous = changedStatuses[riderId] ?? null
          if (!previous) {
            return apiFetch(
              `/api/jury/events/${eventId}/rider-status?rider_id=${encodeURIComponent(riderId)}&moto_id=${encodeURIComponent(selectedMotoId)}`,
              { method: 'DELETE' }
            )
          }
          return apiFetch(`/api/jury/events/${eventId}/rider-status`, {
            method: 'POST',
            body: JSON.stringify({
              rider_id: riderId,
              participation_status: previous.participation_status,
              registration_order: previous.registration_order,
              moto_id: selectedMotoId,
            }),
          })
        })
      )

      setBulkReadyState(null)
      setWarningMessage('All Riders Ready dibatalkan. Status rider dikembalikan ke kondisi sebelum mass ready.')
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal undo All Riders Ready.')
      await loadMoto(true)
    } finally {
      setSaving(false)
    }
  }

  const handleAllReady = async () => {
    if (!selectedMotoId) return
    if (!selectedMotoPreppable || locked) return
    setWarningMessage(null)
    setErrorMessage(null)
    if (!allPrepReviewed) {
      setErrorMessage('Semua rider di moto ini harus dicek dulu. Tandai READY atau ABSENT sebelum tekan Moto Ready.')
      return
    }
    setMotoReadySaving(true)
    setSaving(true)
    setAllReadyDone(true)
    setWarningMessage('Moto Ready sedang disimpan. Menunggu konfirmasi sistem...')
    try {
      const response = (await apiFetch(`/api/jury/motos/${selectedMotoId}/prep-ready`, { method: 'POST' })) as {
        next_moto?: { nextMotoId?: string; skipped?: boolean }
      }
      const status = response.next_moto?.nextMotoId === selectedMotoId && !response.next_moto?.skipped ? 'LIVE' : 'READY'
      setMotos((prev) =>
        prev.map((moto) =>
          moto.id === selectedMotoId ? { ...moto, status, checker_prep_ready_at: new Date().toISOString() } : moto
        )
      )
      setWarningMessage(status === 'LIVE' ? 'Moto langsung LIVE karena moto sebelumnya sudah PROVISIONAL.' : 'Status prep rider saat ini dikunci.')
      setLastUpdated(new Date().toLocaleTimeString())
      setMotoReadyConfirmation({
        categoryLabel: selectedCategoryLabel,
        motoName: selectedMoto?.moto_name ?? 'Moto',
        status,
      })
    } catch (err: unknown) {
      setAllReadyDone(false)
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menyimpan Moto Ready.')
    } finally {
      setMotoReadySaving(false)
      setSaving(false)
    }
  }

  const handleEditPrep = async () => {
    if (!selectedMotoId) return
    setErrorMessage(null)
    setWarningMessage(null)
    try {
      await apiFetch(`/api/jury/motos/${selectedMotoId}/prep-ready`, { method: 'DELETE' })
      setAllReadyDone(false)
      setMotos((prev) =>
        prev.map((moto) => (moto.id === selectedMotoId ? { ...moto, status: 'UPCOMING', checker_prep_ready_at: null } : moto))
      )
      setWarningMessage('Prep dibuka lagi. Setelah koreksi selesai, tekan Moto Ready lagi.')
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal membuka Edit Prep.')
    }
  }

  const bannerDisabled = !selectedMotoPreppable
  const interactionDisabled = saving || bannerDisabled || locked
  const safetyInteractionDisabled = interactionDisabled || allReadyDone
  const readyDisabled = interactionDisabled
  const absentDisabled = interactionDisabled || allReadyDone || bulkReadyApplied || !flags.absent_enabled
  const bulkReadyDisabled = interactionDisabled || allReadyDone || riderList.length === 0
  const canGateReady = riderList.length > 0 && allPrepReviewed
  const motoReadyDisabled = interactionDisabled || !canGateReady || allReadyDone
  const incidentInteractionDisabled = saving || incidentLocked || !incidentMotoId
  const incidentDnsDisabled = incidentInteractionDisabled || !flags.dns_enabled

  return (
    <div className="jc-page" style={{ minHeight: '100vh', background: '#fff6da', color: '#111' }}>
      <CheckerTopbar title="Checker Panel" />
      <div
        className="jc-container"
        style={{
          maxWidth: 980,
          margin: '0 auto',
          padding: isMobileLayout ? 12 : isCompactLayout ? 16 : 20,
          display: 'grid',
          gap: isMobileLayout ? 12 : 16,
        }}
      >
          <div style={{ display: 'grid', gap: 8 }}>
          <div className="jc-header-row" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: highVisibility ? (isCompactLayout ? 30 : 34) : isCompactLayout ? 24 : 28, fontWeight: 900 }}>
              Checker Gate Start
            </div>
            <select
              value={selectedMotoId}
              onChange={(e) => {
                const next = e.target.value
                const targetMoto = motos.find((moto) => moto.id === next)
                manualSelectRef.current = true
                selectedMotoIdRef.current = next
                setSelectedMotoId(next)
                setAllReadyDone(Boolean(targetMoto?.checker_prep_ready_at))
                setBulkReadyState(null)
                syncPrepMotoUrl(next)
              }}
              className="jc-moto-select"
              style={{
                padding: '12px 16px',
                borderRadius: 16,
                border: '2px solid #111',
                background: '#fff',
                fontWeight: 900,
                width: isCompactLayout ? '100%' : undefined,
              }}
              disabled={prepSelectOptions.length === 0}
            >
              {prepSelectOptions.length === 0 && <option value="">Belum ada moto prep aktif</option>}
              {prepSelectOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.moto_order}. {m.moto_name} - {categoryLabel.get(m.category_id ?? '') ?? 'Category'}
                  {isMotoReady(m.status) ? ' (READY)' : ''}
                </option>
                ))}
            </select>
            <button
              type="button"
              onClick={async () => {
                const refreshedMotos = (await loadMotos(false)) ?? []
                const liveMoto = refreshedMotos.find((m) => isMotoLive(m.status))
                const nextMotoId = pickPrepMotoId(refreshedMotos, selectedMotoId, liveMoto?.id ?? null, allReadyDone)
                if (nextMotoId && nextMotoId !== selectedMotoId) return
                await loadMoto(false, true)
                await loadIncidentMoto(true)
              }}
              disabled={loading || saving}
              style={{
                padding: '10px 14px',
                borderRadius: 16,
                border: '2px solid #111',
                background: '#dcfce7',
                fontWeight: 900,
                cursor: loading || saving ? 'not-allowed' : 'pointer',
                opacity: loading || saving ? 0.6 : 1,
                whiteSpace: 'nowrap',
                width: isMobileLayout ? '100%' : undefined,
              }}
            >
              Refresh Checker
            </button>
            <button
              type="button"
              onClick={toggleHighVisibility}
              style={{
                padding: '10px 14px',
                borderRadius: 16,
                border: '2px solid #111',
                background: highVisibility ? '#fef3c7' : '#fff',
                color: '#111',
                fontWeight: 900,
                whiteSpace: 'nowrap',
                width: isMobileLayout ? '100%' : undefined,
              }}
            >
              {highVisibility ? 'Mode Besar Aktif' : 'Mode Besar'}
            </button>
          </div>

          {false && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: 14,
                border: '2px solid #f59e0b',
                background: '#fffbe8',
                color: '#92400e',
                fontWeight: 800,
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.15)',
              }}
            >
              <span style={{ fontSize: 22 }}>⏳</span>
              <div>
                <div style={{ fontWeight: 900, fontSize: 15 }}>
                  Menunggu hasil stage dihitung
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.9, marginTop: 2 }}>
                  Kualifikasi kategori ini baru disubmit / provisional. Sistem sedang menghitung hasil kualifikasi & penyusunan stage berikutnya. Moto kategori selanjutnya ditahan hingga kualifikasi kategori ini selesai.
                </div>
              </div>
            </div>
          )}

          {!hasSafetyRequirements && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: '2px solid #f59e0b',
                background: '#fef3c7',
                color: '#92400e',
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              Safety checklist belum diset untuk event ini. Atur di Admin {'>'} Event {'>'} Penalties {'>'} Safety Checklist Mapping.
            </div>
          )}
        </div>
        {bannerDisabled && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '2px solid #b91c1c',
              background: '#fee2e2',
              color: '#7f1d1d',
              fontWeight: 800,
            }}
          >
            Belum ada moto prep yang aktif. Checker tetap bisa pakai panel incident moto LIVE kalau ada.
          </div>
        )}
        {errorMessage && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '2px solid #b91c1c',
              background: '#fee2e2',
              color: '#7f1d1d',
              fontWeight: 800,
            }}
          >
            {errorMessage}
          </div>
        )}
        {warningMessage && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '2px solid #f59e0b',
              background: '#fef3c7',
              color: '#92400e',
              fontWeight: 800,
            }}
          >
            {warningMessage}
          </div>
        )}

        <div
          style={{
            display: 'grid',
            gap: incidentMoto ? (isCompactLayout ? 10 : 12) : 8,
            padding: incidentMoto ? (isCompactLayout ? 14 : 18) : isCompactLayout ? 12 : 14,
            borderRadius: 20,
            border: '3px solid #7f1d1d',
            background: 'linear-gradient(180deg, #fff1f2 0%, #ffe4e6 100%)',
            boxShadow: isCompactLayout ? '0 6px 0 #7f1d1d' : '0 10px 0 #7f1d1d',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', color: '#9f1239' }}>CURRENT MOTO INCIDENT</div>
              <div style={{ fontSize: highVisibility ? (isCompactLayout ? 22 : 24) : isCompactLayout ? 18 : 20, fontWeight: 900 }}>
                {incidentMoto ? `${incidentCategoryLabel} - ${incidentMoto.moto_name}` : 'Belum ada moto LIVE'}
              </div>
            </div>
            <div
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '2px solid #7f1d1d',
                background: incidentMoto ? '#be123c' : '#ffe4e6',
                color: incidentMoto ? '#fff' : '#881337',
                fontWeight: 900,
              }}
            >
              {incidentMoto ? 'URGENT LIVE' : 'WAITING LIVE'}
            </div>
          </div>
          <div style={{ fontSize: 12, color: '#881337', fontWeight: 700 }}>
            Last updated LIVE: {incidentLastUpdated ?? '-'}
          </div>
          {incidentMoto ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: '2px solid #7f1d1d',
                  background: '#fff',
                  color: '#881337',
                  fontWeight: 900,
                }}
              >
                Total: {incidentSummary.total}
              </span>
              <span
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: '2px solid #7f1d1d',
                  background: '#ffe4e6',
                  color: '#881337',
                  fontWeight: 900,
                }}
              >
                Ready: {incidentSummary.ready}
              </span>
              <span
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: '2px solid #c2410c',
                  background: '#ffedd5',
                  color: '#9a3412',
                  fontWeight: 900,
                }}
              >
                DNS: {incidentSummary.dns}
              </span>
              <span
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: '2px solid #1d4ed8',
                  background: '#dbeafe',
                  color: '#1e3a8a',
                  fontWeight: 900,
                }}
              >
                Remaining: {incidentSummary.remaining}
              </span>
            </div>
          ) : null}
          {incidentMoto ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: isCompactLayout ? 8 : 10,
              }}
            >
              {incidentRiderList.map((r) => {
                const statusRow = incidentStatuses[r.id]
                const rawStatus = statusRow?.participation_status
                const statusLabel = !rawStatus ? 'READY/UNKNOWN' : rawStatus === 'ACTIVE' ? 'READY' : rawStatus
                const isDns = rawStatus === 'DNS'
                const sourceLabel = isDns && statusRow?.status_source_label
                  ? `DNS oleh ${statusRow.status_source_label} (${statusRow.status_source_role})`
                  : null
                return (
                  <button
                    key={`incident-${r.id}`}
                    className="jc-incident-rider-btn"
                    type="button"
                    onClick={() =>
                      isDns
                        ? handleUndoIncidentDns(r.id)
                        : handleIncidentDns(r.id, r.gate_position ?? r.registration_order ?? 0)
                    }
                    disabled={incidentDnsDisabled}
                    aria-label={`${isDns ? 'Undo DNS' : 'Set DNS'} ${r.no_plate_display} ${r.name}`}
                    style={{
                      minHeight: highVisibility ? (isCompactLayout ? 112 : 122) : isCompactLayout ? 92 : 104,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: isCompactLayout ? '10px' : '12px',
                      borderRadius: 14,
                      border: `2px solid ${isDns ? '#1d4ed8' : '#c2410c'}`,
                      background: isDns ? '#dbeafe' : '#fff',
                      color: isDns ? '#1e3a8a' : '#7f1d1d',
                      textAlign: 'left',
                      cursor: incidentDnsDisabled ? 'not-allowed' : 'pointer',
                      opacity: incidentDnsDisabled ? 0.55 : 1,
                    }}
                  >
                    <div style={{ display: 'grid', gap: 3, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
                        <span style={{ fontSize: highVisibility ? (isCompactLayout ? 24 : 28) : isCompactLayout ? 20 : 24, fontWeight: 950, lineHeight: 1 }}>
                          {r.no_plate_display}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 900, color: isDns ? '#1e3a8a' : '#9a3412' }}>
                          GATE {r.gate_position ?? '-'}
                        </span>
                      </div>
                      <span
                        style={{
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical',
                          WebkitLineClamp: 2,
                          fontSize: highVisibility ? 14 : 12,
                          fontWeight: 900,
                          lineHeight: 1.15,
                        }}
                      >
                        {r.name}
                      </span>
                      {sourceLabel && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#1e3a8a' }}>
                          {sourceLabel}
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        width: '100%',
                        padding: highVisibility ? '8px 10px' : '6px 8px',
                        borderRadius: 999,
                        border: `2px solid ${isDns ? '#1d4ed8' : '#c2410c'}`,
                        background: isDns ? '#fff' : '#ffedd5',
                        color: isDns ? '#1e3a8a' : '#9a3412',
                        fontWeight: 900,
                        fontSize: highVisibility ? 13 : 11,
                        letterSpacing: '0.06em',
                        textAlign: 'center',
                        textTransform: 'uppercase',
                      }}
                    >
                      {isDns ? 'UNDO DNS' : 'SET DNS'}
                    </span>
                    <span className="sr-only">Status {statusLabel}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div
              style={{
                padding: isCompactLayout ? '10px 12px' : '12px 14px',
                borderRadius: 12,
                border: '2px dashed #be123c',
                color: '#881337',
                fontWeight: 800,
                background: '#fff',
              }}
            >
              Belum ada moto LIVE yang perlu incident handling.
            </div>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gap: isCompactLayout ? 10 : 12,
            padding: isCompactLayout ? 14 : 16,
            borderRadius: 18,
            border: '2px solid #166534',
            background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)',
            boxShadow: isCompactLayout ? '0 4px 0 #166534' : '0 5px 0 #166534',
          }}
        >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: '2px solid #166534',
              background: '#dcfce7',
              color: '#166534',
              fontWeight: 900,
            }}
          >
            NEXT MOTO PREP
          </div>
          <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
            Last updated PREP: {lastUpdated ?? '-'}
          </div>
        </div>

        {activeCategoryWaitingStage ? (
          <div
            role="status"
            aria-live="polite"
            style={{ display: 'grid', gap: 12, padding: isCompactLayout ? 14 : 18, borderRadius: 14, border: '2px solid #d97706', background: '#fff7ed' }}
          >
            <LoadingState label={activeCategoryWaitingStage.title} />
            <div style={{ textAlign: 'center', color: '#92400e', fontWeight: 900 }}>
              {activeCategoryWaitingStage.categoryLabel}
            </div>
            <div style={{ textAlign: 'center', color: '#78350f', fontSize: 13, fontWeight: 700, lineHeight: 1.45 }}>
              {activeCategoryWaitingStage.detail}
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gap: 6,
              padding: isCompactLayout ? '10px 12px' : '12px 14px',
              borderRadius: 14,
              border: '2px solid #bbf7d0',
              background: '#ffffff',
            }}
          >
            <div style={{ fontSize: highVisibility ? (isCompactLayout ? 22 : 26) : isCompactLayout ? 18 : 22, fontWeight: 950, color: '#111827' }}>
              {selectedMoto?.moto_name ?? 'Belum ada moto prep'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: 999,
                  border: '1.5px solid #166534',
                  background: '#f0fdf4',
                  color: '#166534',
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                {selectedCategoryLabel}
              </span>
              <span style={{ fontSize: 12, color: '#475569', fontWeight: 800 }}>
                {selectedMotoReady
                  ? allReadyDone
                    ? 'Moto sudah READY dan prep sudah dikonfirmasi.'
                    : 'Moto sudah READY; checker masih bisa koreksi sebelum race berjalan.'
                  : 'Moto ini masih fase prep sebelum start.'}
              </span>
            </div>
          </div>
        )}

        {prepDqRiders.length > 0 && !activeCategoryWaitingStage && (
          <div
            style={{
              display: 'grid',
              gap: 8,
              padding: isCompactLayout ? 10 : 12,
              borderRadius: 12,
              border: '2px solid #be123c',
              background: '#fff1f2',
            }}
          >
            <div style={{ color: '#9f1239', fontWeight: 950, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Tidak Dapat Start - DQ
            </div>
            {prepDqRiders.map((rider) => (
              <div key={rider.id} style={{ color: '#881337', fontWeight: 800, fontSize: 13 }}>
                {rider.no_plate_display} - {rider.name}{rider.dq_reason ? `: ${rider.dq_reason}` : ''}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: activeCategoryWaitingStage ? 'none' : 'grid', gap: 10 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama / plate / gate..."
            style={{
              padding: '12px 14px',
              borderRadius: 16,
              border: '2px solid #111',
              background: '#fff',
              fontWeight: 800,
            }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: prepActionColumns, gap: 8 }}>
            <button
              className="jc-action-btn jc-primary"
              type="button"
              onClick={handleAllReady}
              disabled={motoReadyDisabled}
              style={{
                padding: isCompactLayout ? '12px 16px' : '14px 18px',
                borderRadius: 999,
                border: allReadyDone ? '2px solid #15803d' : '2px solid #1d4ed8',
                background: allReadyDone ? '#dcfce7' : 'linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)',
                color: allReadyDone ? '#14532d' : '#fff',
                fontWeight: 900,
                fontSize: highVisibility ? (isCompactLayout ? 20 : 24) : isCompactLayout ? 18 : 20,
                boxShadow: allReadyDone ? '0 4px 0 #15803d' : '0 5px 0 #1e40af',
              }}
            >
              {allReadyDone ? 'Prep Selesai' : 'Moto Ready'}
            </button>
            <button
              className="jc-action-btn jc-primary"
              type="button"
              onClick={bulkReadyApplied ? handleUndoAllRidersReady : handleAllRidersReady}
              disabled={bulkReadyDisabled}
              style={{
                padding: isCompactLayout ? '12px 16px' : '12px 18px',
                borderRadius: 999,
                border: bulkReadyApplied ? '2px solid #b91c1c' : '2px solid #365314',
                background: bulkReadyApplied ? '#fee2e2' : 'linear-gradient(180deg, #bef264 0%, #84cc16 100%)',
                color: bulkReadyApplied ? '#7f1d1d' : '#1a2e05',
                fontWeight: 900,
                fontSize: highVisibility ? (isCompactLayout ? 18 : 22) : isCompactLayout ? 16 : 18,
                boxShadow: bulkReadyApplied ? '0 4px 0 #b91c1c' : '0 4px 0 #4d7c0f',
              }}
            >
              {bulkReadyApplied ? 'Undo All Riders Ready' : 'All Riders Ready'}
            </button>
          </div>
          {!allPrepReviewed && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '2px solid #f59e0b',
                background: '#fff7ed',
                color: '#9a3412',
                fontWeight: 800,
              }}
            >
              Masih ada {summary.unchecked} rider berstatus <strong>Belum Dicek</strong>. Tandai READY atau ABSENT satu-satu dulu sebelum konfirmasi Moto Ready.
            </div>
          )}
          {allReadyDone && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ padding: '12px 14px', borderRadius: 12, background: '#dcfce7', fontWeight: 900, textAlign: 'center' }}>
                Prep moto ini sudah selesai. Gunakan Edit Prep kalau checker perlu koreksi sebelum race berjalan.
              </div>
              <button
                className="jc-action-btn"
                type="button"
                onClick={handleEditPrep}
                disabled={saving || bannerDisabled || locked}
                style={{
                  padding: '10px 14px',
                  borderRadius: 999,
                  border: '2px solid #b91c1c',
                  background: '#fee2e2',
                  color: '#7f1d1d',
                  fontWeight: 900,
                }}
              >
                Edit Prep
              </button>
            </div>
          )}
          <button
            className="jc-action-btn"
            type="button"
            onClick={async () => {
              if (!selectedMotoId) return
              localMutationRef.current = true
              setSafetyChecks((prev) => {
                const next = { ...prev }
                for (const rider of riderList) {
                  const current = next[rider.id] ?? {}
                  const updated: Record<string, boolean> = { ...current }
                  for (const item of safetyRequirements) updated[item.id] = true
                  next[rider.id] = updated
                }
                return next
              })
              const checks: SafetyCheckPayload[] = riderList.flatMap((rider) =>
                safetyRequirements.map((item) => ({
                  rider_id: rider.id,
                  requirement_id: item.id,
                  is_checked: true,
                }))
              )
              try {
                if (checks.length > 0) {
                  await apiFetch(`/api/jury/motos/${selectedMotoId}/safety-checks`, {
                    method: 'POST',
                    body: JSON.stringify({ checks }),
                  })
                }
              } finally {
                localMutationRef.current = false
              }
            }}
            disabled={safetyInteractionDisabled || !hasSafetyRequirements}
            style={{
              padding: '10px 14px',
              borderRadius: 999,
              border: '2px solid #111',
              background: '#fff',
              fontWeight: 900,
            }}
          >
            MARK ALL SAFETY OK
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: prepSummaryColumns, gap: 8 }}>
            <span
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '2px solid #111',
                background: flags.dns_enabled ? '#dcfce7' : '#fee2e2',
                color: flags.dns_enabled ? '#166534' : '#991b1b',
                fontWeight: 900,
              }}
            >
              DNS {flags.dns_enabled ? 'ON' : 'OFF'}
            </span>
            <span
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '2px solid #111',
                background: flags.dnf_enabled ? '#dcfce7' : '#fee2e2',
                color: flags.dnf_enabled ? '#166534' : '#991b1b',
                fontWeight: 900,
              }}
            >
              DNF {flags.dnf_enabled ? 'ON' : 'OFF'}
            </span>
            <span style={{ padding: '6px 12px', borderRadius: 999, border: '2px solid #111', fontWeight: 900 }}>
              Total: {summary.total}
            </span>
            <span
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '2px solid #111',
                background: '#dcfce7',
                fontWeight: 900,
              }}
            >
              READY: {summary.active}
            </span>
            <span
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '2px solid #111',
                background: '#e5e7eb',
                fontWeight: 900,
              }}
            >
              BELUM DICEK: {summary.unchecked}
            </span>
            <span
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '2px solid #111',
                background: '#fee2e2',
                fontWeight: 900,
              }}
            >
              ABSENT: {summary.absent}
            </span>
          </div>
        </div>

        {!activeCategoryWaitingStage && loading && !initialLoadDone.current && <div style={{ fontWeight: 900 }}>Loading...</div>}

        {!activeCategoryWaitingStage && <div
          style={{
            display: 'grid',
            gap: 12,
            maxHeight: isCompactLayout ? '62vh' : '70vh',
            overflowY: 'auto',
            paddingRight: isMobileLayout ? 0 : 6,
          }}
        >
          {filteredRiders.map((r) => {
            const rawStatus = statuses[r.id]?.participation_status
            const currentStatus = rawStatus ?? 'UNSET'
            const hasStatus = typeof rawStatus === 'string'
            const isRiderReady = currentStatus === 'ACTIVE'
            const isRiderAbsent = currentStatus === 'ABSENT'
            const safetyOk = isSafetyOk(r.id)
            const statusBadge =
              !hasStatus
                ? '#e5e7eb'
                : isRiderAbsent
                ? '#fee2e2'
                : isRiderReady && safetyOk
                ? '#dcfce7'
                : isRiderReady
                ? '#ffe9a8'
                : '#e5e7eb'

            return (
              <div
                key={r.id}
                style={{
                  padding: isCompactLayout ? 12 : 14,
                  borderRadius: 14,
                  border: '2px solid #111',
                  background: 'linear-gradient(180deg, #ffffff 0%, #f7f7f7 100%)',
                  display: 'grid',
                  gap: isCompactLayout ? 8 : 10,
                  boxShadow: isCompactLayout ? '0 4px 0 #111' : '0 6px 0 #111',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobileLayout ? 'flex-start' : 'center', gap: 10, flexWrap: isMobileLayout ? 'wrap' : 'nowrap' }}>
                  <div>
                    <div
                      style={{
                        fontSize: highVisibility ? (isCompactLayout ? 34 : 42) : isCompactLayout ? 28 : 34,
                        lineHeight: 1,
                        fontWeight: 950,
                        letterSpacing: '0.04em',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace',
                      }}
                    >
                      {r.no_plate_display}
                    </div>
                    <div style={{ fontSize: highVisibility ? (isCompactLayout ? 16 : 18) : isCompactLayout ? 14 : 15, fontWeight: 800, marginTop: 4 }}>{r.name}</div>
                  </div>
                  <div style={{ textAlign: isMobileLayout ? 'left' : 'right' }}>
                    <div style={{ fontSize: highVisibility ? 14 : 12, fontWeight: 800 }}>Gate #{r.gate_position ?? '-'}</div>
                    <div
                      style={{
                        marginTop: 4,
                        padding: '4px 10px',
                        borderRadius: 999,
                        border: '2px solid #111',
                        background: statusBadge,
                        fontWeight: 900,
                        fontSize: highVisibility ? 12 : 11,
                      }}
                    >
                      {!hasStatus
                        ? 'UNCHECKED'
                        : isRiderReady && safetyOk
                        ? 'READY'
                        : isRiderReady
                        ? 'WARNING'
                        : currentStatus}
                    </div>
                  </div>
                </div>

                <div className="jc-safety-grid" style={{ display: 'grid', gridTemplateColumns: safetyGridColumns, gap: 8 }}>
                  {safetyRequirements.map((item) => {
                    const checked = safetyChecks[r.id]?.[item.id] === true
                    const visual = getSafetyVisual(item.label, item.icon_key)
                    return (
                      <button
                        className="jc-action-btn"
                        key={item.id}
                        type="button"
                        onClick={async () => {
                          const nextChecked = !checked
                          localMutationRef.current = true
                          setSafetyChecks((prev) => ({
                            ...prev,
                            [r.id]: { ...(prev[r.id] ?? {}), [item.id]: nextChecked },
                          }))
                          try {
                            await apiFetch(`/api/jury/motos/${selectedMotoId}/safety-checks`, {
                              method: 'POST',
                              body: JSON.stringify({
                                rider_id: r.id,
                                requirement_id: item.id,
                                is_checked: nextChecked,
                              }),
                            })
                          } catch {
                            // revert on failure
                            setSafetyChecks((prev) => ({
                              ...prev,
                              [r.id]: { ...(prev[r.id] ?? {}), [item.id]: checked },
                            }))
                          } finally {
                            localMutationRef.current = false
                          }
                        }}
                        disabled={safetyInteractionDisabled}
                        style={{
                          padding: highVisibility ? '12px 10px' : '10px 8px',
                          borderRadius: 12,
                          border: '2px solid #111',
                          background: checked ? '#2ecc71' : '#e5e7eb',
                          color: checked ? '#fff' : '#111',
                          fontWeight: 900,
                          display: 'grid',
                          gap: 4,
                          justifyItems: 'center',
                          alignContent: 'center',
                          minHeight: highVisibility ? (isCompactLayout ? 72 : 88) : isCompactLayout ? 58 : 74,
                        }}
                        title={item.label}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            fontSize: highVisibility ? (isCompactLayout ? 24 : 28) : isCompactLayout ? 20 : 24,
                            lineHeight: 1,
                          }}
                        >
                          {visual.icon}
                        </span>
                        <span
                          style={{
                            fontSize: highVisibility ? (isCompactLayout ? 11 : 13) : isCompactLayout ? 10 : 12,
                            lineHeight: 1.1,
                            textAlign: 'center',
                            wordBreak: 'break-word',
                          }}
                        >
                          {visual.shortLabel}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="jc-status-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                  <button
                    className="jc-action-btn jc-primary"
                    type="button"
                    onClick={() =>
                      statuses[r.id]?.participation_status === 'ACTIVE'
                        ? handleUndoReady(r.id)
                        : handleSaveStatus(r.id, 'ACTIVE', r.gate_position ?? 0)
                    }
                    disabled={readyDisabled || isRiderAbsent}
                    style={{
                      padding: highVisibility ? (isCompactLayout ? '12px 14px' : '14px 16px') : isCompactLayout ? '10px 12px' : '12px 14px',
                      borderRadius: 999,
                      border: '2px solid #1b5e20',
                      background: isRiderReady ? '#dcfce7' : isRiderAbsent ? '#e5e7eb' : safetyOk ? '#2ecc71' : '#ffe9a8',
                      color: '#111',
                      fontWeight: 900,
                      fontSize: highVisibility ? (isCompactLayout ? 14 : 16) : isCompactLayout ? 12 : undefined,
                    }}
                  >
                    {isRiderReady ? 'UNDO READY' : 'READY'}
                  </button>
                  <button
                    className="jc-action-btn"
                    type="button"
                    onClick={() =>
                      isRiderAbsent
                        ? handleSaveStatus(r.id, 'ACTIVE', r.gate_position ?? 0)
                        : handleSaveStatus(r.id, 'ABSENT', r.gate_position ?? 0)
                    }
                    disabled={absentDisabled || isRiderReady}
                    style={{
                      padding: highVisibility ? (isCompactLayout ? '12px 14px' : '14px 16px') : isCompactLayout ? '10px 12px' : '12px 14px',
                      borderRadius: 999,
                      border: '2px solid #b91c1c',
                      background: isRiderAbsent ? '#fecaca' : isRiderReady ? '#e5e7eb' : '#fee2e2',
                      color: '#7f1d1d',
                      fontWeight: 900,
                      fontSize: highVisibility ? (isCompactLayout ? 14 : 16) : isCompactLayout ? 12 : undefined,
                    }}
                  >
                    {isRiderAbsent ? 'UNDO ABSENT' : 'ABSENT'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>}
        </div>
      </div>
      <style jsx>{`
        .jc-page :global(.jc-action-btn) {
          transition:
            transform 120ms ease,
            box-shadow 180ms ease,
            filter 180ms ease,
            opacity 180ms ease;
          will-change: transform;
        }

        .jc-page :global(.jc-action-btn:hover:not(:disabled)) {
          transform: translateY(-1px);
          box-shadow: 0 6px 14px rgba(15, 23, 42, 0.22);
          filter: brightness(1.03);
        }

        .jc-page :global(.jc-action-btn:active:not(:disabled)) {
          transform: translateY(1px) scale(0.98);
          box-shadow: 0 2px 6px rgba(15, 23, 42, 0.16);
        }

        .jc-page :global(.jc-action-btn:focus-visible) {
          outline: 3px solid #38bdf8;
          outline-offset: 2px;
        }

        .jc-page :global(.jc-action-btn:disabled) {
          opacity: 0.66;
          filter: saturate(0.75);
        }

        .jc-page :global(.jc-action-btn.jc-primary:not(:disabled)) {
          animation: jc-pulse 1.9s ease-in-out infinite;
        }

        @keyframes jc-pulse {
          0%,
          100% {
            box-shadow: 0 0 0 0 rgba(46, 204, 113, 0);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(46, 204, 113, 0.18);
          }
        }

        @media (max-width: 640px) {
          .jc-container {
            padding: 12px;
            gap: 12px;
          }
          .jc-header-row {
            flex-direction: column;
            align-items: flex-start;
          }
          .jc-summary-text {
            margin-left: 0 !important;
            width: 100%;
          }
          .jc-moto-select {
            width: 100%;
          }
          .jc-safety-grid,
          .jc-status-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      {motoReadySaving && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 70,
            display: 'grid',
            placeItems: 'center',
            padding: 20,
            background: 'rgba(15, 23, 42, 0.52)',
            backdropFilter: 'blur(3px)',
          }}
        >
          <div style={{ width: 'min(100%, 360px)', display: 'grid', gap: 12 }}>
            <LoadingState label="Mengonfirmasi Moto Ready..." />
            <div style={{ color: '#fff', fontWeight: 800, textAlign: 'center', fontSize: 14 }}>
              Menyimpan status rider dan mengecek alur race berikutnya.
            </div>
          </div>
        </div>
      )}
      {motoReadyConfirmation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="moto-ready-confirmation-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 71,
            display: 'grid',
            placeItems: 'center',
            padding: 20,
            background: 'rgba(15, 23, 42, 0.58)',
            backdropFilter: 'blur(3px)',
          }}
        >
          <div style={{ width: 'min(100%, 420px)', borderRadius: 20, border: '3px solid #166534', background: '#f0fdf4', padding: 24, boxShadow: '0 20px 50px rgba(15, 23, 42, 0.35)', textAlign: 'center' }}>
            <div aria-hidden="true" style={{ width: 62, height: 62, margin: '0 auto 14px', display: 'grid', placeItems: 'center', borderRadius: '50%', background: '#22c55e', color: '#fff', fontSize: 36, fontWeight: 900 }}>
              ✓
            </div>
            <div id="moto-ready-confirmation-title" style={{ fontSize: 22, fontWeight: 950, color: '#14532d' }}>
              Moto Ready Terkonfirmasi
            </div>
            <div style={{ marginTop: 8, color: '#1f2937', fontWeight: 800 }}>
              {motoReadyConfirmation.categoryLabel} | {motoReadyConfirmation.motoName}
            </div>
            <div style={{ margin: '14px auto 20px', display: 'inline-flex', borderRadius: 999, border: '2px solid #166534', padding: '6px 12px', color: '#14532d', background: '#dcfce7', fontWeight: 950, fontSize: 13 }}>
              STATUS: {motoReadyConfirmation.status}
            </div>
            <button
              type="button"
              className="jc-action-btn jc-primary"
              onClick={() => setMotoReadyConfirmation(null)}
              style={{ width: '100%', padding: '13px 18px', borderRadius: 12, border: '2px solid #14532d', background: '#166534', color: '#fff', fontWeight: 950, fontSize: 16 }}
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
