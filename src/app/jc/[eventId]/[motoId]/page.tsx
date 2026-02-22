'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabaseClient'
import { PENALTY_DEFINITIONS } from '../../../../lib/penaltyDefinitions'

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
  const [penaltiesByRider, setPenaltiesByRider] = useState<
    Record<
      string,
      Array<{
        rule_code: string
        penalty_point: number
        approval_status?: string | null
      }>
    >
  >({})
  const [flags, setFlags] = useState<EventFlags>({ penalty_enabled: true, absent_enabled: true })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [locked, setLocked] = useState(false)
  const [query, setQuery] = useState('')
  const [absentMode, setAbsentMode] = useState(true)
  const [penaltyMode, setPenaltyMode] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [safetyOk, setSafetyOk] = useState<Record<string, boolean>>({})

  const handleLogout = async () => {
    await supabase.auth.signOut()
    document.cookie = 'sb-access-token=; Path=/; Max-Age=0'
    router.push('/login')
  }

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Request failed')
    return json
  }

  useEffect(() => {
    const loadMotos = async () => {
      if (!eventId) return
      setLoading(true)
      try {
        const [motoRes, catRes, flagRes] = await Promise.all([
          fetch(`/api/motos?event_id=${eventId}`),
          fetch(`/api/events/${eventId}/categories`),
          apiFetch(`/api/jury/events/${eventId}/modules`),
        ])
        const motoJson = await motoRes.json()
        const catJson = await catRes.json()
        const flagJson = flagRes
        const catRows = (catJson.data ?? []) as CategoryItem[]
        setCategories(catRows)
        setFlags(flagJson.data ?? { penalty_enabled: true, absent_enabled: true })

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
          return a.moto_order - b.moto_order
        })
        setMotos(sortedMotos)
        if (!selectedMotoId && sortedMotos.length) {
          setSelectedMotoId(sortedMotos[0].id)
        }
      } finally {
        setLoading(false)
      }
    }
    loadMotos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const loadMoto = async (silent = false) => {
    if (!selectedMotoId || !eventId) return
    if (!silent) setLoading(true)
    try {
      const [lockRes, riderRes, statusRes, penaltiesRes] = await Promise.all([
        apiFetch(`/api/jury/motos/${selectedMotoId}/lock-status`),
        apiFetch(`/api/jury/motos/${selectedMotoId}/riders`),
        apiFetch(`/api/jury/events/${eventId}/rider-status`),
        apiFetch(`/api/jury/events/${eventId}/rider-penalties`),
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

      const penaltyMap: Record<
        string,
        Array<{
          rule_code: string
          penalty_point: number
          approval_status?: string | null
        }>
      > = {}
      for (const row of penaltiesRes.data ?? []) {
        const approval = Array.isArray(row.rider_penalty_approvals)
          ? row.rider_penalty_approvals[0]?.approval_status
          : row.rider_penalty_approvals?.approval_status
        const list = penaltyMap[row.rider_id] ?? []
        list.push({
          rule_code: row.rule_code,
          penalty_point: Number(row.penalty_point ?? 0),
          approval_status: approval ?? null,
        })
        penaltyMap[row.rider_id] = list
      }
      setPenaltiesByRider(penaltyMap)
      setLastUpdated(new Date().toLocaleTimeString())
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

  const categoryLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) map.set(c.id, c.label)
    return map
  }, [categories])

  const selectedMoto = useMemo(() => motos.find((m) => m.id === selectedMotoId) ?? null, [motos, selectedMotoId])
  const selectedMotoLive = selectedMoto?.status === 'LIVE'
  const selectedCategoryLabel = selectedMoto
    ? categoryLabel.get(selectedMoto.category_id ?? '') ?? 'Unknown Category'
    : 'Kategori'

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

  const safetyRuleDefault = PENALTY_DEFINITIONS.find((p) => p.category === 'Safety')
  const safetyRuleIds = new Set(PENALTY_DEFINITIONS.filter((p) => p.category === 'Safety').map((p) => p.id))

  const ensureSafetyPenalty = async (riderId: string) => {
    if (!safetyRuleDefault || !flags.penalty_enabled) return
    const existing = penaltiesByRider[riderId] ?? []
    const hasSafety = existing.some((p) => safetyRuleIds.has(p.rule_code))
    if (hasSafety) return
    await apiFetch(`/api/jury/riders/${riderId}/penalties`, {
      method: 'POST',
      body: JSON.stringify({ event_id: eventId, stage: 'MOTO', rule_code: safetyRuleDefault.id }),
    })
  }

  const handleSaveStatus = async (riderId: string, status: StatusRow['participation_status'], order: number) => {
    if (!selectedMotoId) return
    if (!selectedMotoLive || locked) return
    if (!absentMode && status !== 'DNS') return
    setSaving(true)
    try {
      if (!safetyOk[riderId]) {
        await ensureSafetyPenalty(riderId)
      }
      if (status === 'DNS') {
        await apiFetch(`/api/jury/motos/${selectedMotoId}/results`, {
          method: 'POST',
          body: JSON.stringify({ results: [{ rider_id: riderId, result_status: 'DNS', finish_order: null }] }),
        })
      } else {
        if (!flags.absent_enabled) return
        await apiFetch(`/api/jury/events/${eventId}/rider-status`, {
          method: 'POST',
          body: JSON.stringify({
            rider_id: riderId,
            participation_status: status,
            registration_order: order,
            moto_id: selectedMotoId,
          }),
        })
      }
      await loadMoto(true)
    } finally {
      setSaving(false)
    }
  }

  const handlePenalty = async (riderId: string, ruleCode: string) => {
    if (!selectedMotoId) return
    if (!selectedMotoLive || locked) return
    if (!flags.penalty_enabled) return
    setSaving(true)
    try {
      await apiFetch(`/api/jury/riders/${riderId}/penalties`, {
        method: 'POST',
        body: JSON.stringify({ event_id: eventId, stage: 'MOTO', rule_code: ruleCode }),
      })
      await loadMoto(true)
    } finally {
      setSaving(false)
    }
  }

  const handleAllReady = async () => {
    if (!selectedMotoId) return
    if (!selectedMotoLive || locked) return
    if (!flags.absent_enabled) return
    setSaving(true)
    try {
      for (const r of riderList) {
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
      await loadMoto(true)
    } finally {
      setSaving(false)
    }
  }

  const bannerDisabled = !selectedMotoLive

  return (
    <div style={{ minHeight: '100vh', background: '#fff6da', color: '#111' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: 20, display: 'grid', gap: 16 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 28, fontWeight: 900 }}>Jury Start</div>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '2px solid #b91c1c',
                background: '#fee2e2',
                color: '#7f1d1d',
                fontWeight: 800,
              }}
            >
              Logout
            </button>
            <div style={{ marginLeft: 'auto', fontWeight: 700 }}>
              {selectedCategoryLabel} - {selectedMoto?.moto_name ?? '-'}
            </div>
            <select
              value={selectedMotoId}
              onChange={(e) => {
                const next = e.target.value
                setSelectedMotoId(next)
                router.replace(`/jc/${eventId}/${next}`)
              }}
              style={{
                padding: '12px 16px',
                borderRadius: 16,
                border: '2px solid #111',
                background: '#fff',
                fontWeight: 900,
              }}
            >
              {motos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.moto_order}. {m.moto_name} - {categoryLabel.get(m.category_id ?? '') ?? 'Category'} - {m.status}
                </option>
              ))}
            </select>
          </div>

          <div style={{ fontWeight: 700, color: '#333' }}>ABSENT + gate penalties sebelum race start.</div>
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

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => setAbsentMode((v) => !v)}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: '2px solid #111',
              background: absentMode ? '#2ecc71' : '#fff',
              color: absentMode ? '#fff' : '#111',
              fontWeight: 900,
            }}
          >
            ABSENT: {absentMode ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            onClick={() => setPenaltyMode((v) => !v)}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: '2px solid #111',
              background: penaltyMode ? '#e74c3c' : '#fff',
              color: penaltyMode ? '#fff' : '#111',
              fontWeight: 900,
            }}
          >
            PENALTY: {penaltyMode ? 'ON' : 'OFF'}
          </button>
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
            type="button"
            onClick={handleAllReady}
            disabled={saving || bannerDisabled || locked}
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
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
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
            <button
              type="button"
              onClick={() => {
                setStatuses((prev) => {
                  const next = { ...prev }
                  for (const r of riderList) {
                    next[r.id] = {
                      rider_id: r.id,
                      participation_status: 'ACTIVE',
                      registration_order: r.registration_order,
                    }
                  }
                  return next
                })
              }}
              disabled={saving || bannerDisabled || locked}
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: '2px solid #111',
                background: '#bfead2',
                fontWeight: 900,
              }}
            >
              Set All ACTIVE
            </button>
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
            const currentStatus = statuses[r.id]?.participation_status ?? 'ACTIVE'
            const statusDisabled = saving || bannerDisabled || locked || !absentMode
            const penaltyDisabled = saving || bannerDisabled || locked || !penaltyMode || !flags.penalty_enabled
            const statusColor =
              currentStatus === 'ACTIVE' ? '#dcfce7' : currentStatus === 'DNS' ? '#ffe9a8' : '#fee2e2'
            const penalties = penaltiesByRider[r.id] ?? []

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
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{r.no_plate_display}</div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{r.name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 12, fontWeight: 800 }}>Gate #{r.gate_position ?? '-'}</div>
                    <div
                      style={{
                        marginTop: 4,
                        padding: '4px 10px',
                        borderRadius: 999,
                        border: '2px solid #111',
                        background: statusColor,
                        fontWeight: 900,
                        fontSize: 11,
                      }}
                    >
                      {currentStatus}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {(['ACTIVE', 'DNS', 'ABSENT'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() =>
                        setStatuses((prev) => ({
                          ...prev,
                          [r.id]: {
                            rider_id: r.id,
                            participation_status: s,
                            registration_order: r.gate_position ?? 0,
                          },
                        }))
                      }
                      disabled={statusDisabled}
                      style={{
                        padding: '10px 8px',
                        borderRadius: 999,
                        border: '2px solid #111',
                        background: currentStatus === s ? statusColor : '#fff',
                        fontWeight: 900,
                        boxShadow: '0 4px 0 #111',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={safetyOk[r.id] !== false}
                      onChange={(e) => setSafetyOk((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                      disabled={saving || bannerDisabled || locked}
                    />
                    Safety OK
                  </label>
                  {safetyOk[r.id] === false && (
                    <span style={{ fontSize: 12, color: '#b91c1c', fontWeight: 800 }}>
                      Safety incomplete -> penalty otomatis
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleSaveStatus(r.id, currentStatus, r.gate_position ?? 0)}
                  disabled={saving || bannerDisabled || locked}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 999,
                    border: '2px solid #1b5e20',
                    background: 'linear-gradient(180deg, #d7f6e2 0%, #bfead2 100%)',
                    color: '#0f3d1a',
                    fontWeight: 900,
                    boxShadow: '0 4px 0 #1b5e20',
                  }}
                >
                  Save Status
                </button>

                {penaltyMode && (
                  <div
                    style={{
                      borderRadius: 12,
                      border: '2px solid #111',
                      padding: 10,
                      background: '#eef7f1',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>Penalty</div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {PENALTY_DEFINITIONS.map((p) => (
                        <label key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                          <input
                            type="checkbox"
                            disabled={penaltyDisabled}
                            onChange={(e) => {
                              if (e.currentTarget.checked) {
                                handlePenalty(r.id, p.id)
                                e.currentTarget.checked = false
                              }
                            }}
                          />
                          <span>
                            {p.label} (+{p.points})
                          </span>
                        </label>
                      ))}
                    </div>
                    <div
                      title={penalties.length > 0 ? penalties.map((p) => p.rule_code).join(', ') : 'No penalties'}
                      style={{ marginTop: 8, fontSize: 12, color: '#444' }}
                    >
                      Aktif: {penalties.length > 0 ? penalties.map((p) => p.rule_code).join(', ') : '-'}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
