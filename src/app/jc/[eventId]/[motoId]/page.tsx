'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import CheckerTopbar from '../../../../components/CheckerTopbar'
import { useHighVisibility } from '../../../../hooks/useHighVisibility'
import { compareMotoSequence } from '../../../../lib/motoSequence'
import { supabase } from '../../../../lib/supabaseClient'
import { isMotoLive, isMotoUpcoming } from '../../../../lib/motoStatus'

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
}

type RiderItem = {
  id: string
  name: string
  no_plate_display: string
  gate_position?: number | null
}

type StatusRow = {
  rider_id: string
  participation_status: 'ACTIVE' | 'DNS' | 'DNF' | 'ABSENT'
  registration_order: number
}

type EventFlags = {
  penalty_enabled: boolean
  absent_enabled: boolean
  dns_enabled: boolean
  dnf_enabled: boolean
}

const isLockedStatus = (status?: string | null) => String(status ?? '').toUpperCase() === 'LOCKED'
const pickPrepMotoId = (list: MotoItem[], currentId: string, liveMotoId?: string | null) => {
  const selectableUpcoming = list.filter((m) => !isLockedStatus(m.status) && isMotoUpcoming(m.status))
  if (currentId) {
    const currentMoto = list.find((m) => m.id === currentId)
    if (currentMoto && !isLockedStatus(currentMoto.status) && (isMotoUpcoming(currentMoto.status) || isMotoLive(currentMoto.status))) {
      return currentId
    }
  }
  if (liveMotoId) {
    const liveIndex = list.findIndex((m) => m.id === liveMotoId)
    if (liveIndex >= 0) {
      const nextAfterLive = list.slice(liveIndex + 1).find((m) => !isLockedStatus(m.status) && isMotoUpcoming(m.status))
      if (nextAfterLive) return nextAfterLive.id
    }
  }
  return selectableUpcoming[0]?.id ?? ''
}

const pickFollowingPrepMotoId = (list: MotoItem[], currentId: string) => {
  const selectableUpcoming = list.filter((m) => !isLockedStatus(m.status) && isMotoUpcoming(m.status))
  if (!currentId) return selectableUpcoming[0]?.id ?? ''

  const currentIndex = list.findIndex((m) => m.id === currentId)
  if (currentIndex >= 0) {
    const nextAfterCurrent = list
      .slice(currentIndex + 1)
      .find((m) => !isLockedStatus(m.status) && isMotoUpcoming(m.status))
    if (nextAfterCurrent) return nextAfterCurrent.id
  }

  return selectableUpcoming.find((m) => m.id !== currentId)?.id ?? ''
}

type SafetyRequirement = {
  id: string
  label: string
  is_required: boolean
  sort_order?: number | null
  penalty_code?: string | null
  icon_key?: string | null
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
  }>
) => {
  const nextStatuses: Record<string, StatusRow> = {}
  for (const row of statusList) {
    if (row.proposed_status) {
      nextStatuses[row.rider_id] = {
        rider_id: row.rider_id,
        participation_status: row.proposed_status as StatusRow['participation_status'],
        registration_order: 0,
      }
    }
  }
  return nextStatuses
}

