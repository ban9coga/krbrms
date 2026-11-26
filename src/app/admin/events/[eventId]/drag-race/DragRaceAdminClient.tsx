'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApiFetch } from '@/src/hooks/useApiFetch'
import { appConfirm, appPrompt } from '@/src/lib/appDialog'

type Category = {
  id: string
  label: string
  scoring_format_override: string | null
  scoring_format: 'MOTO_POINTS' | 'DRAG_MANUAL' | 'DRAG_TIMING'
}
type Rider = { id: string; name: string; no_plate_display: string }
type Heat = {
  id: string; round_number: number; round_label: string; heat_number: number; run_number: number | null
  lane_a_rider_id: string | null; lane_b_rider_id: string | null; winner_rider_id: string | null
  outcome: string; status: string; next_heat_id: string | null; next_slot: string | null
}
type Run = { heat_id: string; rider_id: string; run_number: number; lane: string; reaction_time_seconds: number | null; elapsed_time_seconds: number | null; total_seconds: number | null; result_status: string }
type Payload = { category: { id: string; label: string }; scoring_format: 'DRAG_MANUAL' | 'DRAG_TIMING'; bracket_mode: boolean; heats: Heat[]; runs: Run[]; riders: Rider[]; final_results: Array<{ rider_id: string; position: number; final_class: string; total_seconds: number | null; finalized_at: string }> }

const formatName = (value: string | null | undefined) => value === 'DRAG_MANUAL' ? 'Manual · juri pilih pemenang' : value === 'DRAG_TIMING' ? 'Timing · RT + ET' : value === 'MOTO_POINTS' ? 'Moto' : 'Ikuti default event'

