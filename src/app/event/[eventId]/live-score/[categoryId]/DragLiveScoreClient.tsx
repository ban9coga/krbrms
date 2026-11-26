'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import PublicTopbar from '../../../../../components/PublicTopbar'
import { usePublicLiveScoreRealtime } from '../../../../../hooks/usePublicLiveScoreRealtime'
import type { EventItem, RiderCategory } from '../../../../../lib/eventService'

type Rider = { id: string; name: string; no_plate_display: string; club?: string | null } | null
type Heat = { id: string; round_number: number; round_label: string; heat_number: number; run_number: number | null; status: string; outcome: string; lane_a_rider: Rider; lane_b_rider: Rider; winner: Rider }
type Run = { heat_id: string; rider_id: string; run_number: number; lane: string; reaction_time_seconds: number | null; elapsed_time_seconds: number | null; total_seconds: number | null; result_status: string; rider: Rider }
type Standing = { riderId: string; status: string; totalSeconds: number | null; totalElapsedSeconds: number | null; totalReactionSeconds: number | null; completedRuns: number; needsRunoff: boolean; rider: Rider }
type FinalResult = { rider_id: string; position: number; final_class: string; total_seconds: number | null }
type Data = { event: { name: string; status: string }; category: { id: string; label: string }; scoring_format: 'DRAG_MANUAL' | 'DRAG_TIMING'; bracket_mode: boolean; heats: Heat[]; runs: Run[]; standings: Standing[]; final_results: FinalResult[] }