export default function JCPage() {
  const params = useParams()
  const eventId = String(params?.eventId ?? '')
  const initialMotoId = String(params?.motoId ?? '')

  const [motos, setMotos] = useState<MotoItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [selectedMotoId, setSelectedMotoId] = useState(initialMotoId)
  const [riders, setRiders] = useState<RiderItem[]>([])
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
  const [bulkReadyState, setBulkReadyState] = useState<{
    motoId: string
    previousStatuses: Record<string, StatusRow | null>
  } | null>(null)
  const { highVisibility, toggleHighVisibility } = useHighVisibility('jury-checker-high-visibility')

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session?.access_token) return data.session.access_token
    const refreshed = await supabase.auth.refreshSession()
    return refreshed.data.session?.access_token ?? null
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

  const apiFetch = useCallback(async (url: string, options: RequestInit = {}, retryUnauthorized = true) => {
    const token = await getToken()
    const headers: Record<string, string> = {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...((options.headers ?? {}) as Record<string, string>),
    }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 401 && retryUnauthorized) {
        return apiFetch(url, options, false)
      }
      if (res.status === 401) {
        throw new Error('Session login habis. Silakan login ulang.')
      }
      throw new Error(json?.error || 'Request failed')
    }
    return json
  }, [getToken])

  const incidentMoto = useMemo(() => motos.find((m) => isMotoLive(m.status)) ?? null, [motos])
  const incidentMotoId = incidentMoto?.id ?? ''

  const loadMotos = useCallback(async (silent = false) => {
    if (!eventId) return
    if (!silent) setLoading(true)
    if (!silent) setErrorMessage(null)
    try {
      const [motoRes, catRes, flagRes, safetyRes] = await Promise.all([
        fetch(`/api/motos?event_id=${eventId}`),
        fetch(`/api/events/${eventId}/categories`),
        apiFetch(`/api/jury/events/${eventId}/modules`),
        apiFetch(`/api/jury/events/${eventId}/safety-requirements`),
      ])
      const motoJson = await motoRes.json()
      const catJson = await catRes.json()
      const flagJson = flagRes
      const catRows = (catJson.data ?? []) as CategoryItem[]
      setCategories(catRows)
      setFlags(
        flagJson.data ?? {
          penalty_enabled: true,
          absent_enabled: true,
          dns_enabled: true,
          dnf_enabled: true,
        }
      )
      const rawSafety = (safetyRes.data ?? []) as SafetyRequirement[]
      const uniqueSafety = new Map<string, SafetyRequirement>()
      for (const item of rawSafety) {
        const key = item.label.trim().toLowerCase()
        if (!uniqueSafety.has(key)) uniqueSafety.set(key, item)
      }
      setSafetyRequirements(Array.from(uniqueSafety.values()))

      const sortedMotos = [...(motoJson.data ?? [])].sort(compareMotoSequence)
      setMotos(sortedMotos)
      const liveMoto = sortedMotos.find((m) => isMotoLive(m.status))
      const nextMotoId = pickPrepMotoId(sortedMotos, selectedMotoId, liveMoto?.id ?? null)
      if (nextMotoId && nextMotoId !== selectedMotoId) {
        setSelectedMotoId(nextMotoId)
        setAllReadyDone(false)
        setBulkReadyState(null)
        syncPrepMotoUrl(nextMotoId)
      }
      if (!nextMotoId && selectedMotoId) {
        setSelectedMotoId('')
        setRiders([])
        setStatuses({})
        setAllReadyDone(false)
        setBulkReadyState(null)
      }
      return sortedMotos
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal memuat data JC.')
    } finally {
      if (!silent) setLoading(false)
    }
    return []
  }, [apiFetch, eventId, selectedMotoId, syncPrepMotoUrl])

  useEffect(() => {
    void loadMotos(false)
    const interval = setInterval(() => {
      void loadMotos(true)
    }, 5000)
    return () => clearInterval(interval)
  }, [loadMotos])

  const loadMoto = async (silent = false, preserveAllReadyDone = silent) => {
    if (!selectedMotoId || !eventId) {
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
      const [lockRes, riderRes, statusRes, safetyRes] = await Promise.all([
        apiFetch(`/api/jury/motos/${selectedMotoId}/lock-status`),
        apiFetch(`/api/jury/motos/${selectedMotoId}/riders`),
        apiFetch(`/api/jury/events/${eventId}/rider-status?moto_id=${selectedMotoId}`),
        apiFetch(`/api/jury/motos/${selectedMotoId}/safety-checks`),
      ])

      setLocked(!!lockRes.data)
      if (lockRes.data) {
        await loadMotos(true)
        return
      }
      setRiders((riderRes.data ?? []).slice(0, 8))

      const statusList = (statusRes.data ?? []) as Array<{
        rider_id: string
        proposed_status?: string | null
      }>
      setStatuses(buildStatusMap(statusList))

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
  }

  useEffect(() => {
    loadMoto()
    const interval = setInterval(() => loadMoto(true), 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMotoId, eventId])

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
      setIncidentRiders((riderRes.data ?? []).slice(0, 8))

      const statusList = (statusRes.data ?? []) as Array<{
        rider_id: string
        proposed_status?: string | null
      }>
      setIncidentStatuses(buildStatusMap(statusList))
      setIncidentLastUpdated(new Date().toLocaleTimeString())
    } catch (err: unknown) {
      if (!silent) {
        setErrorMessage(err instanceof Error ? err.message : 'Gagal memuat incident moto LIVE.')
      }
    }
  }, [apiFetch, eventId, incidentMotoId, loadMotos])

  useEffect(() => {
    void loadIncidentMoto()
    const interval = setInterval(() => {
      void loadIncidentMoto(true)
    }, 5000)
    return () => clearInterval(interval)
  }, [loadIncidentMoto])

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

  const selectableMotos = useMemo(
    () =>
      motos.filter(
        (m) =>
          !isLockedStatus(m.status) &&
          (isMotoUpcoming(m.status) || (m.id === selectedMotoId && isMotoLive(m.status)))
      ),
    [motos, selectedMotoId]
  )
  const selectedMoto = useMemo(() => motos.find((m) => m.id === selectedMotoId) ?? null, [motos, selectedMotoId])
  const selectedMotoUpcoming = isMotoUpcoming(selectedMoto?.status)
  const selectedMotoPinnedLive = !!selectedMoto && isMotoLive(selectedMoto.status)
  const selectedMotoPreppable = !!selectedMoto && !isLockedStatus(selectedMoto.status) && (selectedMotoUpcoming || selectedMotoPinnedLive)
  const bulkReadyApplied = bulkReadyState?.motoId === selectedMotoId
  const nextPrepMotoId = useMemo(() => pickFollowingPrepMotoId(motos, selectedMotoId), [motos, selectedMotoId])
  const nextPrepMoto = useMemo(() => motos.find((m) => m.id === nextPrepMotoId) ?? null, [motos, nextPrepMotoId])
  const incidentCategoryLabel = incidentMoto
    ? categoryLabel.get(incidentMoto.category_id ?? '') ?? 'Unknown Category'
    : 'Kategori'
  const selectedCategoryLabel = selectedMoto
    ? categoryLabel.get(selectedMoto.category_id ?? '') ?? 'Unknown Category'
    : 'Kategori'
  const hasSafetyRequirements = safetyRequirements.length > 0

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

  const activeCount = useMemo(() => {
    return riderList.filter((r) => statuses[r.id]?.participation_status === 'ACTIVE').length
  }, [riderList, statuses])
  const warningCount = useMemo(() => {
    return riderList.filter((r) => statuses[r.id]?.participation_status === 'ACTIVE' && !isSafetyOk(r.id)).length
  }, [riderList, statuses, isSafetyOk])
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

    const previousStatuses = riderList.reduce<Record<string, StatusRow | null>>((acc, rider) => {
      acc[rider.id] = statuses[rider.id] ?? null
      return acc
    }, {})

    setSaving(true)
    setWarningMessage(null)
    setErrorMessage(null)
    try {
      const nextStatuses = riderList.reduce<Record<string, StatusRow>>((acc, rider, index) => {
        acc[rider.id] = {
          rider_id: rider.id,
          participation_status: 'ACTIVE',
          registration_order: rider.gate_position ?? rider.registration_order ?? index + 1,
        }
        return acc
      }, {})

      setStatuses(nextStatuses)
      setAllReadyDone(false)

      await Promise.all(
        riderList.map((rider, index) =>
          apiFetch(`/api/jury/events/${eventId}/rider-status`, {
            method: 'POST',
            body: JSON.stringify({
              rider_id: rider.id,
              participation_status: 'ACTIVE',
              registration_order: rider.gate_position ?? rider.registration_order ?? index + 1,
              moto_id: selectedMotoId,
            }),
          })
        )
      )

      setBulkReadyState({ motoId: selectedMotoId, previousStatuses })
      setWarningMessage(`Semua rider di ${selectedMoto?.moto_name ?? 'moto ini'} ditandai READY. Kalau ada yang keliru, tekan Undo All Riders Ready.`)
      setLastUpdated(new Date().toLocaleTimeString())
      setTimeout(() => {
        void loadMoto(true, true)
      }, 350)
    } catch (err: unknown) {
      const restoredStatuses = Object.entries(previousStatuses).reduce<Record<string, StatusRow>>((acc, [riderId, row]) => {
        if (row) acc[riderId] = row
        return acc
      }, {})
      setStatuses(restoredStatuses)
      setErrorMessage(err instanceof Error ? err.message : 'Gagal set semua rider READY.')
      await loadMoto(true)
    } finally {
      setSaving(false)
    }
  }

  const handleUndoAllRidersReady = async () => {
    if (!selectedMotoId || !bulkReadyApplied || !bulkReadyState) return
    if (!selectedMotoPreppable || locked) return

    const previousStatuses = bulkReadyState.previousStatuses

    setSaving(true)
    setWarningMessage(null)
    setErrorMessage(null)
    try {
      const restoredStatuses = Object.entries(previousStatuses).reduce<Record<string, StatusRow>>((acc, [riderId, row]) => {
        if (row) acc[riderId] = row
        return acc
      }, {})
      setStatuses(restoredStatuses)
      setAllReadyDone(false)

      await Promise.all(
        riderList.map((rider) => {
          const previous = previousStatuses[rider.id] ?? null
          if (!previous) {
            return apiFetch(
              `/api/jury/events/${eventId}/rider-status?rider_id=${encodeURIComponent(rider.id)}&moto_id=${encodeURIComponent(selectedMotoId)}`,
              { method: 'DELETE' }
            )
          }
          return apiFetch(`/api/jury/events/${eventId}/rider-status`, {
            method: 'POST',
            body: JSON.stringify({
              rider_id: rider.id,
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
      setTimeout(() => {
        void loadMoto(true, true)
      }, 350)
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
    setAllReadyDone(true)
    setWarningMessage('Status prep rider saat ini dikunci. MC akan baca READY atau ABSENT sesuai hasil pengecekan checker.')
    setLastUpdated(new Date().toLocaleTimeString())
    alert(`Moto Ready dikonfirmasi untuk ${selectedCategoryLabel} | ${selectedMoto?.moto_name ?? 'Moto'}`)
  }

  const handleAdvancePrepMoto = () => {
    setErrorMessage(null)
    if (!nextPrepMotoId) {
      setWarningMessage('Belum ada moto berikutnya untuk dipersiapkan. Panel prep tetap stay di moto ini.')
      return
    }
    setWarningMessage(`Prep dipindah ke ${categoryLabel.get(nextPrepMoto?.category_id ?? '') ?? 'Kategori'} | ${nextPrepMoto?.moto_name ?? 'Moto berikutnya'}.`)
    setAllReadyDone(false)
    setBulkReadyState(null)
    setQuery('')
    setSelectedMotoId(nextPrepMotoId)
    syncPrepMotoUrl(nextPrepMotoId)
  }

  const bannerDisabled = !selectedMotoPreppable
  const interactionDisabled = saving || bannerDisabled || locked
  const safetyInteractionDisabled = interactionDisabled || allReadyDone
  const readyDisabled = interactionDisabled
  const absentDisabled = interactionDisabled || allReadyDone || !flags.absent_enabled
  const bulkReadyDisabled = interactionDisabled || allReadyDone || riderList.length === 0
  const canGateReady = riderList.length > 0 && allPrepReviewed
  const canAdvancePrepMoto = allReadyDone && !!nextPrepMotoId
  const incidentInteractionDisabled = saving || incidentLocked || !incidentMotoId
  const incidentDnsDisabled = incidentInteractionDisabled || !flags.dns_enabled

  return (
    <div className="jc-page" style={{ minHeight: '100vh', background: '#fff6da', color: '#111' }}>
      <CheckerTopbar title="Checker Panel" />
      <div className="jc-container" style={{ maxWidth: 980, margin: '0 auto', padding: 20, display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="jc-header-row" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: highVisibility ? 34 : 28, fontWeight: 900 }}>Checker Gate Start</div>
            <div className="jc-summary-text" style={{ marginLeft: 'auto', fontWeight: 700 }}>
              Prep: {selectedCategoryLabel} - {selectedMoto?.moto_name ?? 'Belum ada moto prep'} | Ready: {activeCount}/{summary.total} | Belum Dicek: {summary.unchecked}
              {warningCount > 0 ? ` | Warning: ${warningCount}` : ''}
            </div>
            <select
              value={selectedMotoId}
              onChange={(e) => {
                const next = e.target.value
                setSelectedMotoId(next)
                setAllReadyDone(false)
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
              }}
              disabled={selectableMotos.length === 0}
            >
              {selectableMotos.length === 0 && <option value="">Belum ada moto prep aktif</option>}
              {selectableMotos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.moto_order}. {m.moto_name} - {categoryLabel.get(m.category_id ?? '') ?? 'Category'}{isMotoLive(m.status) ? ' (Pinned LIVE)' : ''}
                </option>
                ))}
            </select>
            <button
              type="button"
              onClick={async () => {
                const refreshedMotos = (await loadMotos(false)) ?? []
                const liveMoto = refreshedMotos.find((m) => isMotoLive(m.status))
                const nextMotoId = pickPrepMotoId(refreshedMotos, selectedMotoId, liveMoto?.id ?? null)
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
              }}
            >
              {highVisibility ? 'Mode Besar Aktif' : 'Mode Besar'}
            </button>
          </div>

          <div style={{ fontWeight: 700, color: '#333' }}>Safety checklist sebelum race start.</div>
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

        {selectedMotoPinnedLive && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '2px solid #0f766e',
              background: '#ccfbf1',
              color: '#134e4a',
              fontWeight: 800,
            }}
          >
            Moto prep ini sudah auto-LIVE di sistem, tapi panel checker tetap dipin di sini supaya pengecekan rider tidak loncat ke moto berikutnya.
          </div>
        )}
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
            gap: 12,
            padding: 18,
            borderRadius: 20,
            border: '3px solid #7f1d1d',
            background: 'linear-gradient(180deg, #fff1f2 0%, #ffe4e6 100%)',
            boxShadow: '0 10px 0 #7f1d1d',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', color: '#9f1239' }}>CURRENT MOTO INCIDENT</div>
              <div style={{ fontSize: highVisibility ? 24 : 20, fontWeight: 900 }}>
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
            <div style={{ display: 'grid', gap: 10 }}>
              {incidentRiderList.map((r) => {
                const rawStatus = incidentStatuses[r.id]?.participation_status
                const statusLabel = !rawStatus ? 'READY/UNKNOWN' : rawStatus === 'ACTIVE' ? 'READY' : rawStatus
                const isDns = rawStatus === 'DNS'
                return (
                  <div
                    key={`incident-${r.id}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 12,
                      alignItems: 'center',
                      padding: '12px 14px',
                      borderRadius: 14,
                      border: '2px solid #7f1d1d',
                      background: '#fff',
                    }}
                  >
                    <div style={{ display: 'grid', gap: 4 }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: highVisibility ? 28 : 24, fontWeight: 950 }}>{r.no_plate_display}</span>
                        <span style={{ fontWeight: 900 }}>{r.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#7f1d1d' }}>Gate #{r.gate_position ?? '-'}</span>
                      </div>
                      <div
                        style={{
                          width: 'fit-content',
                          padding: '4px 10px',
                          borderRadius: 999,
                          border: '2px solid #111',
                          background: isDns ? '#fee2e2' : '#ffe4e6',
                          fontWeight: 900,
                          fontSize: 12,
                        }}
                      >
                        {statusLabel}
                      </div>
                    </div>
                    <button
                      className="jc-action-btn"
                      type="button"
                      onClick={() =>
                        isDns
                          ? handleUndoIncidentDns(r.id)
                          : handleIncidentDns(r.id, r.gate_position ?? r.registration_order ?? 0)
                      }
                      disabled={incidentDnsDisabled}
                      style={{
                        padding: highVisibility ? '14px 16px' : '12px 14px',
                        borderRadius: 999,
                        border: `2px solid ${isDns ? '#1d4ed8' : '#c2410c'}`,
                        background: isDns ? '#dbeafe' : '#ffedd5',
                        color: isDns ? '#1e3a8a' : '#9a3412',
                        fontWeight: 900,
                        fontSize: highVisibility ? 16 : undefined,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isDns ? 'UNDO DNS' : 'SET DNS'}
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div
              style={{
                padding: '12px 14px',
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
            gap: 12,
            padding: 16,
            borderRadius: 18,
            border: '2px solid #166534',
            background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%)',
            boxShadow: '0 5px 0 #166534',
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
            {selectedMotoPinnedLive ? 'PINNED PREP LIVE' : 'NEXT MOTO PREP'}
          </div>
          <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
            Last updated PREP: {lastUpdated ?? '-'}
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gap: 6,
            padding: '12px 14px',
            borderRadius: 14,
            border: '2px solid #bbf7d0',
            background: '#ffffff',
          }}
        >
          <div style={{ fontSize: 11, color: '#166534', fontWeight: 900, letterSpacing: 1 }}>
            MOTO PREP SAAT INI
          </div>
          <div style={{ fontSize: highVisibility ? 26 : 22, fontWeight: 950, color: '#111827' }}>
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
              {selectedMotoPinnedLive ? 'Moto ini sudah LIVE tapi tetap dipin di panel prep checker.' : 'Moto ini masih fase prep sebelum start.'}
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
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
          <button
            className="jc-action-btn jc-primary"
            type="button"
            onClick={handleAllReady}
            disabled={interactionDisabled || !canGateReady}
            style={{
              padding: '14px 18px',
              borderRadius: 999,
              border: '2px solid #1d4ed8',
              background: 'linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)',
              color: '#fff',
              fontWeight: 900,
              fontSize: highVisibility ? 24 : 20,
              boxShadow: '0 5px 0 #1e40af',
            }}
          >
            Moto Ready
          </button>
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
                Status READY dan ABSENT saat ini dikunci sampai di-reset. Gunakan reset kalau checker perlu buka lagi prep moto ini.
              </div>
              <button
                className="jc-action-btn"
                type="button"
                onClick={handleAdvancePrepMoto}
                disabled={saving}
                style={{
                  padding: '12px 14px',
                  borderRadius: 999,
                  border: '2px solid #1d4ed8',
                  background: canAdvancePrepMoto ? '#dbeafe' : '#eff6ff',
                  color: '#1e3a8a',
                  fontWeight: 900,
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {nextPrepMoto
                  ? `Lanjut ke Moto Berikutnya: ${nextPrepMoto.moto_name}`
                  : 'Belum Ada Moto Berikutnya'}
              </button>
              <button
                className="jc-action-btn"
                type="button"
                onClick={() => setAllReadyDone(false)}
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
                Reset Disabled
              </button>
            </div>
          )}
          <button
            className="jc-action-btn jc-primary"
            type="button"
            onClick={bulkReadyApplied ? handleUndoAllRidersReady : handleAllRidersReady}
            disabled={bulkReadyDisabled}
            style={{
              padding: '12px 18px',
              borderRadius: 999,
              border: bulkReadyApplied ? '2px solid #b91c1c' : '2px solid #365314',
              background: bulkReadyApplied ? '#fee2e2' : 'linear-gradient(180deg, #bef264 0%, #84cc16 100%)',
              color: bulkReadyApplied ? '#7f1d1d' : '#1a2e05',
              fontWeight: 900,
              fontSize: highVisibility ? 22 : 18,
              boxShadow: bulkReadyApplied ? '0 4px 0 #b91c1c' : '0 4px 0 #4d7c0f',
            }}
          >
            {bulkReadyApplied ? 'Undo All Riders Ready' : 'All Riders Ready'}
          </button>
          <button
            className="jc-action-btn"
            type="button"
            onClick={async () => {
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
              for (const rider of riderList) {
                for (const item of safetyRequirements) {
                  await apiFetch(`/api/jury/motos/${selectedMotoId}/safety-checks`, {
                    method: 'POST',
                    body: JSON.stringify({
                      rider_id: rider.id,
                      requirement_id: item.id,
                      is_checked: true,
                    }),
                  })
                }
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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

        {loading && <div style={{ fontWeight: 900 }}>Loading...</div>}

        <div
          style={{
            display: 'grid',
            gap: 12,
            maxHeight: '70vh',
            overflowY: 'auto',
            paddingRight: 6,
          }}
        >
          {filteredRiders.map((r) => {
            const rawStatus = statuses[r.id]?.participation_status
            const currentStatus = rawStatus ?? 'UNSET'
            const hasStatus = typeof rawStatus === 'string'
            const safetyOk = isSafetyOk(r.id)
            const statusBadge =
              !hasStatus
                ? '#e5e7eb'
                : currentStatus === 'ABSENT'
                ? '#fee2e2'
                : currentStatus === 'ACTIVE' && safetyOk
                ? '#dcfce7'
                : currentStatus === 'ACTIVE'
                ? '#ffe9a8'
                : '#e5e7eb'

            return (
              <div
                key={r.id}
                style={{
                  padding: 14,
                  borderRadius: 14,
                  border: '2px solid #111',
                  background: 'linear-gradient(180deg, #ffffff 0%, #f7f7f7 100%)',
                  display: 'grid',
                  gap: 10,
                  boxShadow: '0 6px 0 #111',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div>
                    <div
                      style={{
                        fontSize: highVisibility ? 42 : 34,
                        lineHeight: 1,
                        fontWeight: 950,
                        letterSpacing: '0.04em',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace',
                      }}
                    >
                      {r.no_plate_display}
                    </div>
                    <div style={{ fontSize: highVisibility ? 18 : 15, fontWeight: 800, marginTop: 6 }}>{r.name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
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
                        : currentStatus === 'ACTIVE' && safetyOk
                        ? 'READY'
                        : currentStatus === 'ACTIVE'
                        ? 'WARNING'
                        : currentStatus}
                    </div>
                  </div>
                </div>

                <div className="jc-safety-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
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
                          minHeight: highVisibility ? 88 : 74,
                        }}
                        title={item.label}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            fontSize: highVisibility ? 28 : 24,
                            lineHeight: 1,
                          }}
                        >
                          {visual.icon}
                        </span>
                        <span
                          style={{
                            fontSize: highVisibility ? 13 : 12,
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
                    disabled={readyDisabled}
                    style={{
                      padding: highVisibility ? '14px 16px' : '12px 14px',
                      borderRadius: 999,
                      border: '2px solid #1b5e20',
                      background: statuses[r.id]?.participation_status === 'ACTIVE' ? '#dcfce7' : safetyOk ? '#2ecc71' : '#ffe9a8',
                      color: '#111',
                      fontWeight: 900,
                      fontSize: highVisibility ? 16 : undefined,
                    }}
                  >
                    {statuses[r.id]?.participation_status === 'ACTIVE' ? 'UNDO READY' : 'READY'}
                  </button>
                  <button
                    className="jc-action-btn"
                    type="button"
                    onClick={() => handleSaveStatus(r.id, 'ABSENT', r.gate_position ?? 0)}
                    disabled={absentDisabled}
                    style={{
                      padding: highVisibility ? '14px 16px' : '12px 14px',
                      borderRadius: 999,
                      border: '2px solid #b91c1c',
                      background: '#fee2e2',
                      color: '#7f1d1d',
                      fontWeight: 900,
                      fontSize: highVisibility ? 16 : undefined,
                    }}
                  >
                    ABSENT
                  </button>
                </div>
              </div>
            )
          })}
        </div>
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
    </div>
  )
}

