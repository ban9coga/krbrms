'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabaseClient'
import { PENALTY_DEFINITIONS } from '../../../lib/penaltyDefinitions'

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

type PenaltyRule = {
  code: string
  description: string | null
  penalty_point: number
  applies_to_stage: string
}

type RiderItem = {
  id: string
  name: string
  no_plate_display: string
  gate_position?: number
}

type MotoItem = {
  id: string
  moto_name: string
  moto_order: number
  status: string
  category_id?: string
}

type StatusRow = {
  rider_id: string
  participation_status: 'ACTIVE' | 'DNS' | 'DNF' | 'ABSENT'
  registration_order: number
}

export default function JuryStartPage() {
  const router = useRouter()
  const [events, setEvents] = useState<EventItem[]>([])
  const [eventId, setEventId] = useState('')
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [motos, setMotos] = useState<MotoItem[]>([])
  const [selectedMotoId, setSelectedMotoId] = useState('')
  const [rules, setRules] = useState<PenaltyRule[]>([])
  const [riders, setRiders] = useState<RiderItem[]>([])
  const [statuses, setStatuses] = useState<Record<string, StatusRow>>({})
  const [approvalMap, setApprovalMap] = useState<Record<string, { approval_status: string; proposed_status?: string | null }>>(
    {}
  )
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
  const [flags, setFlags] = useState<{ penalty_enabled: boolean; absent_enabled: boolean } | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [role, setRole] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [query, setQuery] = useState('')
  const [openPenalty, setOpenPenalty] = useState<Record<string, boolean>>({})

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

  const handleLogout = async () => {
    await supabase.auth.signOut()
    document.cookie = 'sb-access-token=; Path=/; Max-Age=0'
    router.push('/login')
  }

  useEffect(() => {
    const loadEvents = async () => {
      const res = await apiFetch('/api/jury/events?status=LIVE,UPCOMING')
      setEvents(res.data ?? [])
      if (!eventId && res.data?.length) setEventId(res.data[0].id)
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
      setRole(r)
    }
    loadRole()
  }, [])

  useEffect(() => {
    const loadAll = async () => {
      if (!eventId) return
      setLoading(true)
      try {
        const [flagRes, ruleRes, motoRes, catRes] = await Promise.all([
          apiFetch(`/api/jury/events/${eventId}/modules`),
          apiFetch(`/api/jury/events/${eventId}/penalties`),
          fetch(`/api/motos?event_id=${eventId}`),
          fetch(`/api/events/${eventId}/categories`),
        ])
        setFlags(flagRes.data ?? { penalty_enabled: false, absent_enabled: false })
        setRules((ruleRes.data ?? []) as PenaltyRule[])
        const motoJson = await motoRes.json()
        const catJson = await catRes.json()
        const catRows = (catJson.data ?? []) as CategoryItem[]
        setCategories(catRows)
        const yearMap = new Map<string, number>()
        const genderMap = new Map<string, string>()
        for (const c of catRows) {
          yearMap.set(c.id, c.year ?? 0)
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
          const liveMoto = sortedMotos.find((m) => m.status === 'LIVE')
          setSelectedMotoId((liveMoto ?? sortedMotos[0]).id)
        }
      } finally {
        setLoading(false)
      }
    }
    loadAll()
  }, [eventId])

  useEffect(() => {
    const loadMoto = async () => {
      if (!selectedMotoId) {
        setRiders([])
        setLocked(false)
        setPenaltiesByRider({})
        return
      }
      setLoading(true)
      try {
        const [lockRes, riderRes, statusRes] = await Promise.all([
          apiFetch(`/api/jury/motos/${selectedMotoId}/lock-status`),
          apiFetch(`/api/jury/motos/${selectedMotoId}/riders`),
          apiFetch(`/api/jury/events/${eventId}/rider-status`),
        ])
        setLocked(!!lockRes.data)
        setRiders((riderRes.data ?? []) as RiderItem[])
        const statusList = (statusRes.data ?? []) as Array<{
          rider_id: string
          approval_status: string
          proposed_status?: string | null
        }>
        const map: Record<string, { approval_status: string; proposed_status?: string | null }> = {}
        for (const row of statusList) {
          map[row.rider_id] = { approval_status: row.approval_status, proposed_status: row.proposed_status }
        }
        setApprovalMap(map)
        setStatuses((prev) => {
          const next = { ...prev }
          for (const row of statusList) {
            if (!next[row.rider_id] && row.proposed_status === 'ABSENT') {
              next[row.rider_id] = {
                rider_id: row.rider_id,
                participation_status: 'ABSENT',
                registration_order: 0,
              }
            }
          }
          return next
        })
        const penaltiesRes = await apiFetch(`/api/jury/events/${eventId}/rider-penalties`)
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
      } finally {
        setLoading(false)
      }
    }
    loadMoto()
  }, [selectedMotoId, eventId])

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

  const filteredRiderList = useMemo(() => {
    if (!query.trim()) return riderList
    const q = query.toLowerCase()
    return riderList.filter((r) => {
      const gate = String(r.gate_position ?? r.registration_order ?? '')
      return (
        r.name.toLowerCase().includes(q) ||
        r.no_plate_display.toLowerCase().includes(q) ||
        gate.includes(q)
      )
    })
  }, [riderList, query])

  const statusSummary = useMemo(() => {
    const summary = { total: riderList.length, active: 0, dns: 0, absent: 0 }
    for (const r of riderList) {
      const status = statuses[r.id]?.participation_status ?? r.status ?? 'ACTIVE'
      if (status === 'DNS') summary.dns += 1
      else if (status === 'ABSENT') summary.absent += 1
      else summary.active += 1
    }
    return summary
  }, [riderList, statuses])

  const categoryLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) map.set(c.id, c.label)
    return map
  }, [categories])

  const selectedMoto = useMemo(() => motos.find((m) => m.id === selectedMotoId) ?? null, [motos, selectedMotoId])
  const selectedMotoLive = selectedMoto?.status === 'LIVE'
  const selectedCategoryLabel = selectedMoto
    ? categoryLabel.get(selectedMoto.category_id ?? '') ?? 'Unknown Category'
    : null

  const handleSaveStatus = async (riderId: string, status: StatusRow['participation_status'], order: number) => {
    if (role === 'RACE_DIRECTOR') {
      alert('RACE_DIRECTOR read-only.')
      return
    }
    if (!selectedMotoId) {
      alert('Pilih moto/batch terlebih dahulu.')
      return
    }
    if (!selectedMotoLive) {
      alert('Moto belum LIVE.')
      return
    }
    if (locked) {
      alert('Moto locked. Updates disabled.')
      return
    }
    setSaving(true)
    try {
      if (status === 'DNS') {
        await apiFetch(`/api/jury/motos/${selectedMotoId}/results`, {
          method: 'POST',
          body: JSON.stringify({
            results: [{ rider_id: riderId, result_status: 'DNS', finish_order: null }],
          }),
        })
      } else {
        if (!flags?.absent_enabled) {
          alert('Absent module belum diaktifkan untuk event ini.')
          return
        }
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
    } finally {
      setSaving(false)
    }
  }

  const handlePenalty = async (riderId: string, ruleCode: string) => {
    if (role === 'RACE_DIRECTOR') {
      alert('RACE_DIRECTOR read-only.')
      return
    }
    if (!selectedMotoId) {
      alert('Pilih moto/batch terlebih dahulu.')
      return
    }
    if (!selectedMotoLive) {
      alert('Moto belum LIVE.')
      return
    }
    if (locked) {
      alert('Moto locked. Updates disabled.')
      return
    }
    if (!flags?.penalty_enabled) {
      alert('Penalty module belum diaktifkan untuk event ini.')
      return
    }
    if (!ruleCode) return
    setSaving(true)
    try {
      await apiFetch(`/api/jury/riders/${riderId}/penalties`, {
        method: 'POST',
        body: JSON.stringify({ event_id: eventId, stage: 'MOTO', rule_code: ruleCode }),
      })
      const penaltiesRes = await apiFetch(`/api/jury/events/${eventId}/rider-penalties`)
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
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="jury-start">
      <div className="jury-container">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Jury Start</h1>
            <button
              type="button"
              onClick={handleLogout}
              style={{
                padding: '8px 12px',
                borderRadius: 12,
                border: '2px solid #b91c1c',
                background: '#fee2e2',
                color: '#7f1d1d',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Logout
            </button>
          </div>
          <div style={{ minWidth: 220 }}>
            <div style={{ fontSize: 12, color: '#444', fontWeight: 700, marginTop: 4 }}>
              {selectedCategoryLabel ?? 'Pilih moto'} - {selectedMoto?.moto_name ?? '-'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <select
              value={selectedMotoId}
              onChange={(e) => setSelectedMotoId(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '2px solid #111',
                background: '#fff',
                color: '#111',
                fontWeight: 800,
              }}
              disabled={!motos.length}
            >
              {motos.length === 0 && <option value="">Belum ada moto/batch</option>}
              {motos.map((m) => (
                <option key={m.id} value={m.id} disabled={m.status !== 'LIVE'}>
                  {m.moto_order}. {m.moto_name} - {categoryLabel.get(m.category_id ?? '') ?? 'Unknown'} - {m.status}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
          ABSENT + gate penalties sebelum race start.
        </div>

        {locked && (
          <div
            style={{
              marginTop: 16,
              borderRadius: 12,
              border: '2px solid #b91c1c',
              background: '#fee2e2',
              color: '#7f1d1d',
              padding: '10px 14px',
              fontWeight: 800,
            }}
          >
            MOTO LOCKED - input disabled.
          </div>
        )}

        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {selectedMoto && !selectedMotoLive && (
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
              Moto masih {selectedMoto.status}. Input hanya bisa saat LIVE.
            </div>
          )}
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: '2px solid #111',
              background: flags?.absent_enabled ? '#bfead2' : '#fee2e2',
              fontWeight: 900,
              fontSize: 12,
            }}
          >
            ABSENT: {flags?.absent_enabled ? 'ON' : 'OFF'}
          </div>
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: '2px solid #111',
              background: flags?.penalty_enabled ? '#bfead2' : '#fee2e2',
              fontWeight: 900,
              fontSize: 12,
            }}
          >
            PENALTY: {flags?.penalty_enabled ? 'ON' : 'OFF'}
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            display: 'grid',
            gap: 10,
            gridTemplateColumns: 'minmax(220px, 1fr) auto',
            alignItems: 'center',
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama / plate / gate..."
            style={{
              padding: '10px 12px',
              borderRadius: 12,
              border: '2px solid #111',
              background: '#fff',
              fontWeight: 800,
            }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                border: '2px solid #111',
                background: '#fff',
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              Total: {statusSummary.total}
            </div>
            <div
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                border: '2px solid #111',
                background: '#dcfce7',
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              ACTIVE: {statusSummary.active}
            </div>
            <div
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                border: '2px solid #111',
                background: '#ffe9a8',
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              DNS: {statusSummary.dns}
            </div>
            <div
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                border: '2px solid #111',
                background: '#fee2e2',
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              ABSENT: {statusSummary.absent}
            </div>
            <button
              type="button"
              disabled={saving || role === 'RACE_DIRECTOR' || locked || !selectedMotoLive}
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
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                border: '2px solid #111',
                background: '#bfead2',
                fontWeight: 900,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Set All ACTIVE
            </button>
          </div>
        </div>

        {loading && <div style={{ marginTop: 10, fontWeight: 900 }}>Loading...</div>}
        {!loading && !selectedMotoId && (
          <div style={{ marginTop: 10, fontWeight: 900 }}>Pilih moto/batch terlebih dahulu.</div>
        )}
        {!loading && selectedMotoId && filteredRiderList.length === 0 && (
          <div style={{ marginTop: 10, fontWeight: 900 }}>Belum ada rider untuk batch ini.</div>
        )}

        <div className="layout-grid">
          <section className="panel">
            <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 800, letterSpacing: '0.15em', color: '#444' }}>
              STARTER STATUS
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              {filteredRiderList.map((r) => {
                const noMoto = !selectedMotoId
                const statusDisabledBase =
                  saving || role === 'RACE_DIRECTOR' || locked || noMoto || !selectedMotoLive
                const penaltyDisabled =
                  saving || role === 'RACE_DIRECTOR' || locked || !flags?.penalty_enabled || noMoto || !selectedMotoLive
                const currentStatus = statuses[r.id]?.participation_status ?? r.status
                const canSaveStatus =
                  statusDisabledBase ||
                  ((currentStatus === 'ABSENT' || currentStatus === 'ACTIVE') && !flags?.absent_enabled)
                return (
                  <div
                    key={r.id}
                    className="rider-card"
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      border: '2px solid #111',
                      background: '#fff',
                      display: 'grid',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 950 }}>{r.no_plate_display}</div>
                        <div style={{ fontSize: 16, fontWeight: 800 }}>{r.name}</div>
                      </div>
                      <div style={{ display: 'grid', gap: 4, textAlign: 'right' }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: '#333' }}>
                          Gate #{r.gate_position ?? r.registration_order}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 900,
                            padding: '4px 8px',
                            borderRadius: 999,
                            border: '2px solid #111',
                            background:
                              approvalMap[r.id]?.approval_status === 'PENDING'
                                ? '#ffe9a8'
                                : approvalMap[r.id]?.approval_status === 'REJECTED'
                                  ? '#fee2e2'
                                  : '#bfead2',
                          }}
                        >
                          {approvalMap[r.id]?.approval_status ?? 'APPROVED'}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      {(['ACTIVE', 'DNS', 'ABSENT'] as const).map((s) => {
                        const isActive = currentStatus === s
                        const bg = s === 'ACTIVE' ? '#bfead2' : s === 'DNS' ? '#ffe9a8' : '#fee2e2'
                        const statusDisabled =
                          statusDisabledBase || ((s === 'ABSENT' || s === 'ACTIVE') && !flags?.absent_enabled)
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() =>
                              setStatuses((prev) => ({
                                ...prev,
                                [r.id]: {
                                  rider_id: r.id,
                                  participation_status: s,
                                  registration_order: r.registration_order,
                                },
                              }))
                            }
                            disabled={statusDisabled}
                            style={{
                              padding: '10px 8px',
                              borderRadius: 12,
                              border: '2px solid #111',
                              background: isActive ? bg : '#fff',
                              fontWeight: 900,
                              cursor: statusDisabled ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {s}
                          </button>
                        )
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSaveStatus(r.id, currentStatus, r.registration_order)}
                      disabled={canSaveStatus}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 12,
                        border: '2px solid #111',
                        background: '#2ecc71',
                        fontWeight: 900,
                        cursor: canSaveStatus ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Save Status
                    </button>

                    <div
                      style={{
                        borderRadius: 12,
                        border: '2px solid #111',
                        background: '#fff',
                        padding: 10,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 900, color: '#444' }}>Penalty</div>
                        <button
                          type="button"
                          onClick={() => setOpenPenalty((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}
                          style={{
                            padding: '4px 8px',
                            borderRadius: 999,
                            border: '2px solid #111',
                            background: openPenalty[r.id] ? '#ffe9a8' : '#fff',
                            fontWeight: 900,
                            fontSize: 11,
                            cursor: 'pointer',
                          }}
                        >
                          {openPenalty[r.id] ? 'Hide' : 'Add Penalty'}
                        </button>
                      </div>
                      {openPenalty[r.id] && (
                        <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                          {PENALTY_DEFINITIONS.map((p) => (
                            <label
                              key={p.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                fontSize: 12,
                                fontWeight: 700,
                              }}
                            >
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
                                {p.label} ({p.points} pts, {p.automatic_action})
                              </span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ marginTop: 16, borderTop: '2px dashed #111', paddingTop: 16 }}>
              <div
                style={{ marginBottom: 12, fontSize: 12, fontWeight: 800, letterSpacing: '0.15em', color: '#444' }}
              >
                LIST STATUS RIDER
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {riderList.map((r) => {
                  const status = statuses[r.id]?.participation_status ?? r.status ?? 'ACTIVE'
                  const penalties = penaltiesByRider[r.id] ?? []
                  const penaltyLabel =
                    penalties.length > 0
                      ? penalties
                          .map((p) => {
                            const statusLabel = p.approval_status ? ` ${p.approval_status}` : ''
                            return `${p.rule_code}(+${p.penalty_point})${statusLabel}`
                          })
                          .join(', ')
                      : '-'
                  const badgeStyle =
                    status === 'ACTIVE'
                      ? { borderColor: '#15803d', color: '#14532d', background: '#dcfce7' }
                      : status === 'ABSENT'
                      ? { borderColor: '#b91c1c', color: '#7f1d1d', background: '#fee2e2' }
                      : { borderColor: '#111', color: '#111', background: '#fff' }
                  return (
                    <div
                      key={r.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderRadius: 12,
                        border: '1px solid #111',
                        background: '#fff',
                        padding: '8px 10px',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>
                        {r.no_plate_display} - {r.name}
                      </div>
                      <div style={{ fontSize: 11, color: '#444', marginTop: 2 }}>Penalty: {penaltyLabel}</div>
                      <span
                        style={{
                          borderRadius: 999,
                          border: '1px solid',
                          padding: '2px 8px',
                          fontWeight: 800,
                          fontSize: 10,
                          ...badgeStyle,
                        }}
                      >
                        {status}
                      </span>
                    </div>
                  )
                })}
                {riderList.length === 0 && <div style={{ fontSize: 12, color: '#444' }}>Kosong.</div>}
              </div>
            </div>
          </section>
        </div>
      </div>
      <style jsx>{`
        .jury-start {
          min-height: 100vh;
          background: #fff7d6;
          color: #111;
        }
        .jury-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 24px;
        }
        .layout-grid {
          margin-top: 20px;
          display: grid;
          gap: 16px;
          grid-template-columns: 1fr;
        }
        .panel {
          border-radius: 16px;
          border: 2px solid #111;
          background: #fff;
          padding: 16px;
        }
        @media (min-width: 1024px) {
          .layout-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  )
}
