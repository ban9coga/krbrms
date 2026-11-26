'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import CheckerTopbar from '../../../components/CheckerTopbar'
import { useApiFetch } from '@/src/hooks/useApiFetch'
import { useEventRaceRealtime } from '@/src/hooks/useEventRaceRealtime'

type Event = { id: string; name: string; status: string }
type Category = { id: string; label: string; scoring_format: 'DRAG_MANUAL' | 'DRAG_TIMING' }
type Rider = { id: string; name: string; no_plate_display: string }
type Heat = { id: string; round_number: number; round_label: string; heat_number: number; run_number: number | null; lane_a_rider_id: string | null; lane_b_rider_id: string | null; winner_rider_id: string | null; outcome: string; status: string }
type Run = { heat_id: string; rider_id: string; run_number: number; lane: string; reaction_time_seconds: number | null; elapsed_time_seconds: number | null; total_seconds: number | null; jump_start: boolean; dns_called_twice: boolean; result_status: string }
type DragData = { category: { id: string; label: string }; scoring_format: Category['scoring_format']; bracket_mode: boolean; heats: Heat[]; runs: Run[]; riders: Rider[] }
type RunForm = { result_status: string; reaction_time_seconds: string; elapsed_time_seconds: string; jump_start: boolean; dns_called_twice: boolean; note: string }
const emptyForm: RunForm = { result_status: 'FINISH', reaction_time_seconds: '', elapsed_time_seconds: '', jump_start: false, dns_called_twice: false, note: '' }

