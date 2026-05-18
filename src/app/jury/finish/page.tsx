'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'
import { useHighVisibility } from '../../../hooks/useHighVisibility'
import { compareMotoSequence } from '../../../lib/motoSequence'
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
}

const VIBRATE_MS = 30
const LONG_PRESS_MS = 800

export default function JuryFinishPage() {
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
  const [flags, setFlags] = useState<EventFlags>({
    penalty_enabled: true,
    absent_enabled: true,
    dns_enabled: true,
    dnf_enabled: true,
  })

  const [finishOrder, setFinishOrder] = useState<string[]>([])
  const [dnfRiders, setDnfRiders] = useState<string[]>([])
  const [actions, setActions] = useState<Action[]>([])
  const [submitNotice, setSubmitNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const { highVisibility, toggleHighVisibility } = useHighVisibility('jury-finish-high-visibility')

  const pressTimers = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({})
  const longPressFired = useRef<Record<string, boolean>>({})
  const pressedIdRef = useRef<string | null>(null)
  const savingRef = useRef(false)
  const actionsCountRef = useRef(0)
  const localEditingRef = useRef(false)

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
    localEditingRef.current = Boolean(pressedId || saving || actions.length > 0)
  }, [actions.length, pressedId, saving])

  const pickNextSelectableMotoId = useCallback((list: MotoItem[], currentMotoId: string) => {
    const selectableRows = list.filter((m) => !['LOCKED', 'FINISHED'].includes((m.status ?? '').toUpperCase()))
    if (!selectableRows.length) return ''
    if (currentMotoId && selectableRows.some((m) => m.id === currentMotoId && isMotoLive(m.status))) {
      return currentMotoId
    }
    const liveMoto = selectableRows.find((m) => isMotoLive(m.status))
    if (liveMoto) return liveMoto.id
    if (currentMotoId && selectableRows.some((m) => m.id === currentMotoId)) {
      return currentMotoId
    }
    return selectableRows[0].id
  }, [])

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
      fetch(`/api/motos?event_id=${eventId}`),
      fetch(`/api/events/${eventId}/categories`),
      apiFetch(`/api/jury/events/${eventId}/modules`),
    ])
    const motoJson = await motoRes.json()
    const catJson = await catRes.json()
    setFlags(
      (flagRes.data as EventFlags | null) ?? {
        penalty_enabled: true,
        absent_enabled: true,
        dns_enabled: true,
        dnf_enabled: true,
      }
    )
    const catRows = (catJson.data ?? []) as CategoryItem[]
    setCategories(catRows)
    const sortedMotos = [...(motoJson.data ?? [])].sort(compareMotoSequence)
    setMotos(sortedMotos)
    setSelectedMotoId((prev) => pickNextSelectableMotoId(sortedMotos, prev))
    return sortedMotos
  }, [apiFetch, eventId, pickNextSelectableMotoId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  useEffect(() => {
    if (!eventId) return
    const interval = window.setInterval(() => {
      const currentSelectedMoto = motos.find((m) => m.id === selectedMotoId) ?? null
      if (isMotoLive(currentSelectedMoto?.status) && !hasSubmitted) return
      void loadAll()
    }, 5000)
    return () => window.clearInterval(interval)
  }, [eventId, hasSubmitted, loadAll, motos, selectedMotoId])

  useEffect(() => {
    const loadLock = async () => {
      if (!selectedMotoId) return
      const res = await apiFetch(`/api/jury/motos/${selectedMotoId}/lock-status`)
      setMotoLocked(!!res.data)
    }
    void loadLock()
  }, [apiFetch, selectedMotoId])

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

  const loadRiders = useCallback(async (motoIdOverride?: string, force = false) => {
    if (!force && localEditingRef.current) return
    const targetMotoId = motoIdOverride ?? selectedMotoId
    if (!eventId || !targetMotoId) {
      setRiders([])
      setFinishOrder([])
      setDnfRiders([])
      setActions([])
      setPenaltiesByRider({})
      setParticipationByRider({})
      return
    }
    const targetMoto = motos.find((m) => m.id === targetMotoId) ?? selectedMoto ?? null
    const [res, statusRes, resultRes] = await Promise.all([
      apiFetch(`/api/jury/motos/${targetMotoId}/riders`),
      apiFetch(`/api/jury/events/${eventId}/rider-status?moto_id=${targetMotoId}`),
      apiFetch(`/api/jury/motos/${targetMotoId}/results`),
    ])
    if (!force && localEditingRef.current) return
    setRiders((res.data ?? []) as RiderItem[])
    const existingResults = (resultRes.data ?? []) as Array<{
      rider_id: string
      finish_order?: number | null
      result_status?: string | null
    }>
    const finishFromServer = [...existingResults]
      .filter((r) => r.result_status === 'FINISH' && r.finish_order != null)
      .sort((a, b) => Number(a.finish_order ?? 9999) - Number(b.finish_order ?? 9999))
      .map((r) => r.rider_id)
    const dnfFromServer = existingResults
      .filter((r) => r.result_status === 'DNF')
      .map((r) => r.rider_id)
    const dnsFromServer = existingResults
      .filter((r) => r.result_status === 'DNS')
      .map((r) => r.rider_id)
    setFinishOrder(finishFromServer)
    setDnfRiders(dnfFromServer)
    setActions([])
    setHasSubmitted(!isMotoLive(targetMoto?.status) && existingResults.length > 0)
    const statusMap: Record<string, string> = {}
    for (const row of statusRes.data ?? []) {
      if (row?.rider_id && row?.participation_status) {
        statusMap[row.rider_id] = row.participation_status
      }
    }
    for (const riderId of dnsFromServer) {
      statusMap[riderId] = 'DNS'
    }
    setParticipationByRider(statusMap)
    if (eventId) {
      const penaltiesRes = await apiFetch(`/api/jury/events/${eventId}/rider-penalties?moto_id=${targetMotoId}`)
      if (!force && localEditingRef.current) return
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
  }, [apiFetch, eventId, motos, selectedMoto, selectedMotoId])

  useEffect(() => {
    void loadRiders()
  }, [loadRiders])

  useEffect(() => {
    if (!eventId || !selectedMotoId) return
    if (pressedId || actions.length > 0 || saving) return
    const interval = window.setInterval(() => {
      void loadRiders()
    }, 2500)
    return () => window.clearInterval(interval)
  }, [actions.length, eventId, loadRiders, pressedId, saving, selectedMotoId])

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
      .filter((r) => participationByRider[r.id] === 'DNS')
      .map((r) => r.id)
  }, [participationByRider, riders])

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
    localEditingRef.current = true
    const position = finishOrder.length + 1
    setFinishOrder((prev) => [...prev, riderId])
    setActions((prev) => [...prev, { type: 'finish', riderId, position }])
    vibrate()
    syncToSupabase(riderId, position, 'FINISH')
  }

  const handleDNF = (riderId: string) => {
    if (role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive || !flags.dnf_enabled) return
    if (finishOrder.includes(riderId) || dnfRiders.includes(riderId)) return
    localEditingRef.current = true
    setDnfRiders((prev) => [...prev, riderId])
    setActions((prev) => [...prev, { type: 'dnf', riderId }])
    vibrate()
    syncToSupabase(riderId, null, 'DNF')
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
    }
    vibrate()
    removeFromSupabase(last.riderId)
  }

  const handleSubmitHeat = async () => {
    if (role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive) return
    if (!selectedMoto) return
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
      setMotos((prev) =>
        prev.map((m) => (m.id === selectedMoto.id ? { ...m, status: 'PROVISIONAL' } : m))
      )
      if (selectedMoto) {
        const catLabel = categoryLabel.get(selectedMoto.category_id ?? '') ?? 'Unknown Category'
        setSubmitNotice({
          type: 'success',
          message: `Submitted: ${catLabel} | ${selectedMoto.moto_name}`,
        })
      } else {
        setSubmitNotice({ type: 'success', message: 'Submit completed.' })
      }
      await loadAll()
      await loadRiders(undefined, true)
    } catch (error: unknown) {
      setSubmitNotice({
        type: 'error',
        message: error instanceof Error ? error.message : 'Submit result gagal.',
      })
    } finally {
      setSaving(false)
    }
  }


  const handleRefreshMotoSelector = async () => {
    const refreshedMotos = (await loadAll()) ?? []
    const liveMoto = refreshedMotos.find((m) => isMotoLive(m.status))
    if (liveMoto) {
      setSelectedMotoId(liveMoto.id)
      await loadRiders(liveMoto.id, true)
      return
    }
    const nextMotoId = pickNextSelectableMotoId(refreshedMotos, selectedMotoId)
    setSelectedMotoId(nextMotoId)
    if (nextMotoId) {
      await loadRiders(nextMotoId, true)
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
                  onClick={handleRefreshMotoSelector}
                  disabled={saving}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-extrabold uppercase tracking-[0.08em] text-slate-800 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={toggleHighVisibility}
              className={`rounded-xl border px-4 py-2.5 text-sm font-extrabold uppercase tracking-[0.08em] transition-colors ${
                highVisibility
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
            className={`rounded-xl px-4 py-3 text-sm font-bold ${
              submitNotice.type === 'success'
                ? 'border border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border border-rose-300 bg-rose-50 text-rose-800'
            }`}
          >
            {submitNotice.message}
          </section>
        )}
        <section className="flex flex-wrap gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-extrabold tracking-[0.12em] ${
              flags.dns_enabled
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-rose-300 bg-rose-50 text-rose-800'
            }`}
          >
            DNS {flags.dns_enabled ? 'ON' : 'OFF'}
          </span>
          <span
            className={`rounded-full border px-3 py-1 text-xs font-extrabold tracking-[0.12em] ${
              flags.dnf_enabled
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
                const startStatus = participationByRider[r.id]
                const isReady = startStatus !== 'DNS' && startStatus !== 'ABSENT'
                return (
                  <button
                    key={r.id}
                    type="button"
                    onPointerDown={(event) => onCardPointerDown(event, r.id)}
                    onPointerUp={(event) => onCardPointerUp(event, r.id)}
                    onPointerLeave={() => onCardPointerLeave(r.id)}
                    onPointerCancel={() => onCardPointerLeave(r.id)}
                    disabled={role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive}
                    style={{
                      height: highVisibility ? 144 : 120,
                      borderRadius: 16,
                      border: isReady ? '2px solid #15803d' : '2px solid #0f172a',
                      borderBottomWidth: 4,
                      background: isReady ? 'linear-gradient(180deg, #dcfce7 0%, #bbf7d0 100%)' : '#ffffff',
                      color: '#0f172a',
                      fontWeight: 900,
                      fontSize: highVisibility ? 56 : 44,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive ? 'not-allowed' : 'pointer',
                      transform: pressedId === r.id ? 'translateY(4px)' : 'translateY(0)',
                      transition: 'transform 0.08s ease',
                      userSelect: 'none',
                      WebkitUserSelect: 'none',
                      WebkitTouchCallout: 'none',
                      touchAction: 'manipulation',
                      boxShadow: isReady ? '0 10px 24px rgba(22, 163, 74, 0.18)' : 'none',
                    }}
                  >
                    <div style={{ lineHeight: 1 }}>{r.no_plate_display}</div>
                    <div style={{ marginTop: 6, fontSize: highVisibility ? 14 : 12, fontWeight: 700, color: isReady ? '#166534' : '#475569' }}>{r.name}</div>
                  </button>
                )
              })}
              {availableRiders.length === 0 && (
                <div className="col-span-full rounded-xl border border-slate-300 bg-white px-4 py-4 text-center text-sm font-semibold text-slate-500">
                  {selectedMotoLive ? 'Tidak ada rider yang tersisa di grid.' : 'Pilih moto LIVE terlebih dahulu.'}
                </div>
              )}
            </div>
            <div className="mt-2 text-xs font-semibold text-slate-500">
              {flags.dnf_enabled
                ? 'Tap = Finish. Long press 800ms = DNF.'
                : 'Tap = Finish. DNF dimatikan dari menu Penalties.'}
            </div>

            <div className="jf-actions mt-4 flex items-center justify-between gap-3">
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
                onClick={handleSubmitHeat}
                disabled={hasSubmitted || saving || role === 'RACE_DIRECTOR' || motoLocked || !selectedMotoLive}
                className="w-full rounded-xl border border-emerald-300 bg-emerald-500 px-4 py-3 text-sm font-extrabold uppercase tracking-[0.1em] text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Submitting...' : 'Submit Result'}
              </button>
            </div>

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
            </div>
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
                    return (
                      <div key={f.id} className={`${highVisibility ? 'text-base' : 'text-sm'} font-semibold text-slate-700`}>
                        {f.position}. {rider?.no_plate_display} - {rider?.name}
                        {penalty ? ` (+${penalty})` : ''}
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
                    return (
                      <div key={id} className={`${highVisibility ? 'text-base' : 'text-sm'} font-semibold text-amber-700`}>
                        {rider?.no_plate_display} - {rider?.name}
                        {penalty ? ` (+${penalty})` : ''}
                      </div>
                    )
                  })}
                  {dnfRiders.length === 0 && <div className="text-sm font-semibold text-slate-500">Kosong.</div>}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className={`${highVisibility ? 'text-xs' : 'text-[10px]'} font-extrabold uppercase tracking-[0.12em] text-slate-500`}>DNS</div>
                <div className="mt-2 grid gap-1.5">
                  {dnsRiders.map((id) => {
                    const rider = riders.find((r) => r.id === id)
                    const penalty = penaltiesByRider[id] ?? 0
                    return (
                      <div key={id} className={`${highVisibility ? 'text-base' : 'text-sm'} font-semibold text-rose-700`}>
                        {rider?.no_plate_display} - {rider?.name}
                        {penalty ? ` (+${penalty})` : ''}
                      </div>
                    )
                  })}
                  {dnsRiders.length === 0 && <div className="text-sm font-semibold text-slate-500">Kosong.</div>}
                </div>
              </div>

            </div>
          </aside>
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
        .jf-actions {
          background: rgba(241, 245, 249, 0.94);
          padding: 10px;
          border-radius: 16px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
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
          .input-grid > button {
            height: 136px !important;
            font-size: 48px !important;
          }
        }
      `}</style>
    </div>
  )
}
