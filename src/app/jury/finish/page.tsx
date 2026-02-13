'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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

const VIBRATE_MS = 30
const LONG_PRESS_MS = 800

export default function JuryFinishPage() {
  const router = useRouter()
  const [events, setEvents] = useState<EventItem[]>([])
  const [eventId, setEventId] = useState('')
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [motos, setMotos] = useState<MotoItem[]>([])
  const [selectedMotoId, setSelectedMotoId] = useState('')
  const [riders, setRiders] = useState<RiderItem[]>([])
  const [role, setRole] = useState<string | null>(null)
  const [motoLocked, setMotoLocked] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [pressedId, setPressedId] = useState<string | null>(null)
  const [penaltiesByRider, setPenaltiesByRider] = useState<Record<string, number>>({})
  const [participationByRider, setParticipationByRider] = useState<Record<string, string>>({})

  const [finishOrder, setFinishOrder] = useState<string[]>([])
  const [dnfRiders, setDnfRiders] = useState<string[]>([])
  const [actions, setActions] = useState<Action[]>([])

  const pressTimers = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({})
  const longPressFired = useRef<Record<string, boolean>>({})

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
    router.push('/login')
  }

  useEffect(() => {
    const loadEvents = async () => {
      const res = await apiFetch('/api/jury/events?status=LIVE')
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
      const [motoRes, catRes] = await Promise.all([
        fetch(`/api/motos?event_id=${eventId}`),
        fetch(`/api/events/${eventId}/categories`),
      ])
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
    }
    loadAll()
  }, [eventId, selectedMotoId])

  useEffect(() => {
    const loadLock = async () => {
      if (!selectedMotoId) return
      const res = await apiFetch(`/api/jury/motos/${selectedMotoId}/lock-status`)
      setMotoLocked(!!res.data)
    }
    loadLock()
  }, [selectedMotoId])

  useEffect(() => {
    const loadRiders = async () => {
      if (!selectedMotoId) {
        setRiders([])
        setFinishOrder([])
        setDnfRiders([])
        setActions([])
        setPenaltiesByRider({})
        setParticipationByRider({})
        return
      }
      const [res, statusRes] = await Promise.all([
        apiFetch(`/api/jury/motos/${selectedMotoId}/riders`),
        apiFetch(`/api/jury/events/${eventId}/rider-status`),
      ])
      setRiders((res.data ?? []) as RiderItem[])
      setFinishOrder([])
      setDnfRiders([])
      setActions([])
      setHasSubmitted(false)
      const statusMap: Record<string, string> = {}
      for (const row of statusRes.data ?? []) {
        if (row?.rider_id && row?.participation_status) {
          statusMap[row.rider_id] = row.participation_status
        }
      }
      setParticipationByRider(statusMap)
      if (eventId) {
        const penaltiesRes = await apiFetch(`/api/jury/events/${eventId}/rider-penalties`)
        const map: Record<string, number> = {}
        for (const row of penaltiesRes.data ?? []) {
          const approval = Array.isArray(row.rider_penalty_approvals)
            ? row.rider_penalty_approvals[0]?.approval_status
            : row.rider_penalty_approvals?.approval_status
          if (approval !== 'APPROVED') continue
          map[row.rider_id] = (map[row.rider_id] ?? 0) + Number(row.penalty_point ?? 0)
        }
        setPenaltiesByRider(map)
      }
    }
    loadRiders()
  }, [selectedMotoId])

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

  const vibrate = () => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(VIBRATE_MS)
    }
  }

  const syncToSupabase = async (riderId: string, position: number | null, status: 'FINISH' | 'DNF') => {
    if (!selectedMoto) return
    await supabase.from('results').upsert(
      {
        event_id: eventId,
        moto_id: selectedMoto.id,
        rider_id: riderId,
        finish_order: position,
        result_status: status,
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
    const position = finishOrder.length + 1
    setFinishOrder((prev) => [...prev, riderId])
    setActions((prev) => [...prev, { type: 'finish', riderId, position }])
    vibrate()
    syncToSupabase(riderId, position, 'FINISH')
  }

  const handleDNF = (riderId: string) => {
    if (role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive) return
    if (finishOrder.includes(riderId) || dnfRiders.includes(riderId)) return
    setDnfRiders((prev) => [...prev, riderId])
    setActions((prev) => [...prev, { type: 'dnf', riderId }])
    vibrate()
    syncToSupabase(riderId, null, 'DNF')
  }

  const handleUndo = () => {
    if (actions.length === 0) return
    const last = actions[actions.length - 1]
    setActions((prev) => prev.slice(0, -1))
    if (last.type === 'finish') {
      setFinishOrder((prev) => prev.filter((id) => id !== last.riderId))
    } else {
      setDnfRiders((prev) => prev.filter((id) => id !== last.riderId))
    }
    vibrate()
    removeFromSupabase(last.riderId)
  }

  const handleSubmitHeat = async () => {
    if (role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive) return
    if (!selectedMoto) return
    setSaving(true)
    try {
      const payload = [
        ...finishSequence.map((f) => ({
          event_id: eventId,
          moto_id: selectedMoto.id,
          rider_id: f.id,
          finish_order: f.position,
          result_status: 'FINISH',
        })),
        ...dnfRiders.map((id) => ({
          event_id: eventId,
          moto_id: selectedMoto.id,
          rider_id: id,
          finish_order: null,
          result_status: 'DNF',
        })),
      ]
      if (payload.length) {
        await apiFetch(`/api/jury/motos/${selectedMoto.id}/results`, {
          method: 'POST',
          body: JSON.stringify({
            results: payload.map(({ rider_id, finish_order, result_status }) => ({
              rider_id,
              finish_order,
              result_status,
            })),
          }),
        })
      }
      await apiFetch(`/api/jury/motos/${selectedMoto.id}/advance-stages`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setHasSubmitted(true)
      if (selectedMoto) {
        const catLabel = categoryLabel.get(selectedMoto.category_id ?? '') ?? 'Unknown Category'
        alert(`Submitted: ${catLabel} • ${selectedMoto.moto_name}`)
      } else {
        alert('Submit completed.')
      }
    } finally {
      setSaving(false)
    }
  }


  const handleResetResults = async () => {
    if (role === 'RACE_DIRECTOR' || motoLocked) return
    if (!selectedMoto || !hasSubmitted) return
    const ok = confirm('Reset results untuk moto ini?')
    if (!ok) return
    setSaving(true)
    try {
      await apiFetch(`/api/jury/motos/${selectedMoto.id}/results`, { method: 'DELETE' })
      setFinishOrder([])
      setDnfRiders([])
      setActions([])
      setHasSubmitted(false)
    } finally {
      setSaving(false)
    }
  }

  const onCardPointerDown = (riderId: string) => {
    setPressedId(riderId)
    longPressFired.current[riderId] = false
    if (pressTimers.current[riderId]) clearTimeout(pressTimers.current[riderId] as ReturnType<typeof setTimeout>)
    pressTimers.current[riderId] = setTimeout(() => {
      longPressFired.current[riderId] = true
      handleDNF(riderId)
    }, LONG_PRESS_MS)
  }

  const onCardPointerUp = (riderId: string) => {
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
    <div className="jury-finish">
      <div className="jury-container">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Jury Finish</h1>
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

        {events.length === 0 && (
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
            Tidak ada event LIVE untuk Jury Finish.
          </div>
        )}
        {motoLocked && (
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
        {selectedMoto && !selectedMotoLive && (
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
            Moto masih {selectedMoto.status}. Input hanya bisa saat LIVE.
          </div>
        )}

        <div className="layout-grid">
          <section className="panel">
            <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 800, letterSpacing: '0.15em', color: '#444' }}>
              INPUT GRID
            </div>
            <div className="input-grid">
              {availableRiders.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onPointerDown={() => onCardPointerDown(r.id)}
                  onPointerUp={() => onCardPointerUp(r.id)}
                  onPointerLeave={() => onCardPointerLeave(r.id)}
                  disabled={role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive}
                  style={{
                    height: 120,
                    borderRadius: 16,
                    border: '2px solid #111',
                    borderBottomWidth: 4,
                    background: '#fff',
                    color: '#111',
                    fontWeight: 900,
                    fontSize: 44,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive ? 'not-allowed' : 'pointer',
                    transform: pressedId === r.id ? 'translateY(4px)' : 'translateY(0)',
                    transition: 'transform 0.08s ease',
                  }}
                >
                  <div style={{ lineHeight: 1 }}>{r.no_plate_display}</div>
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: '#444' }}>{r.name}</div>
                </button>
              ))}
              {availableRiders.length === 0 && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    borderRadius: 12,
                    border: '1px solid #111',
                    background: '#fff',
                    padding: 16,
                    textAlign: 'center',
                    fontSize: 12,
                    color: '#444',
                  }}
                >
                  Tidak ada rider yang tersisa di grid.
                </div>
              )}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: '#444' }}>
              Tap = Finish. Long press 800ms = DNF.
            </div>

            <div style={{ marginTop: 16, borderTop: '2px dashed #111', paddingTop: 16 }}>
              <div
                style={{ marginBottom: 12, fontSize: 12, fontWeight: 800, letterSpacing: '0.15em', color: '#444' }}
              >
                STARTER LIST
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
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
                  const badgeStyle =
                    status === 'READY'
                      ? { borderColor: '#111', color: '#111' }
                      : status === 'DNF'
                      ? { borderColor: '#b91c1c', color: '#7f1d1d' }
                      : status === 'DNS' || status === 'ABSENT'
                      ? { borderColor: '#b91c1c', color: '#7f1d1d' }
                      : { borderColor: '#15803d', color: '#14532d' }
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
              </div>
            </div>
          </section>

          <aside className="panel">
            <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 800, letterSpacing: '0.15em', color: '#444' }}>
              LIVE RESULT
            </div>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ borderRadius: 12, border: '1px solid #111', background: '#fff', padding: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#444' }}>
                  Finish Order
                </div>
                <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                  {finishSequence.map((f) => {
                    const rider = riders.find((r) => r.id === f.id)
                    const penalty = penaltiesByRider[f.id] ?? 0
                    return (
                      <div key={f.id} style={{ fontSize: 12, fontWeight: 700 }}>
                        {f.position}. {rider?.no_plate_display} - {rider?.name}
                        {penalty ? ` (+${penalty})` : ''}
                      </div>
                    )
                  })}
                  {finishSequence.length === 0 && <div style={{ fontSize: 12, color: '#444' }}>Belum ada hasil.</div>}
                </div>
              </div>

              <div style={{ borderRadius: 12, border: '1px solid #111', background: '#fff', padding: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#444' }}>
                  DNF
                </div>
                <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                  {dnfRiders.map((id) => {
                    const rider = riders.find((r) => r.id === id)
                    const penalty = penaltiesByRider[id] ?? 0
                    return (
                      <div key={id} style={{ fontSize: 12, fontWeight: 700, color: '#b91c1c' }}>
                        {rider?.no_plate_display} - {rider?.name}
                        {penalty ? ` (+${penalty})` : ''}
                      </div>
                    )
                  })}
                  {dnfRiders.length === 0 && <div style={{ fontSize: 12, color: '#444' }}>Kosong.</div>}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, borderTop: '2px dashed #111', paddingTop: 16 }}>
              <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 800, letterSpacing: '0.15em', color: '#444' }}>
                PENALTY CHECKLIST
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
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
                    <input type="checkbox" disabled />
                    <span>
                      {p.label} ({p.points} pts, {p.automatic_action})
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </aside>
        </div>

        <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <button
            type="button"
            onClick={handleUndo}
            disabled={actions.length === 0 || hasSubmitted || motoLocked}
            style={{
              width: '100%',
              borderRadius: 16,
              border: '2px solid #111',
              background: '#fff',
              padding: '14px 18px',
              fontSize: 18,
              fontWeight: 900,
              color: '#111',
              cursor: actions.length === 0 || hasSubmitted || motoLocked ? 'not-allowed' : 'pointer',
            }}
          >
            UNDO
          </button>
          <button
            type="button"
            onClick={handleResetResults}
            disabled={!hasSubmitted || saving || role === 'RACE_DIRECTOR' || motoLocked}
            style={{
              width: '100%',
              borderRadius: 16,
              border: '2px solid #111',
              background: '#fff7d6',
              padding: '14px 18px',
              fontSize: 18,
              fontWeight: 900,
              color: '#111',
              cursor: !hasSubmitted || saving || role === 'RACE_DIRECTOR' || motoLocked ? 'not-allowed' : 'pointer',
            }}
          >
            RESET RESULT
          </button>
          <button
            type="button"
            onClick={handleSubmitHeat}
            disabled={hasSubmitted || saving || role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive}
            style={{
              width: '100%',
              borderRadius: 16,
              border: '2px solid #15803d',
              background: '#22c55e',
              padding: '14px 18px',
              fontSize: 18,
              fontWeight: 900,
              color: '#111',
              cursor: hasSubmitted || saving || role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'SUBMITTING...' : 'SUBMIT RESULT'}
          </button>
        </div>
      </div>
      <style jsx>{`
        .jury-finish {
          min-height: 100vh;
          background: #fff7d6;
          color: #111;
        }
        .jury-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 24px;
        }
        .layout-grid {
          margin-top: 24px;
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
        .input-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        @media (min-width: 1024px) {
          .layout-grid {
            grid-template-columns: 20% 55% 25%;
          }
          .input-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  )
}