export default function JuryDragRacePage() {
  const apiFetch = useApiFetch()
  const [events, setEvents] = useState<Event[]>([])
  const [eventId, setEventId] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [data, setData] = useState<DragData | null>(null)
  const [forms, setForms] = useState<Record<string, RunForm>>({})
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    apiFetch('/api/jury/events?status=LIVE').then((json) => {
      if (!active) return
      const rows = (json.data ?? []) as Event[]
      setEvents(rows)
      if (rows[0]) setEventId(rows[0].id)
      else setLoading(false)
    }).catch((reason) => { if (active) { setError(reason instanceof Error ? reason.message : 'Gagal memuat event.'); setLoading(false) } })
    return () => { active = false }
  }, [apiFetch])

  const load = useCallback(async (event: string, category = '') => {
    if (!event) return
    setLoading(true); setError('')
    try {
      if (!category) {
        const json = await apiFetch(`/api/jury/events/${event}/drag-race`)
        const rows = (json.data?.categories ?? []) as Category[]
        setCategories(rows)
        const firstId = rows[0]?.id ?? ''
        setCategoryId(firstId)
        if (!firstId) setData(null)
        return
      } else {
        const detail = await apiFetch(`/api/jury/events/${event}/drag-race?category_id=${encodeURIComponent(category)}`)
        setData(detail.data as DragData)
      }
      setMessage('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Gagal memuat race.') }
    finally { setLoading(false) }
  }, [apiFetch])

  useEffect(() => { if (eventId) void load(eventId) }, [eventId, load])
  useEffect(() => { if (eventId && categoryId) void load(eventId, categoryId) }, [categoryId, eventId, load])
  const refreshRealtime = useCallback((signal: { event_id?: string; table?: string }) => {
    if (signal.event_id === eventId && (signal.table === 'drag_heats' || signal.table === 'drag_run_results') && categoryId) void load(eventId, categoryId)
  }, [categoryId, eventId, load])
  useEventRaceRealtime({ eventId, enabled: Boolean(eventId && categoryId), onRaceStateChanged: refreshRealtime })
  const riderMap = useMemo(() => new Map((data?.riders ?? []).map((rider) => [rider.id, rider])), [data?.riders])
  const resultMap = useMemo(() => new Map((data?.runs ?? []).map((run) => [`${run.heat_id}:${run.rider_id}:${run.run_number}`, run])), [data?.runs])
  const grouped = useMemo(() => {
    const map = new Map<string, Heat[]>()
    for (const heat of data?.heats ?? []) {
      const label = data?.scoring_format === 'DRAG_TIMING' && !data.bracket_mode ? `Run ${heat.run_number}` : heat.round_label
      map.set(label, [...(map.get(label) ?? []), heat])
    }
    return [...map.entries()]
  }, [data?.heats, data?.scoring_format, data?.bracket_mode])

  const formFor = (heat: Heat, riderId: string, runNumber = data?.bracket_mode ? 1 : heat.run_number ?? 1) => {
    const key = `${heat.id}:${riderId}:${runNumber}`
    const old = resultMap.get(key)
    return forms[key] ?? (old ? {
      result_status: old.result_status,
      reaction_time_seconds: old.reaction_time_seconds == null ? '' : String(old.reaction_time_seconds),
      elapsed_time_seconds: old.elapsed_time_seconds == null ? '' : String(old.elapsed_time_seconds),
      jump_start: old.jump_start,
      dns_called_twice: old.dns_called_twice,
      note: '',
    } : emptyForm)
  }
  const setForm = (heat: Heat, riderId: string, patch: Partial<RunForm>, runNumber = data?.bracket_mode ? 1 : heat.run_number ?? 1) => {
    const key = `${heat.id}:${riderId}:${runNumber}`
    setForms((current) => ({ ...current, [key]: { ...formFor(heat, riderId, runNumber), ...patch } }))
  }
  const submitWinner = async (heat: Heat, riderId: string) => {
    setBusyId(heat.id); setMessage(''); setError('')
    try {
      await apiFetch(`/api/jury/drag-heats/${heat.id}/result`, { method: 'POST', body: JSON.stringify({ winner_rider_id: riderId }) })
      setMessage(`Pemenang Heat ${heat.heat_number} tersimpan.`)
      await load(eventId, categoryId)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Hasil gagal disimpan.') }
    finally { setBusyId('') }
  }
  const submitRun = async (heat: Heat, riderId: string, runNumber = data?.bracket_mode ? 1 : heat.run_number ?? 1) => {
    const form = formFor(heat, riderId, runNumber)
    const busyKey = `${heat.id}:${riderId}:${runNumber}`
    setBusyId(busyKey); setMessage(''); setError('')
    try {
      await apiFetch(`/api/jury/drag-heats/${heat.id}/result`, { method: 'POST', body: JSON.stringify({
        rider_id: riderId, result_status: form.result_status, reaction_time_seconds: form.reaction_time_seconds,
        elapsed_time_seconds: form.elapsed_time_seconds, jump_start: form.jump_start,
        dns_called_twice: form.dns_called_twice, note: form.note, ...(data?.bracket_mode ? { run_number: runNumber } : {}),
      }) })
      setMessage(`Hasil Run ${runNumber} untuk ${riderMap.get(riderId)?.name ?? 'rider'} tersimpan.`)
      await load(eventId, categoryId)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Hasil gagal disimpan.') }
    finally { setBusyId('') }
  }

  const renderRunForm = (heat: Heat, riderId: string, runNumber: number) => {
    const current = formFor(heat, riderId, runNumber)
    const old = resultMap.get(`${heat.id}:${riderId}:${runNumber}`)
    const busyKey = `${heat.id}:${riderId}:${runNumber}`
    return <div key={busyKey} style={{ display: 'grid', gap: 7, borderTop: '1px solid #eee1c9', paddingTop: 8 }}>
      <strong>Run {runNumber}{old ? ` · ${old.result_status}${old.total_seconds == null ? '' : ` · ${Number(old.total_seconds).toFixed(3)}s`}` : ' · Belum dicatat'}</strong>
      <select value={current.result_status} onChange={(e) => setForm(heat, riderId, { result_status: e.target.value }, runNumber)} style={field} aria-label={`Status hasil run ${runNumber}`}>
        <option value="FINISH">Finish</option><option value="DNS">DNS (sudah dipanggil 2 kali)</option><option value="DNF">DNF</option><option value="DSQ">Diskualifikasi</option><option value="RERUN">Percobaan tidak sah</option>
      </select>
      {current.result_status === 'FINISH' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
        <label style={{ fontSize: 12 }}>RT (detik)<input type="number" step="0.001" value={current.reaction_time_seconds} onChange={(e) => setForm(heat, riderId, { reaction_time_seconds: e.target.value }, runNumber)} style={field} /></label>
        <label style={{ fontSize: 12 }}>ET (detik)<input type="number" min="0" step="0.001" value={current.elapsed_time_seconds} onChange={(e) => setForm(heat, riderId, { elapsed_time_seconds: e.target.value }, runNumber)} style={field} /></label>
      </div>}
      {current.result_status === 'FINISH' && <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><input type="checkbox" checked={current.jump_start} onChange={(e) => setForm(heat, riderId, { jump_start: e.target.checked }, runNumber)} /> False start (+3 detik)</label>}
      {current.result_status === 'DNS' && <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><input type="checkbox" checked={current.dns_called_twice} onChange={(e) => setForm(heat, riderId, { dns_called_twice: e.target.checked }, runNumber)} /> Sudah dipanggil dua kali</label>}
      {current.result_status === 'DSQ' && <input value={current.note} onChange={(e) => setForm(heat, riderId, { note: e.target.value }, runNumber)} placeholder="Alasan diskualifikasi" style={field} />}
      <button disabled={heat.status === 'COMPLETE' || busyId === busyKey} onClick={() => void submitRun(heat, riderId, runNumber)} style={{ minHeight: 44, border: 0, borderRadius: 9, background: '#24140d', color: '#fff4df', fontWeight: 900 }}>{busyId === busyKey ? 'Menyimpan…' : `Simpan Run ${runNumber}`}</button>
    </div>
  }

  const panel: React.CSSProperties = { border: '1px solid #e4d1ad', borderRadius: 14, background: '#fff9ed', padding: 12 }
  const field: React.CSSProperties = { minHeight: 42, width: '100%', borderRadius: 9, border: '1px solid #c9b58f', padding: '8px 10px', background: '#fff' }
  return <div style={{ minHeight: '100vh', background: '#f5eddc', color: '#24140d', paddingBottom: 32 }}>
    <CheckerTopbar title="Drag Race · Juri" />
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: '14px 12px', display: 'grid', gap: 12 }}>
      <section style={{ ...panel, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 10 }}>
        <label style={{ display: 'grid', gap: 5, fontWeight: 800 }}>Event LIVE
          <select value={eventId} onChange={(e) => { setEventId(e.target.value); setCategoryId(''); setData(null) }} style={field}>
            {events.length === 0 && <option value="">Belum ada event LIVE</option>}{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
          </select>
        </label>
        <label style={{ display: 'grid', gap: 5, fontWeight: 800 }}>Kategori Drag Race
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} style={field}>
            {categories.length === 0 && <option value="">Belum ada kategori Drag Race</option>}{categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
          </select>
        </label>
      </section>
      {error && <div role="alert" style={{ ...panel, color: '#991b1b', background: '#fff1f2', fontWeight: 800 }}>{error}</div>}
      {message && <div role="status" style={{ ...panel, color: '#166534', fontWeight: 800 }}>{message}</div>}
      {loading && <div style={panel}>Memuat heat…</div>}
      {!loading && data && data.heats.length === 0 && <div style={panel}>Drawing belum dibuat oleh panitia.</div>}
      {!loading && data?.heats.length ? grouped.map(([round, heats]) => <section key={round} style={{ ...panel, display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 950 }}>{round}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 10 }}>
          {heats.map((heat) => <article key={heat.id} style={{ border: '1px solid #ddcbaa', background: '#fffdf8', borderRadius: 12, padding: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 900, marginBottom: 8 }}><span>Heat {heat.heat_number}</span><span style={{ fontSize: 12 }}>{heat.outcome === 'RERUN' ? 'Seri · race ulang' : heat.status === 'COMPLETE' ? 'Selesai' : heat.status === 'LIVE' ? 'Sedang berjalan' : heat.outcome === 'BYE' ? 'Bye' : 'Siap'}</span></div>
            {data.scoring_format === 'DRAG_MANUAL' ? <div style={{ display: 'grid', gap: 8 }}>
              {[heat.lane_a_rider_id, heat.lane_b_rider_id].filter((id): id is string => Boolean(id)).map((riderId) => <button key={riderId} disabled={heat.status === 'COMPLETE' || busyId === heat.id} onClick={() => void submitWinner(heat, riderId)} style={{ minHeight: 52, textAlign: 'left', borderRadius: 10, border: heat.winner_rider_id === riderId ? '2px solid #16834b' : '1px solid #bca98c', background: heat.winner_rider_id === riderId ? '#e8f8ee' : '#fff', padding: '8px 10px', fontWeight: 900, opacity: heat.status === 'COMPLETE' ? .75 : 1 }}>
                {heat.winner_rider_id === riderId ? '✓ ' : ''}{riderMap.get(riderId)?.name ?? 'Rider'} <small>#{riderMap.get(riderId)?.no_plate_display ?? '—'}</small><span style={{ display: 'block', fontSize: 11, fontWeight: 600 }}>Ketuk rider yang lebih dulu finis</span>
              </button>)}
            </div> : data.bracket_mode ? <div style={{ display: 'grid', gap: 10 }}>
              {[heat.lane_a_rider_id, heat.lane_b_rider_id].filter((id): id is string => Boolean(id)).map((riderId) => {
                const maxRun = Math.max(2, ...(data.runs ?? []).filter((run) => run.heat_id === heat.id).map((run) => run.run_number))
                const runoffRun = heat.outcome === 'RERUN' ? maxRun + 1 : null
                return <div key={riderId} style={{ borderTop: '1px solid #eee1c9', paddingTop: 8 }}>
                  <strong>{riderMap.get(riderId)?.name ?? 'Rider'} <small>#{riderMap.get(riderId)?.no_plate_display ?? '—'} · Lane {heat.lane_a_rider_id === riderId ? 'A' : 'B'} (bertukar di Run 2)</small></strong>
                  {heat.status !== 'COMPLETE' && <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
                    {renderRunForm(heat, riderId, 1)}
                    {renderRunForm(heat, riderId, 2)}
                    {runoffRun != null && <><div style={{ fontSize: 12, fontWeight: 900, color: '#9d3b08' }}>Nilai masih seri · catat run-off</div>{renderRunForm(heat, riderId, runoffRun)}</>}
                  </div>}
                  {heat.status === 'COMPLETE' && <div style={{ marginTop: 4, fontSize: 12 }}>{(data.runs ?? []).filter((run) => run.heat_id === heat.id && run.rider_id === riderId).sort((a, b) => a.run_number - b.run_number).map((run) => `Run ${run.run_number}: ${run.result_status}${run.total_seconds == null ? '' : ` · ${Number(run.total_seconds).toFixed(3)}s`}`).join(' · ')}</div>}
                </div>
              })}
            </div> : <div style={{ display: 'grid', gap: 10 }}>
              {[heat.lane_a_rider_id, heat.lane_b_rider_id].filter((id): id is string => Boolean(id)).map((riderId) => {
                const runNumber = heat.run_number ?? 1
                const current = formFor(heat, riderId, runNumber)
                const old = resultMap.get(`${heat.id}:${riderId}:${runNumber}`)
                return <div key={riderId} style={{ display: 'grid', gap: 7, borderTop: '1px solid #eee1c9', paddingTop: 8 }}>
                  <strong>{riderMap.get(riderId)?.name ?? 'Rider'} <small>#{riderMap.get(riderId)?.no_plate_display ?? '—'} · Lane {heat.lane_a_rider_id === riderId ? 'A' : 'B'}</small></strong>
                  {old && <span style={{ fontSize: 12, color: '#5b4634' }}>Tersimpan: {old.result_status}{old.total_seconds != null ? ` · ${old.total_seconds}s` : ''}</span>}
                  <select value={current.result_status} onChange={(e) => setForm(heat, riderId, { result_status: e.target.value }, runNumber)} style={field} aria-label="Status hasil">
                    <option value="FINISH">Finish</option><option value="DNS">DNS (sudah dipanggil 2 kali)</option><option value="DNF">DNF</option><option value="DSQ">Diskualifikasi</option><option value="RERUN">Race ulang</option>
                  </select>
                  {current.result_status === 'FINISH' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                    <label style={{ fontSize: 12 }}>RT (detik)<input type="number" step="0.001" value={current.reaction_time_seconds} onChange={(e) => setForm(heat, riderId, { reaction_time_seconds: e.target.value }, runNumber)} style={field} /></label>
                    <label style={{ fontSize: 12 }}>ET (detik)<input type="number" min="0" step="0.001" value={current.elapsed_time_seconds} onChange={(e) => setForm(heat, riderId, { elapsed_time_seconds: e.target.value }, runNumber)} style={field} /></label>
                  </div>}
                  {current.result_status === 'FINISH' && <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><input type="checkbox" checked={current.jump_start} onChange={(e) => setForm(heat, riderId, { jump_start: e.target.checked }, runNumber)} /> False start (+3 detik)</label>}
                  {current.result_status === 'DNS' && <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><input type="checkbox" checked={current.dns_called_twice} onChange={(e) => setForm(heat, riderId, { dns_called_twice: e.target.checked }, runNumber)} /> Sudah dipanggil dua kali</label>}
                  {current.result_status === 'DSQ' && <input value={current.note} onChange={(e) => setForm(heat, riderId, { note: e.target.value }, runNumber)} placeholder="Alasan diskualifikasi" style={field} />}
                  <button disabled={heat.status === 'COMPLETE' || busyId === `${heat.id}:${riderId}:${runNumber}`} onClick={() => void submitRun(heat, riderId, runNumber)} style={{ minHeight: 44, border: 0, borderRadius: 9, background: '#24140d', color: '#fff4df', fontWeight: 900 }}>{busyId === `${heat.id}:${riderId}:${runNumber}` ? 'Menyimpan…' : 'Simpan hasil run'}</button>
                </div>
              })}
            </div>}
          </article>)}
        </div>
      </section>) : null}
    </main>
  </div>
}