export default function DragLiveScoreClient({ eventId, categoryId, initialEvent, initialCategories, initialData }: {
  eventId: string; categoryId: string; initialEvent: EventItem | null; initialCategories: RiderCategory[]; initialData: Data | null
}) {
  const [data, setData] = useState(initialData)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    const response = await fetch(`/api/public/events/${eventId}/drag-score?category_id=${encodeURIComponent(categoryId)}`, { cache: 'no-store' })
    const json = await response.json()
    if (!response.ok) throw new Error(json?.error || 'Gagal memuat hasil.')
    setData(json.data as Data)
    setError('')
  }, [categoryId, eventId])
  const refreshSignal = useCallback(() => { void refresh().catch((reason) => setError(reason instanceof Error ? reason.message : 'Gagal memperbarui hasil.')) }, [refresh])
  usePublicLiveScoreRealtime({ eventId, categoryId, enabled: initialEvent?.status !== 'FINISHED', refreshOnVisible: false, onScoreChanged: refreshSignal })
  const categories = useMemo(() => [...initialCategories].sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0)), [initialCategories])
  const riderRuns = useMemo(() => {
    const map = new Map<string, Run[]>()
    for (const run of data?.runs ?? []) map.set(run.rider_id, [...(map.get(run.rider_id) ?? []), run])
    return map
  }, [data?.runs])

  return <div className="min-h-screen bg-[var(--page-bg)] pb-24 text-[var(--text-primary)]">
    <PublicTopbar />
    <main className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-5">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/event/${eventId}`} className="font-bold underline">Kembali ke event</Link><span aria-hidden="true">·</span>
        <Link href={`/event/${eventId}/live-score`} className="font-bold underline">Semua kategori</Link>
      </div>
      <header className="rounded-2xl bg-[#24140d] p-4 text-[#fff4df]">
        <div className="text-xs font-bold text-amber-300">{data?.event.name ?? initialEvent?.name ?? 'Event'}</div>
        <h1 className="mt-1 text-2xl font-black">{data?.category.label ?? categories.find((item) => item.id === categoryId)?.label ?? 'Drag Race'}</h1>
        <p className="mt-1 text-sm">{data?.scoring_format === 'DRAG_TIMING' ? (data.bracket_mode ? 'Bracket · Dua run per heat · RT + ET' : 'Klasemen waktu · Dua run · RT + ET') : 'Bracket · Head-to-head · Juri memilih pemenang'}</p>
      </header>
      <nav aria-label="Pilih kategori" className="my-3 flex gap-2 overflow-x-auto pb-1">
        {categories.map((category) => <Link key={category.id} href={`/event/${eventId}/live-score/${category.id}`} aria-current={category.id === categoryId ? 'page' : undefined} className={`shrink-0 rounded-full border px-3 py-2 text-sm font-bold ${category.id === categoryId ? 'border-amber-400 bg-amber-300 text-[#24140d]' : 'border-[#a88556] bg-[var(--card-bg)]'}`}>{category.label}</Link>)}
      </nav>
      {error && <p role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-rose-800">{error}</p>}
      {!data ? <section className="rounded-2xl bg-[var(--card-bg)] p-5">Hasil Drag Race belum dapat dimuat. <button onClick={refreshSignal} className="ml-2 underline">Coba lagi</button></section> : data.heats.length === 0 ? <section className="rounded-2xl bg-[var(--card-bg)] p-5">Drawing Drag Race belum dibuat.</section> : data.scoring_format === 'DRAG_MANUAL' || data.bracket_mode ? <div className="mt-3 grid gap-3">
        {data.final_results.length > 0 && <section className="rounded-2xl bg-[var(--card-bg)] p-3 sm:p-4"><h2 className="mb-2 text-lg font-black">Hasil resmi</h2><div className="grid gap-2">{data.final_results.map((row) => <div key={row.rider_id} className="flex justify-between gap-3 rounded-xl border border-[var(--card-border)] p-3"><span><b>{row.position}. {data.heats.flatMap((heat) => [heat.lane_a_rider, heat.lane_b_rider]).find((rider) => rider?.id === row.rider_id)?.name ?? 'Rider'}</b><small className="block">{row.final_class}</small></span><span>{row.position <= 3 ? `Juara ${row.position}` : 'Finisher'}</span></div>)}</div></section>}
        {Array.from(new Map(data.heats.map((heat) => [heat.round_number, heat.round_label])).entries()).map(([roundNumber, label]) => <section key={roundNumber} className="rounded-2xl bg-[var(--card-bg)] p-3 sm:p-4">
          <h2 className="mb-2 text-lg font-black">{label}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.heats.filter((heat) => heat.round_number === roundNumber).map((heat) => <article key={heat.id} className="rounded-xl border border-[var(--card-border)] p-3">
              <div className="mb-2 flex justify-between text-xs font-bold"><span>Heat {heat.heat_number}</span><span>{heat.outcome === 'BYE' ? 'Bye' : heat.outcome === 'RERUN' ? 'Race ulang penentu' : heat.status === 'COMPLETE' ? 'Selesai' : heat.status === 'LIVE' ? 'Berjalan' : 'Menunggu'}</span></div>
              {[['A', heat.lane_a_rider], ['B', heat.lane_b_rider]].map(([lane, rider]) => {
                const item = rider as Rider
                if (!item) return null
                const winner = heat.winner?.id === item.id
                const matchRuns = data.runs.filter((run) => run.heat_id === heat.id && run.rider_id === item.id).sort((a, b) => a.run_number - b.run_number)
                return <div key={lane as string} className={`mb-1 rounded-lg px-2 py-2 ${winner ? 'bg-emerald-100 font-black text-emerald-900' : 'bg-[var(--page-bg)]'}`}>
                  <div className="flex justify-between gap-2"><span>{lane as string} · {item.name} <small>#{item.no_plate_display}</small></span>{winner && <span>Pemenang</span>}</div>
                  {data.bracket_mode && data.scoring_format === 'DRAG_TIMING' && <div className="mt-1 text-xs font-normal">{matchRuns.length ? matchRuns.map((run) => `Run ${run.run_number}: ${run.result_status}${run.total_seconds == null ? '' : ` · ${Number(run.total_seconds).toFixed(3)}s`}`).join(' · ') : 'Waktu belum dicatat'}</div>}
                </div>
              })}
            </article>)}
          </div>
        </section>)}
      </div> : <section className="mt-3 rounded-2xl bg-[var(--card-bg)] p-3 sm:p-4">
        <h2 className="mb-2 text-lg font-black">{data.final_results.length ? 'Hasil resmi' : 'Klasemen waktu'}</h2>
        <p className="mb-3 text-xs">Total = 10% RT + 90% ET untuk tiap run; dua total run dijumlahkan. Pemenang seri ditentukan oleh ET lalu RT.</p>
        <div className="grid gap-2">{data.standings.map((row, index) => {
          const official = data.final_results.find((result) => result.rider_id === row.riderId)
          return <article key={row.riderId} className="rounded-xl border border-[var(--card-border)] p-3">
          <div className="flex items-start justify-between gap-2"><div><b>{official?.position ?? index + 1}. {row.rider?.name ?? 'Rider'}</b><div className="text-xs">#{row.rider?.no_plate_display ?? '—'} · {row.rider?.club ?? '—'}</div></div><div className="text-right font-bold">{row.totalSeconds == null ? row.status : `${row.totalSeconds.toFixed(3)}s`}{row.needsRunoff && <div className="text-xs text-amber-700">Perlu race ulang</div>}</div></div>
          <div className="mt-2 grid grid-cols-2 gap-2">{[1, 2].map((runNumber) => {
            const run = riderRuns.get(row.riderId)?.find((item) => item.run_number === runNumber)
            return <div key={runNumber} className="rounded-lg bg-[var(--page-bg)] p-2 text-xs"><b>Run {runNumber}</b><br />{run ? `${run.result_status} · Lane ${run.lane}${run.total_seconds != null ? ` · ${Number(run.total_seconds).toFixed(3)}s` : ''}` : 'Belum dicatat'}</div>
          })}</div>
        </article>})}</div>
      </section>}
      <div className="mt-3 flex justify-end"><button onClick={refreshSignal} className="min-h-11 rounded-full border border-[#8a6744] px-4 font-bold">Perbarui hasil</button></div>
    </main>
  </div>
}
