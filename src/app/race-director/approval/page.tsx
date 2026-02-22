'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
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
}

export default function RaceDirectorApprovalPage() {
  const router = useRouter()
  const [eventId, setEventId] = useState('')
  const [events, setEvents] = useState<EventItem[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [statusUpdates, setStatusUpdates] = useState<StatusUpdate[]>([])
  const [penalties, setPenalties] = useState<PenaltyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [approvalMode, setApprovalMode] = useState<'AUTO' | 'DIRECTOR'>('AUTO')
  const [motos, setMotos] = useState<MotoRow[]>([])
  const [lockedMap, setLockedMap] = useState<Record<string, boolean>>({})
  const [gateStatus, setGateStatus] = useState<
    Array<{
      moto_id: string
      moto_name: string
      status: string
      total: number
      ready: number
      absent: number
      warnings?: number
    }>
  >([])
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null)
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
    const load = async () => {
      if (!eventId) return
      setLoading(true)
      try {
        const [approvalRes, modeRes, motoRes, auditRes, lockRes, catRes, gateRes] = await Promise.all([
          apiFetch(`/api/race-director/approvals?event_id=${eventId}`),
          apiFetch(`/api/race-director/mode?event_id=${eventId}`),
          fetch(`/api/motos?event_id=${eventId}`),
          apiFetch(`/api/race-director/audit?event_id=${eventId}`),
          apiFetch(`/api/jury/events/${eventId}/locks`),
          fetch(`/api/events/${eventId}/categories`),
          apiFetch(`/api/race-director/events/${eventId}/gate-status`),
        ])
        setStatusUpdates(approvalRes.status_updates ?? [])
        setPenalties(approvalRes.penalties ?? [])
        setApprovalMode((modeRes.data?.approval_mode as 'AUTO' | 'DIRECTOR') ?? 'AUTO')
        const motoJson = await motoRes.json()
        setMotos(motoJson.data ?? [])
        setAuditLogs(auditRes.data ?? [])
        const lockList = (lockRes.data ?? []) as Array<{ moto_id: string }>
        const map: Record<string, boolean> = {}
        for (const row of lockList) map[row.moto_id] = true
        setLockedMap(map)
        const catJson = await catRes.json()
        setCategories((catJson.data ?? []) as CategoryItem[])
        setGateStatus(gateRes.data ?? [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [eventId])

  const categoryLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) map.set(c.id, c.label)
    return map
  }, [categories])

  const categoriesSorted = useMemo(() => {
    return [...categories].sort((a, b) => {
      const ay = typeof a.year === 'number' ? a.year : 0
      const by = typeof b.year === 'number' ? b.year : 0
      return by - ay
    })
  }, [categories])

  const motosByCategory = useMemo(() => {
    const grouped = new Map<string, MotoRow[]>()
    for (const m of motos) {
      const catId = m.category_id ?? 'unknown'
      const list = grouped.get(catId) ?? []
      list.push(m)
      grouped.set(catId, list)
    }
    for (const [key, list] of grouped.entries()) {
      list.sort((a, b) => a.moto_order - b.moto_order)
      grouped.set(key, list)
    }
    return grouped
  }, [motos])

  const handleDecision = async (type: 'status' | 'penalty', id: string, decision: 'APPROVE' | 'REJECT') => {
    const reason = prompt('Reason (optional):') ?? ''
    if (type === 'status') {
      await apiFetch('/api/race-director/approvals/status', {
        method: 'POST',
        body: JSON.stringify({ update_id: id, decision, reason }),
      })
    } else {
      await apiFetch('/api/race-director/approvals/penalty', {
        method: 'POST',
        body: JSON.stringify({ penalty_id: id, decision, reason }),
      })
    }
    const refreshed = await apiFetch(`/api/race-director/approvals?event_id=${eventId}`)
    setStatusUpdates(refreshed.status_updates ?? [])
    setPenalties(refreshed.penalties ?? [])
  }

  const handleSaveMode = async () => {
    await apiFetch('/api/race-director/mode', {
      method: 'PATCH',
      body: JSON.stringify({ event_id: eventId, approval_mode: approvalMode }),
    })
  }

  const handleLock = async (motoId: string, lock: boolean) => {
    const reason = prompt('Reason (required):') ?? ''
    if (!reason.trim()) return
    const url = lock
      ? `/api/race-director/motos/${motoId}/lock`
      : `/api/race-director/motos/${motoId}/unlock`
    await apiFetch(url, { method: 'POST', body: JSON.stringify({ reason }) })
    const lockRes = await apiFetch(`/api/jury/events/${eventId}/locks`)
    const lockList = (lockRes.data ?? []) as Array<{ moto_id: string }>
    const map: Record<string, boolean> = {}
    for (const row of lockList) map[row.moto_id] = true
    setLockedMap(map)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#eaf7ee', color: '#111', padding: 16 }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Race Director</h1>
            <div style={{ marginTop: 4, color: '#333', fontWeight: 700 }}>
              Approvals, locking, and audit.
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              padding: '8px 12px',
              borderRadius: 12,
              border: '2px solid #b40000',
              background: '#ffd7d7',
              color: '#b40000',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Logout
          </button>
        </div>

        <div
          style={{
            background: '#fff',
            border: '2px solid #111',
            borderRadius: 16,
            padding: 14,
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'grid', gap: 8 }}>
            <select
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 900 }}
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name} - {ev.status}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <select
                value={approvalMode}
                onChange={(e) => setApprovalMode(e.target.value as 'AUTO' | 'DIRECTOR')}
                style={{ padding: 10, borderRadius: 12, border: '2px solid #111', fontWeight: 900 }}
              >
                <option value="AUTO">AUTO</option>
                <option value="DIRECTOR">DIRECTOR</option>
              </select>
              <button
                type="button"
                onClick={handleSaveMode}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '2px solid #111',
                  background: '#2ecc71',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Save Mode
              </button>
              <div
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: '2px solid #111',
                  background: approvalMode === 'AUTO' ? '#bfead2' : '#ffe9a8',
                  fontWeight: 900,
                  fontSize: 12,
                }}
              >
                {approvalMode === 'AUTO' ? 'AUTO APPROVAL MODE' : 'DIRECTOR APPROVAL'}
              </div>
            </div>
          </div>
        </div>

        {loading && <div style={{ fontWeight: 900 }}>Loading...</div>}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <div style={{ border: '2px solid #111', borderRadius: 14, background: '#fff', padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#333' }}>Pending Status</div>
            <div style={{ fontSize: 22, fontWeight: 950 }}>{statusUpdates.length}</div>
          </div>
          <div style={{ border: '2px solid #111', borderRadius: 14, background: '#fff', padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#333' }}>Pending Penalties</div>
            <div style={{ fontSize: 22, fontWeight: 950 }}>{penalties.length}</div>
          </div>
          <div style={{ border: '2px solid #111', borderRadius: 14, background: '#fff', padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#333' }}>Locked Motos</div>
            <div style={{ fontSize: 22, fontWeight: 950 }}>
              {Object.values(lockedMap).filter(Boolean).length}
            </div>
          </div>
          <div style={{ border: '2px solid #111', borderRadius: 14, background: '#fff', padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#333' }}>Gate Status</div>
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              {gateStatus.length === 0 && <div style={{ fontSize: 12, color: '#333' }}>No data.</div>}
              {gateStatus.map((g) => (
                <div
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
                  <span>{g.moto_name}</span>
                  <span>
                    {g.status}
                    {g.warnings && g.warnings > 0 ? ` (WARN ${g.warnings})` : ''}
                    {' • '}
                    {g.ready}/{g.total}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <section
            style={{
              border: '2px solid #111',
              borderRadius: 16,
              background: '#fff',
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 18 }}>Status Updates</div>
            {statusUpdates.length === 0 && <div style={{ marginTop: 8 }}>No pending status updates.</div>}
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              {statusUpdates.map((u) => (
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
                  <div style={{ fontWeight: 900 }}>Rider: {u.rider_id}</div>
                  <div>Proposed: {u.proposed_status}</div>
                  <div style={{ fontSize: 12, color: '#333' }}>
                    {new Date(u.created_at).toLocaleString()}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button
                      disabled={approvalMode === 'AUTO'}
                      onClick={() => handleDecision('status', u.id, 'APPROVE')}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '2px solid #111',
                        background: '#bfead2',
                        fontWeight: 900,
                        cursor: approvalMode === 'AUTO' ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Approve
                    </button>
                    <button
                      disabled={approvalMode === 'AUTO'}
                      onClick={() => handleDecision('status', u.id, 'REJECT')}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '2px solid #111',
                        background: '#ffd7d7',
                        fontWeight: 900,
                        cursor: approvalMode === 'AUTO' ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section
            style={{
              border: '2px solid #111',
              borderRadius: 16,
              background: '#fff',
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 18 }}>Penalty Approvals</div>
            {penalties.length === 0 && <div style={{ marginTop: 8 }}>No pending penalties.</div>}
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              {penalties.map((p) => (
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
                  <div style={{ fontWeight: 900 }}>Rider: {p.rider_id}</div>
                  <div>Rule: {p.rule_code} (+{p.penalty_point})</div>
                  {p.note && <div style={{ fontSize: 12, color: '#333' }}>Note: {p.note}</div>}
                  <div style={{ fontSize: 12, color: '#333' }}>
                    {new Date(p.created_at).toLocaleString()}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <button
                      disabled={approvalMode === 'AUTO'}
                      onClick={() => handleDecision('penalty', p.id, 'APPROVE')}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '2px solid #111',
                        background: '#bfead2',
                        fontWeight: 900,
                        cursor: approvalMode === 'AUTO' ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Approve
                    </button>
                    <button
                      disabled={approvalMode === 'AUTO'}
                      onClick={() => handleDecision('penalty', p.id, 'REJECT')}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '2px solid #111',
                        background: '#ffd7d7',
                        fontWeight: 900,
                        cursor: approvalMode === 'AUTO' ? 'not-allowed' : 'pointer',
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section
            style={{
              border: '2px solid #111',
              borderRadius: 16,
              background: '#fff',
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 18 }}>Moto Locking</div>
            {motos.length === 0 && <div style={{ marginTop: 8 }}>No motos.</div>}
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
                      {cat.label} {isOpen ? '▼' : '▶'}
                    </button>
                    {isOpen && (
                      <div style={{ display: 'grid', gap: 8 }}>
                        {list.map((m) => {
                          const isLocked = !!lockedMap[m.id]
                          return (
                            <div
                              key={m.id}
                              style={{
                                border: '2px solid #111',
                                borderRadius: 12,
                                background: '#eaf7ee',
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
                                  background: isLocked ? '#ffd7d7' : '#bfead2',
                                  width: 'fit-content',
                                }}
                              >
                                {isLocked ? 'LOCKED' : 'UNLOCKED'}
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
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
                                  Lock
                                </button>
                                <button
                                  onClick={() => handleLock(m.id, false)}
                                  style={{
                                    padding: '8px 12px',
                                    borderRadius: 10,
                                    border: '2px solid #111',
                                    background: '#bfead2',
                                    fontWeight: 900,
                                    cursor: 'pointer',
                                  }}
                                >
                                  Unlock
                                </button>
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

          <section
            style={{
              border: '2px solid #111',
              borderRadius: 16,
              background: '#fff',
              padding: 14,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 18 }}>Audit Log (Last 100)</div>
            {auditLogs.length === 0 && <div style={{ marginTop: 8 }}>No audit entries.</div>}
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
                    By: {log.performed_by}
                    {log.rider_id ? ` - Rider: ${log.rider_id}` : ''}
                    {log.moto_id ? ` - Moto: ${log.moto_id}` : ''}
                  </div>
                  {log.reason && <div style={{ fontSize: 12, color: '#333' }}>Reason: {log.reason}</div>}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

