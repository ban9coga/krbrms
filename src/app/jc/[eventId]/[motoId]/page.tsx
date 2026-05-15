'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import CheckerTopbar from '../../../../components/CheckerTopbar'
import { compareMotoSequence } from '../../../../lib/motoSequence'
import { supabase } from '../../../../lib/supabaseClient'
import { isMotoLive } from '../../../../lib/motoStatus'

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

type SafetyRequirement = {
  id: string
  label: string
  is_required: boolean
  sort_order?: number | null
  penalty_code?: string | null
}

type PenaltyRule = {
  code: string
  description: string | null
  penalty_point: number
  applies_to_stage: string
}

function getSafetyVisual(label: string) {
  const normalized = label.toLowerCase()

  if (normalized.includes('helm') || normalized.includes('helmet')) {
    return { icon: '⛑', shortLabel: 'Helm' }
  }
  if (normalized.includes('sarung tangan') || normalized.includes('glove') || normalized.includes('gloves')) {
    return { icon: '🧤', shortLabel: 'Gloves' }
  }
  if (normalized.includes('siku') || normalized.includes('elbow')) {
    return { icon: '💪', shortLabel: 'Siku' }
  }
  if (normalized.includes('lutut') || normalized.includes('knee')) {
    return { icon: '🦵', shortLabel: 'Lutut' }
  }
  if (normalized.includes('jersey')) {
    return { icon: '👕', shortLabel: 'Jersey' }
  }
  if (normalized.includes('sepatu') || normalized.includes('shoe')) {
    return { icon: '👟', shortLabel: 'Sepatu' }
  }
  if (normalized.includes('celana') || normalized.includes('pants')) {
    return { icon: '🩳', shortLabel: 'Celana' }
  }

  return { icon: '✓', shortLabel: label }
}

