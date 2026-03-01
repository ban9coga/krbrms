'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { isMotoLive } from '../../../lib/motoStatus'
import CheckerTopbar from '../../../components/CheckerTopbar'

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
  const [events, setEvents] = useState<EventItem[]>([])
  const [eventId, setEventId] = useState('')
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [motos, setMotos] = useState<MotoItem[]>([])
  const [rules, setRules] = useState<PenaltyRule[]>([])
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
      const [motoRes, catRes, ruleRes] = await Promise.all([
        fetch(`/api/motos?event_id=${eventId}`),
        fetch(`/api/events/${eventId}/categories`),
        apiFetch(`/api/jury/events/${eventId}/penalties`),
      ])
      const motoJson = await motoRes.json()
      const catJson = await catRes.json()
      setRules((ruleRes.data ?? []) as PenaltyRule[])
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
        const liveMoto = sortedMotos.find((m) => isMotoLive(m.status))
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
    // Keep dependency size stable during Fast Refresh; selectedMotoId is the effective trigger here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMotoId])

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
        alert(`Submitted: ${catLabel} | ${selectedMoto.moto_name}`)
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
    <div className="public-page">
      <CheckerTopbar title="Jury Finish Panel" />
      <main className="public-main max-w-[1500px]">
        <section className="public-hero">
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-rose-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />
          <div className="relative z-10 grid gap-2">
            <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-rose-300">Jury Finish</p>
            <h1 className="text-3xl font-black tracking-tight text-white md:text-5xl">Live Finish Input</h1>
            <p className="max-w-2xl text-sm font-semibold text-slate-200 sm:text-base">
              Tap rider untuk finish. Tahan 800ms untuk DNF.
            </p>
            <p className="text-xs font-semibold text-slate-300">
              {selectedCategoryLabel ?? 'Pilih moto'} | {selectedMoto?.moto_name ?? '-'}
            </p>
          </div>
        </section>

        <section className="public-panel-light">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-2">
              <label className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">Event LIVE</label>
              <select value={eventId} onChange={(e) => setEventId(e.target.value)} className="public-filter">
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
              <select value={selectedMotoId} onChange={(e) => setSelectedMotoId(e.target.value)} className="public-filter">
                {motos.length === 0 && <option value="">Belum ada moto/batch</option>}
                {motos.map((m) => (
                  <option key={m.id} value={m.id} disabled={!isMotoLive(m.status)}>
                    {m.moto_order}. {m.moto_name} - {categoryLabel.get(m.category_id ?? '') ?? 'Unknown'} - {m.status}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {events.length === 0 && (
          <section className="rounded-xl border border-rose-300 bg-rose-100 px-4 py-3 text-sm font-bold text-rose-800">
            Tidak ada event LIVE untuk Jury Finish. Set event ke LIVE dulu.
          </section>
        )}
        {events.length === 0 && (
          <div className="text-xs font-semibold text-slate-500">Admin: ubah status event ke LIVE agar Jury Finish aktif.</div>
        )}
        {motoLocked && (
          <section className="rounded-xl border border-rose-300 bg-rose-100 px-4 py-3 text-sm font-bold text-rose-800">
            MOTO LOCKED - input disabled.
          </section>
        )}
        {selectedMoto && !selectedMotoLive && (
          <section className="rounded-xl border border-rose-300 bg-rose-100 px-4 py-3 text-sm font-bold text-rose-800">
            Moto masih {selectedMoto.status}. Input hanya bisa saat LIVE.
          </section>
        )}

        <div className="layout-grid">
          <section className="public-panel-light">
            <div className="mb-3 text-xs font-extrabold uppercase tracking-[0.15em] text-slate-500">Input Grid</div>
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
                    border: '2px solid #0f172a',
                    borderBottomWidth: 4,
                    background: '#ffffff',
                    color: '#0f172a',
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
                  <div style={{ marginTop: 6, fontSize: 12, fontWeight: 700, color: '#475569' }}>{r.name}</div>
                </button>
              ))}
              {availableRiders.length === 0 && (
                <div className="col-span-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-center text-sm font-semibold text-slate-500">
                  {selectedMotoLive ? 'Tidak ada rider yang tersisa di grid.' : 'Pilih moto LIVE terlebih dahulu.'}
                </div>
              )}
            </div>
            <div className="mt-2 text-xs font-semibold text-slate-500">Tap = Finish. Long press 800ms = DNF.</div>

            <div className="mt-4 border-t border-dashed border-slate-300 pt-4">
              <div className="mb-3 text-xs font-extrabold uppercase tracking-[0.15em] text-slate-500">Starter List</div>
              <div className="grid gap-2">
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
                      : 'border-rose-300 text-rose-800'
                  return (
                    <div key={r.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                      <div className="font-semibold text-slate-700">
                        {r.no_plate_display} - {r.name}
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold tracking-[0.08em] ${badgeClass}`}>
                        {status}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>

          <aside className="public-panel-light">
            <div className="mb-3 text-xs font-extrabold uppercase tracking-[0.15em] text-slate-500">Live Result</div>
            <div className="grid gap-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Finish Order</div>
                <div className="mt-2 grid gap-1.5">
                  {finishSequence.map((f) => {
                    const rider = riders.find((r) => r.id === f.id)
                    const penalty = penaltiesByRider[f.id] ?? 0
                    return (
                      <div key={f.id} className="text-sm font-semibold text-slate-700">
                        {f.position}. {rider?.no_plate_display} - {rider?.name}
                        {penalty ? ` (+${penalty})` : ''}
                      </div>
                    )
                  })}
                  {finishSequence.length === 0 && <div className="text-sm font-semibold text-slate-500">Belum ada hasil.</div>}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">DNF</div>
                <div className="mt-2 grid gap-1.5">
                  {dnfRiders.map((id) => {
                    const rider = riders.find((r) => r.id === id)
                    const penalty = penaltiesByRider[id] ?? 0
                    return (
                      <div key={id} className="text-sm font-semibold text-rose-700">
                        {rider?.no_plate_display} - {rider?.name}
                        {penalty ? ` (+${penalty})` : ''}
                      </div>
                    )
                  })}
                  {dnfRiders.length === 0 && <div className="text-sm font-semibold text-slate-500">Kosong.</div>}
                </div>
              </div>

              {false && (
                <div className="mt-2 border-t border-dashed border-slate-300 pt-3">
                  <div className="mb-2 text-xs font-extrabold uppercase tracking-[0.15em] text-slate-500">Penalty Checklist</div>
                  <div className="grid gap-2">
                    {rules.map((p) => (
                      <label key={p.code} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <input type="checkbox" disabled />
                        <span>
                          {p.description || p.code} ({p.penalty_point} pts, {p.applies_to_stage})
                        </span>
                      </label>
                    ))}
                    {rules.length === 0 && (
                      <div className="text-xs font-semibold text-slate-500">Penalty rules belum diatur.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>

        <div className="jf-footer mt-2 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleUndo}
            disabled={actions.length === 0 || hasSubmitted || motoLocked}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-extrabold uppercase tracking-[0.1em] text-slate-800 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={handleResetResults}
            disabled={!hasSubmitted || saving || role === 'RACE_DIRECTOR' || motoLocked}
            className="w-full rounded-xl border border-amber-300 bg-amber-100 px-4 py-3 text-sm font-extrabold uppercase tracking-[0.1em] text-amber-800 transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reset Result
          </button>
          <button
            type="button"
            onClick={handleSubmitHeat}
            disabled={hasSubmitted || saving || role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive}
            className="w-full rounded-xl border border-emerald-300 bg-emerald-500 px-4 py-3 text-sm font-extrabold uppercase tracking-[0.1em] text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Submitting...' : 'Submit Result'}
          </button>
        </div>
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
          gap: 12px;
        }
        @media (min-width: 1024px) {
          .layout-grid {
            grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
          }
          .input-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (max-width: 640px) {
          .jf-footer {
            position: sticky;
            bottom: 8px;
            background: rgba(241, 245, 249, 0.92);
            backdrop-filter: blur(6px);
            padding: 8px;
            border-radius: 14px;
            border: 1px solid rgba(148, 163, 184, 0.35);
            flex-direction: column;
          }
          .jf-footer > button {
            width: 100%;
          }
          .input-grid > button {
            height: 136px !important;
            font-size: 48px !important;
          }
        }
      `}</style>
    </div>
  )
}