export default function DragRaceAdminClient({ eventId }: { eventId: string }) {
  const apiFetch = useApiFetch()
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [payload, setPayload] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const load = useCallback(async (id: string) => {
    if (!id) { setPayload(null); setLoading(false); return }
    setLoading(true)
    try {
      const json = await apiFetch(`/api/admin/events/${eventId}/drag-race?category_id=${encodeURIComponent(id)}`)
      setPayload(json.data as Payload)
      setMessage('')
    } catch (error) {
      setPayload(null)
      setMessage(error instanceof Error ? error.message : 'Gagal memuat drawing.')
    } finally { setLoading(false) }
  }, [apiFetch, eventId])

  useEffect(() => {
    let active = true
    apiFetch(`/api/admin/events/${eventId}/drag-race`).then((json) => {
      if (!active) return
      const rows = (json.data?.categories ?? []) as Category[]
      setCategories(rows)
      const firstDragCategory = rows.find((category) => category.scoring_format === 'DRAG_MANUAL' || category.scoring_format === 'DRAG_TIMING')
      if (firstDragCategory) setCategoryId(firstDragCategory.id)
      else setLoading(false)
    }).catch((error) => { if (active) { setMessage(error instanceof Error ? error.message : 'Gagal memuat daftar kategori.'); setLoading(false) } })
    return () => { active = false }
  }, [apiFetch, eventId])

  useEffect(() => { void load(categoryId) }, [categoryId, load])

  const riderMap = useMemo(() => new Map((payload?.riders ?? []).map((rider) => [rider.id, rider])), [payload?.riders])
  const runMap = useMemo(() => {
    const map = new Map<string, Run[]>()
    for (const run of payload?.runs ?? []) {
      const key = `${run.rider_id}:${run.run_number}`
      map.set(key, [...(map.get(key) ?? []), run])
    }
    return map
  }, [payload?.runs])

  const createDraw = async () => {
    if (!categoryId) return
    setBusy(true); setMessage('')
    try {
      const json = await apiFetch(`/api/admin/events/${eventId}/drag-race`, { method: 'POST', body: JSON.stringify({ category_id: categoryId }) })
      setMessage(`Drawing dibuat: ${json.data.rider_count} rider, ${json.data.created} heat/run.`)
      await load(categoryId)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal membuat drawing.') }
    finally { setBusy(false) }
  }

  const finalizeResults = async () => {
    if (!categoryId || !payload) return
    const confirmed = await appConfirm('Finalisasi hasil kategori ini? Ranking akan tersimpan sebagai hasil resmi dan dipakai untuk e-sertifikat.')
    if (!confirmed) return
    setBusy(true); setMessage('')
    try {
      const json = await apiFetch(`/api/admin/events/${eventId}/drag-race/finalize`, { method: 'POST', body: JSON.stringify({ category_id: categoryId }) })
      setMessage(`Hasil resmi tersimpan untuk ${json.data.finalized} rider.`)
      await load(categoryId)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Gagal memfinalisasi hasil.') }
    finally { setBusy(false) }
  }

  const correctManualWinner = async (heat: Heat, winnerId: string) => {
    if (!categoryId || !payload || !heat.winner_rider_id) return
    const winnerName = riderMap.get(winnerId)?.name ?? 'rider terpilih'
    const reason = await appPrompt(`Alasan koreksi Heat ${heat.heat_number}:`, '')
    if (reason === null || !reason.trim()) return
    const confirmed = await appConfirm(`Ubah pemenang menjadi ${winnerName}? Hasil heat lanjutan yang bergantung pada heat ini akan dibatalkan dan perlu dijalankan ulang.`)
    if (!confirmed) return
    setBusy(true); setMessage('')
    try {
      const json = await apiFetch(`/api/admin/events/${eventId}/drag-race/correct`, {
        method: 'POST',
        body: JSON.stringify({ heat_id: heat.id, winner_rider_id: winnerId, reason: reason.trim() }),
      })
      setMessage(`Koreksi tersimpan. ${json.data.invalidated_heats} hasil heat lanjutan dikembalikan ke status menunggu.`)
      await load(categoryId)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Koreksi hasil gagal disimpan.') }
    finally { setBusy(false) }
  }

  const resetTimingHeat = async (heat: Heat) => {
    if (!categoryId || !payload) return
    const reason = await appPrompt(`Alasan reset hasil Heat ${heat.heat_number}:`, '')
    if (reason === null || !reason.trim()) return
    const confirmed = await appConfirm(`Reset hasil Heat ${heat.heat_number} dan ronde lanjutan yang memakai pemenangnya? Hasil tersimpan di audit dan juri perlu mencatat ulang.`)
    if (!confirmed) return
    setBusy(true); setMessage('')
    try {
      const json = await apiFetch(`/api/admin/events/${eventId}/drag-race/correct`, {
        method: 'POST', body: JSON.stringify({ heat_id: heat.id, reason: reason.trim() }),
      })
      setMessage(`Heat direset. ${json.data.invalidated_heats} heat lanjutan juga perlu dijalankan ulang.`)
      await load(categoryId)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Reset hasil gagal.') }
    finally { setBusy(false) }
  }

  const groupedHeats = useMemo(() => {
    const groups = new Map<string, Heat[]>()
    for (const heat of payload?.heats ?? []) {
      const key = payload?.scoring_format === 'DRAG_TIMING' && !payload.bracket_mode ? `Run ${heat.run_number}` : heat.round_label
      groups.set(key, [...(groups.get(key) ?? []), heat])
    }
    return [...groups.entries()]
  }, [payload?.heats, payload?.scoring_format, payload?.bracket_mode])

  const card: React.CSSProperties = { border: '1px solid #d6c6a8', borderRadius: 14, background: '#fff9ed', padding: 12 }
  const button: React.CSSProperties = { border: 0, borderRadius: 10, background: '#24140d', color: '#fff4df', padding: '11px 14px', fontWeight: 800, cursor: 'pointer' }
  return <main style={{ maxWidth: 1100, margin: '0 auto', padding: '18px 14px 100px', color: '#24140d' }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div><div style={{ fontSize: 12, fontWeight: 900, color: '#9d3b08' }}>DRAG RACE</div><h1 style={{ margin: '4px 0', fontSize: 28 }}>Drawing & Hasil</h1><p style={{ margin: 0 }}>Atur kategori, buat heat, lalu catat hasil dari perangkat juri.</p></div>
      <Link href={`/admin/events/${eventId}/settings`} style={{ ...button, textDecoration: 'none' }}>Pengaturan Event</Link>
    </div>
    <section style={{ ...card, marginTop: 16, display: 'grid', gap: 12 }}>
      <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>Kategori Drag Race
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} style={{ minHeight: 44, border: '1px solid #bca98c', borderRadius: 10, padding: '8px 10px', background: 'white' }}>
          <option value="">Pilih kategori</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.label} · {formatName(category.scoring_format)}</option>)}
        </select>
      </label>
      {payload && <div><strong>Format:</strong> {formatName(payload.scoring_format)} · {payload.heats.length} heat/run tersimpan.</div>}
      {payload?.final_results.length ? <div role="status" style={{ borderRadius: 10, background: '#e8f8ee', padding: 10, fontWeight: 800 }}>Hasil resmi difinalisasi · {payload.final_results.length} rider masuk ranking dan e-sertifikat.</div> : null}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {payload && payload.heats.length === 0 && <button onClick={() => void createDraw()} disabled={busy} style={button}>{busy ? 'Membuat drawing…' : 'Buat drawing bracket'}</button>}
        {payload && payload.heats.length > 0 && payload.final_results.length === 0 && <button onClick={() => void finalizeResults()} disabled={busy || payload.heats.some((heat) => heat.status !== 'COMPLETE')} style={{ ...button, background: '#e0a90b', color: '#24140d', opacity: payload.heats.some((heat) => heat.status !== 'COMPLETE') ? .55 : 1 }}>{busy ? 'Menyimpan…' : 'Finalisasi hasil & ranking'}</button>}
        {categoryId && <button onClick={() => void load(categoryId)} style={{ ...button, background: '#f5e6c8', color: '#24140d', border: '1px solid #d6c6a8' }}>Muat ulang</button>}
      </div>
      {message && <p role="status" style={{ margin: 0, fontWeight: 700 }}>{message}</p>}
      {loading && <p style={{ margin: 0 }}>Memuat…</p>}
      {!loading && categories.length > 0 && categories.every((category) => !category.scoring_format.startsWith('DRAG_')) && <p style={{ margin: 0 }}>Atur format Drag Race di Pengaturan Event atau override kategori di halaman kategori.</p>}
    </section>
    {payload?.heats.length ? <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
      {groupedHeats.map(([group, heats]) => <section key={group} style={{ ...card, display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{group}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 285px), 1fr))', gap: 8 }}>
          {heats.map((heat) => <article key={heat.id} style={{ border: '1px solid #e2d5bd', borderRadius: 10, padding: 10, background: '#fffdf8' }}>
            <strong>Heat {heat.heat_number}</strong><span style={{ float: 'right', fontSize: 12 }}>{heat.status === 'COMPLETE' ? 'Selesai' : heat.status === 'LIVE' ? 'Berjalan' : heat.outcome === 'BYE' ? 'Bye' : 'Menunggu'}</span>
            {payload.scoring_format === 'DRAG_MANUAL' || payload.bracket_mode ? <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
              <div>Lane A: {heat.lane_a_rider_id ? riderMap.get(heat.lane_a_rider_id)?.name ?? 'Rider' : '—'}</div>
              <div>Lane B: {heat.lane_b_rider_id ? riderMap.get(heat.lane_b_rider_id)?.name ?? 'Rider' : '—'}</div>
              <div style={{ color: '#775d40', fontSize: 13 }}>Pemenang: {heat.winner_rider_id ? riderMap.get(heat.winner_rider_id)?.name ?? '—' : 'Belum dicatat'}</div>
              {payload.scoring_format === 'DRAG_MANUAL' && heat.status === 'COMPLETE' && heat.outcome !== 'BYE' && heat.winner_rider_id && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {[heat.lane_a_rider_id, heat.lane_b_rider_id].filter((id): id is string => Boolean(id) && id !== heat.winner_rider_id).map((riderId) => <button key={riderId} disabled={busy || payload.final_results.length > 0} onClick={() => void correctManualWinner(heat, riderId)} style={{ border: '1px solid #b14b31', borderRadius: 8, background: '#fff1e9', color: '#682819', padding: '7px 9px', fontWeight: 800, cursor: 'pointer' }}>Koreksi: pemenang {riderMap.get(riderId)?.name ?? 'rider'}</button>)}
              </div>}
              {payload.scoring_format === 'DRAG_TIMING' && payload.bracket_mode && heat.outcome !== 'BYE' && heat.status !== 'UPCOMING' && payload.final_results.length === 0 && <button disabled={busy} onClick={() => void resetTimingHeat(heat)} style={{ justifySelf: 'start', marginTop: 4, border: '1px solid #b14b31', borderRadius: 8, background: '#fff1e9', color: '#682819', padding: '7px 9px', fontWeight: 800, cursor: 'pointer' }}>Reset hasil & input ulang</button>}
            </div> : <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              {[heat.lane_a_rider_id, heat.lane_b_rider_id].filter((id): id is string => Boolean(id)).map((riderId) => {
                const rider = riderMap.get(riderId)
                const run = runMap.get(`${riderId}:${heat.run_number}`)?.find((row) => row.heat_id === heat.id)
                return <div key={riderId} style={{ fontSize: 13 }}>{rider?.name ?? 'Rider'} · {run ? `${run.result_status}${run.total_seconds != null ? ` · ${run.total_seconds}s` : ''}` : 'Belum dicatat'}</div>
              })}
            </div>}
            {payload.scoring_format === 'DRAG_TIMING' && payload.bracket_mode && <div style={{ marginTop: 6, borderTop: '1px solid #eee1c9', paddingTop: 6, fontSize: 12, color: '#775d40' }}>
              {[heat.lane_a_rider_id, heat.lane_b_rider_id].filter((id): id is string => Boolean(id)).map((riderId) => {
                const riderRuns = (payload.runs ?? []).filter((row) => row.heat_id === heat.id && row.rider_id === riderId).sort((a, b) => a.run_number - b.run_number)
                return <div key={riderId}><b>{riderMap.get(riderId)?.name ?? 'Rider'}:</b> {riderRuns.length ? riderRuns.map((run) => `R${run.run_number} ${run.result_status}${run.total_seconds == null ? '' : ` ${Number(run.total_seconds).toFixed(3)}s`}`).join(' · ') : 'Belum mencatat waktu'}</div>
              })}
            </div>}
          </article>)}
        </div>
      </section>)}
    </div> : null}
  </main>
}