export default function JCPage() {
  const router = useRouter()
  const params = useParams()
  const eventId = String(params?.eventId ?? '')
  const initialMotoId = String(params?.motoId ?? '')

  const [motos, setMotos] = useState<MotoItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [selectedMotoId, setSelectedMotoId] = useState(initialMotoId)
  const [riders, setRiders] = useState<RiderItem[]>([])
  const [statuses, setStatuses] = useState<Record<string, StatusRow>>({})
  const [flags, setFlags] = useState<EventFlags>({
    penalty_enabled: true,
    absent_enabled: true,
    dns_enabled: true,
    dnf_enabled: true,
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [locked, setLocked] = useState(false)
  const [query, setQuery] = useState('')
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [safetyRequirements, setSafetyRequirements] = useState<SafetyRequirement[]>([])
  const [safetyChecks, setSafetyChecks] = useState<Record<string, Record<string, boolean>>>({})
  const [penaltiesByRider, setPenaltiesByRider] = useState<Record<string, Set<string>>>({})
  const [penaltyRules, setPenaltyRules] = useState<PenaltyRule[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const [allReadyDone, setAllReadyDone] = useState(false)

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session?.access_token) return data.session.access_token
    const refreshed = await supabase.auth.refreshSession()
    return refreshed.data.session?.access_token ?? null
  }, [])

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

  const loadMotos = useCallback(async () => {
    if (!eventId) return
    setLoading(true)
    setErrorMessage(null)
    try {
      const [motoRes, catRes, flagRes, safetyRes, ruleRes] = await Promise.all([
        fetch(`/api/motos?event_id=${eventId}`),
        fetch(`/api/events/${eventId}/categories`),
        apiFetch(`/api/jury/events/${eventId}/modules`),
        apiFetch(`/api/jury/events/${eventId}/safety-requirements`),
        apiFetch(`/api/jury/events/${eventId}/penalties`),
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
      setPenaltyRules((ruleRes.data ?? []) as PenaltyRule[])
      const uniqueSafety = new Map<string, SafetyRequirement>()
      for (const item of rawSafety) {
        const key = item.label.trim().toLowerCase()
        if (!uniqueSafety.has(key)) uniqueSafety.set(key, item)
      }
      setSafetyRequirements(Array.from(uniqueSafety.values()))

      const yearMap = new Map<string, number>()
      const genderMap = new Map<string, string>()
      for (const c of catRows) {
        yearMap.set(c.id, Number(c.year ?? 0))
        if (c.gender) genderMap.set(c.id, c.gender)
      }
      const sortedMotos = [...(motoJson.data ?? [])].sort((a: MotoItem, b: MotoItem) => {
        const ay = yearMap.get(a.category_id ?? '') ?? 0
        const by = yearMap.get(b.category_id ?? '') ?? 0
        if (by !== ay) return by - ay
        const order = { BOY: 0, GIRL: 1, MIX: 2 } as const
        const ag = order[(genderMap.get(a.category_id ?? '') as keyof typeof order) ?? 'MIX'] ?? 9
        const bg = order[(genderMap.get(b.category_id ?? '') as keyof typeof order) ?? 'MIX'] ?? 9
        if (ag !== bg) return ag - bg
        return compareMotoSequence(a, b)
      })
      setMotos(sortedMotos)
      const nextSelectable = sortedMotos.filter((m) => !isLockedStatus(m.status))
      if (!selectedMotoId && nextSelectable.length) {
        setSelectedMotoId(nextSelectable[0].id)
      } else if (selectedMotoId) {
        const currentStillSelectable = nextSelectable.some((m) => m.id === selectedMotoId)
        if (!currentStillSelectable) {
          setSelectedMotoId(nextSelectable[0]?.id ?? '')
        }
      }
      return sortedMotos
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal memuat data JC.')
    } finally {
      setLoading(false)
    }
    return []
  }, [apiFetch, eventId, selectedMotoId])

  useEffect(() => {
    void loadMotos()
  }, [loadMotos])

  const loadMoto = async (silent = false, preserveAllReadyDone = silent) => {
    if (!selectedMotoId || !eventId) return
    if (!preserveAllReadyDone) setAllReadyDone(false)
    if (!silent) setLoading(true)
    if (!silent) setErrorMessage(null)
    try {
      const [lockRes, riderRes, statusRes, safetyRes, penaltiesRes] = await Promise.all([
        apiFetch(`/api/jury/motos/${selectedMotoId}/lock-status`),
        apiFetch(`/api/jury/motos/${selectedMotoId}/riders`),
        apiFetch(`/api/jury/events/${eventId}/rider-status?moto_id=${selectedMotoId}`),
        apiFetch(`/api/jury/motos/${selectedMotoId}/safety-checks`),
        apiFetch(`/api/jury/events/${eventId}/rider-penalties?moto_id=${selectedMotoId}`),
      ])

      setLocked(!!lockRes.data)
      setRiders((riderRes.data ?? []).slice(0, 8))

      const statusList = (statusRes.data ?? []) as Array<{
        rider_id: string
        proposed_status?: string | null
      }>
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
      setStatuses((prev) => ({ ...prev, ...nextStatuses }))

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
      const penaltyMap: Record<string, Set<string>> = {}
      for (const row of penaltiesRes.data ?? []) {
        const set = penaltyMap[row.rider_id] ?? new Set<string>()
        set.add(String(row.rule_code))
        penaltyMap[row.rider_id] = set
      }
      setPenaltiesByRider(penaltyMap)
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
    () => motos.filter((m) => !isLockedStatus(m.status)),
    [motos]
  )
  const selectedMoto = useMemo(() => motos.find((m) => m.id === selectedMotoId) ?? null, [motos, selectedMotoId])
  const selectedMotoLive = isMotoLive(selectedMoto?.status)
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

  const summary = useMemo(() => {
    const s = { total: riderList.length, active: 0, dns: 0, absent: 0 }
    for (const r of riderList) {
      const status = statuses[r.id]?.participation_status ?? r.status ?? 'ACTIVE'
      if (status === 'DNS') s.dns += 1
      else if (status === 'ABSENT') s.absent += 1
      else s.active += 1
    }
    return s
  }, [riderList, statuses])

  const requiredSafety = useMemo(
    () => safetyRequirements.filter((r) => r.is_required !== false),
    [safetyRequirements]
  )

  const penaltyRuleCodeMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const rule of penaltyRules) {
      const code = rule.code?.trim()
      if (!code) continue
      map.set(code.toUpperCase(), code)
    }
    return map
  }, [penaltyRules])

  const isSafetyOk = useCallback(
    (riderId: string) => requiredSafety.every((item) => safetyChecks[riderId]?.[item.id] === true),
    [requiredSafety, safetyChecks]
  )

  const applySafetyPenalty = async (riderId: string, requirement: SafetyRequirement) => {
    const rawRuleCode = requirement.penalty_code?.trim()
    if (!rawRuleCode) {
      return { applied: false as const, reason: `mapping penalty ${requirement.label} belum diset` }
    }
    const normalizedRuleCode = rawRuleCode.toUpperCase()
    const resolvedRuleCode = penaltyRuleCodeMap.get(normalizedRuleCode)
    if (!resolvedRuleCode) {
      return { applied: false as const, reason: `penalty code ${rawRuleCode} belum ada` }
    }
    const existing = penaltiesByRider[riderId]
    if (existing && Array.from(existing).some((code) => code.toUpperCase() === normalizedRuleCode)) {
      return { applied: true as const, reason: null }
    }
    await apiFetch(`/api/jury/riders/${riderId}/penalties`, {
      method: 'POST',
      body: JSON.stringify({
        event_id: eventId,
        stage: 'MOTO',
        rule_code: resolvedRuleCode,
        note: `Missing ${requirement.label}`,
        moto_id: selectedMotoId,
      }),
    })
    setPenaltiesByRider((prev) => {
      const next = { ...prev }
      const set = new Set(next[riderId] ?? [])
      set.add(resolvedRuleCode)
      next[riderId] = set
      return next
    })
    return { applied: true as const, reason: null }
  }

  const activeCount = useMemo(() => {
    return riderList.filter((r) => statuses[r.id]?.participation_status === 'ACTIVE').length
  }, [riderList, statuses])
  const warningCount = useMemo(() => {
    return riderList.filter((r) => statuses[r.id]?.participation_status === 'ACTIVE' && !isSafetyOk(r.id)).length
  }, [riderList, statuses, isSafetyOk])

  const handleSaveStatus = async (riderId: string, status: StatusRow['participation_status'], order: number) => {
    if (!selectedMotoId) return
    if (!selectedMotoLive || locked) return
    const previousStatus = statuses[riderId]
    setSaving(true)
    setWarningMessage(null)
    setErrorMessage(null)
    try {
      setStatuses((prev) => ({
        ...prev,
        [riderId]: { rider_id: riderId, participation_status: status, registration_order: order },
      }))
      if (status === 'ACTIVE') {
        const missingPenaltyReasons = new Set<string>()
        for (const req of requiredSafety) {
          if (!safetyChecks[riderId]?.[req.id]) {
            const res = await applySafetyPenalty(riderId, req)
            if (!res.applied && res.reason) {
              missingPenaltyReasons.add(res.reason)
            }
          }
        }
        if (missingPenaltyReasons.size > 0) {
          setWarningMessage(
            `Rider tetap lanjut dengan WARNING. Auto-penalty dilewati: ${Array.from(missingPenaltyReasons).join(', ')}.`
          )
        }
      }
      if (status === 'ABSENT' && !flags.absent_enabled) return
      if (status === 'DNS' && !flags.dns_enabled) return
      await apiFetch(`/api/jury/events/${eventId}/rider-status`, {
        method: 'POST',
        body: JSON.stringify({
          rider_id: riderId,
          participation_status: status,
          registration_order: order,
          moto_id: selectedMotoId,
        }),
      })
      await loadMoto(true)
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

  const handleAllReady = async () => {
    if (!selectedMotoId) return
    if (!selectedMotoLive || locked) return
    setSaving(true)
    setWarningMessage(null)
    setErrorMessage(null)
    try {
      const missingPenaltyReasons = new Set<string>()
      for (const r of riderList) {
        const current = statuses[r.id]?.participation_status
        if (current === 'ABSENT' || current === 'DNS') continue
        for (const req of requiredSafety) {
          if (!safetyChecks[r.id]?.[req.id]) {
            const res = await applySafetyPenalty(r.id, req)
            if (!res.applied && res.reason) {
              missingPenaltyReasons.add(res.reason)
            }
          }
        }
        await apiFetch(`/api/jury/events/${eventId}/rider-status`, {
          method: 'POST',
          body: JSON.stringify({
            rider_id: r.id,
            participation_status: 'ACTIVE',
            registration_order: r.registration_order,
            moto_id: selectedMotoId,
          }),
        })
      }
      if (missingPenaltyReasons.size > 0) {
        setWarningMessage(
          `Sebagian rider lanjut dengan WARNING. Auto-penalty dilewati: ${Array.from(missingPenaltyReasons).join(', ')}.`
        )
      }
      await loadMoto(true, true)
      setAllReadyDone(true)
      alert(`All Ready tersimpan untuk ${selectedCategoryLabel} | ${selectedMoto?.moto_name ?? 'Moto'}`)
      await loadMoto(false, true)
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal menjalankan All Ready.')
      await loadMoto(true)
    } finally {
      setSaving(false)
    }
  }

  const bannerDisabled = !selectedMotoLive
  const interactionDisabled = saving || bannerDisabled || locked
  const safetyInteractionDisabled = interactionDisabled || allReadyDone
  const readyDisabled = interactionDisabled || allReadyDone
  const dnsDisabled = interactionDisabled || !allReadyDone || !flags.dns_enabled
  const absentDisabled = interactionDisabled || allReadyDone || !flags.absent_enabled
  const canGateReady = riderList.length > 0

  return (
    <div className="jc-page" style={{ minHeight: '100vh', background: '#fff6da', color: '#111' }}>
      <CheckerTopbar title="Checker Panel" />
      <div className="jc-container" style={{ maxWidth: 980, margin: '0 auto', padding: 20, display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <div className="jc-header-row" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 28, fontWeight: 900 }}>Jury Start</div>
            <div className="jc-summary-text" style={{ marginLeft: 'auto', fontWeight: 700 }}>
              {selectedCategoryLabel} - {selectedMoto?.moto_name ?? '-'} | Ready: {activeCount}/{summary.total}
              {warningCount > 0 ? ` | Warn: ${warningCount}` : ''}
            </div>
            <select
              value={selectedMotoId}
              onChange={(e) => {
                const next = e.target.value
                setSelectedMotoId(next)
                setAllReadyDone(false)
                router.replace(`/jc/${eventId}/${next}`)
              }}
              className="jc-moto-select"
              style={{
                padding: '12px 16px',
                borderRadius: 16,
                border: '2px solid #111',
                background: '#fff',
                fontWeight: 900,
              }}
            >
              {selectableMotos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.moto_order}. {m.moto_name} - {categoryLabel.get(m.category_id ?? '') ?? 'Category'} - {m.status}
                </option>
                ))}
            </select>
              <button
              type="button"
              onClick={async () => {
                const refreshedMotos = (await loadMotos()) ?? []
                const nextLiveMoto = refreshedMotos.find((m) => !isLockedStatus(m.status) && isMotoLive(m.status))
                if (nextLiveMoto) {
                  setSelectedMotoId(nextLiveMoto.id)
                  setAllReadyDone(false)
                  router.replace(`/jc/${eventId}/${nextLiveMoto.id}`)
                  return
                }
                await loadMoto(false, true)
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
              Refresh Moto
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
            Moto masih {selectedMoto?.status ?? 'UPCOMING'}. Input hanya bisa saat LIVE.
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

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
            Last updated: {lastUpdated ?? '-'}
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
              border: '2px solid #1b5e20',
              background: '#2ecc71',
              color: '#fff',
              fontWeight: 900,
              fontSize: 20,
            }}
          >
            All Ready
          </button>
          {allReadyDone && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ padding: '12px 14px', borderRadius: 12, background: '#dcfce7', fontWeight: 900, textAlign: 'center' }}>
                DNS siap dipakai. READY dan ABSENT dikunci setelah All Ready.
              </div>
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
              ACTIVE: {summary.active}
            </span>
            <span
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '2px solid #111',
                background: '#ffe9a8',
                fontWeight: 900,
              }}
            >
              DNS: {summary.dns}
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
                        fontSize: 34,
                        lineHeight: 1,
                        fontWeight: 950,
                        letterSpacing: '0.04em',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace',
                      }}
                    >
                      {r.no_plate_display}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, marginTop: 6 }}>{r.name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>Gate #{r.gate_position ?? '-'}</div>
                    <div
                      style={{
                        marginTop: 4,
                        padding: '4px 10px',
                        borderRadius: 999,
                        border: '2px solid #111',
                        background: statusBadge,
                        fontWeight: 900,
                        fontSize: 11,
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
                    const visual = getSafetyVisual(item.label)
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
                          padding: '10px 8px',
                          borderRadius: 12,
                          border: '2px solid #111',
                          background: checked ? '#2ecc71' : '#e5e7eb',
                          color: checked ? '#fff' : '#111',
                          fontWeight: 900,
                          display: 'grid',
                          gap: 4,
                          justifyItems: 'center',
                          alignContent: 'center',
                          minHeight: 74,
                        }}
                        title={item.label}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            fontSize: 24,
                            lineHeight: 1,
                          }}
                        >
                          {visual.icon}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
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

                <div className="jc-status-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <button
                    className="jc-action-btn jc-primary"
                    type="button"
                    onClick={() => handleSaveStatus(r.id, 'ACTIVE', r.gate_position ?? 0)}
                    disabled={readyDisabled}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 999,
                      border: '2px solid #1b5e20',
                      background: safetyOk ? '#2ecc71' : '#ffe9a8',
                      color: '#111',
                      fontWeight: 900,
                    }}
                  >
                    READY
                  </button>
                  <button
                    className="jc-action-btn"
                    type="button"
                    onClick={() => handleSaveStatus(r.id, 'DNS', r.gate_position ?? 0)}
                    disabled={dnsDisabled}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 999,
                      border: '2px solid #c2410c',
                      background: '#ffedd5',
                      color: '#9a3412',
                      fontWeight: 900,
                    }}
                  >
                    DNS
                  </button>
                  <button
                    className="jc-action-btn"
                    type="button"
                    onClick={() => handleSaveStatus(r.id, 'ABSENT', r.gate_position ?? 0)}
                    disabled={absentDisabled}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 999,
                      border: '2px solid #b91c1c',
                      background: '#fee2e2',
                      color: '#7f1d1d',
                      fontWeight: 900,
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

