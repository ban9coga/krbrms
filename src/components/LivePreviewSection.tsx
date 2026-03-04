'use client'

import { useEffect, useState } from 'react'

type LiveRow = {
  position: number
  riderName: string
  category: string
  totalPoints: string
  rank: string
}

type EventItem = {
  id: string
  name: string
}

type CategoryItem = {
  id: string
  label: string
  enabled?: boolean
}

type BatchRow = {
  name?: string
  total_point?: number | null
  rank_point?: number | null
}

type StageRow = {
  name?: string
  point?: number | null
}

type LiveScorePayload = {
  data?: {
    category?: string
    batches?: Array<{
      moto_status?: string | null
      rows?: BatchRow[]
    }>
    stages?: Array<{
      rows?: StageRow[]
    }>
  }
}

const mapBatchRows = (rows: BatchRow[], category: string): LiveRow[] => {
  return [...rows]
    .sort((a, b) => {
      const aRank = a.rank_point ?? Number.MAX_SAFE_INTEGER
      const bRank = b.rank_point ?? Number.MAX_SAFE_INTEGER
      return aRank - bRank
    })
    .slice(0, 5)
    .map((row, idx) => ({
      position: idx + 1,
      riderName: row.name ?? '-',
      category,
      totalPoints: row.total_point == null ? '-' : `${row.total_point}`,
      rank: row.rank_point == null ? '-' : `${row.rank_point}`,
    }))
}

const mapStageRows = (rows: StageRow[], category: string): LiveRow[] => {
  return [...rows]
    .sort((a, b) => {
      const aPoint = a.point ?? Number.MAX_SAFE_INTEGER
      const bPoint = b.point ?? Number.MAX_SAFE_INTEGER
      return aPoint - bPoint
    })
    .slice(0, 5)
    .map((row, idx) => ({
      position: idx + 1,
      riderName: row.name ?? '-',
      category,
      totalPoints: row.point == null ? '-' : `${row.point}`,
      rank: `${idx + 1}`,
    }))
}

export default function LivePreviewSection() {
  const [rows, setRows] = useState<LiveRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState<{ eventName: string; category: string } | null>(null)
  const [emptyLabel, setEmptyLabel] = useState('Belum ada data live untuk ditampilkan.')

  useEffect(() => {
    let mounted = true

    const loadLivePreview = async () => {
      setLoading(true)
      setError(null)

      try {
        const eventRes = await fetch('/api/events?status=LIVE', { cache: 'no-store' })
        const eventJson = await eventRes.json().catch(() => ({}))
        if (!eventRes.ok) throw new Error(eventJson?.error || 'Gagal memuat event LIVE')

        const events = Array.isArray(eventJson?.data) ? (eventJson.data as EventItem[]) : []
        const liveEvent = events[0]
        if (!liveEvent) {
          if (!mounted) return
          setRows([])
          setSource(null)
          setEmptyLabel('Belum ada event LIVE saat ini.')
          return
        }

        const categoryRes = await fetch(`/api/events/${liveEvent.id}/categories`, { cache: 'no-store' })
        const categoryJson = await categoryRes.json().catch(() => ({}))
        if (!categoryRes.ok) throw new Error(categoryJson?.error || 'Gagal memuat category event')

        const categories = Array.isArray(categoryJson?.data) ? (categoryJson.data as CategoryItem[]) : []
        const enabledCategories = categories.filter((c) => c.enabled !== false)
        if (enabledCategories.length === 0) {
          if (!mounted) return
          setRows([])
          setSource(null)
          setEmptyLabel('Event LIVE belum punya category aktif.')
          return
        }

        for (const category of enabledCategories) {
          const scoreRes = await fetch(
            `/api/public/events/${liveEvent.id}/live-score?category_id=${encodeURIComponent(category.id)}`,
            { cache: 'no-store' }
          )
          const scoreJson = (await scoreRes.json().catch(() => ({}))) as LiveScorePayload
          if (!scoreRes.ok) continue

          const payload = scoreJson.data
          const categoryLabel = payload?.category ?? category.label ?? '-'

          const batches = payload?.batches ?? []
          const preferredBatch =
            batches.find((b) => (b.moto_status ?? '').toUpperCase() === 'LIVE' && (b.rows?.length ?? 0) > 0) ??
            batches.find((b) => (b.rows?.length ?? 0) > 0)
          const batchRows = preferredBatch?.rows ?? []
          const mappedBatchRows = batchRows.length > 0 ? mapBatchRows(batchRows, categoryLabel) : []

          if (mappedBatchRows.length > 0) {
            if (!mounted) return
            setRows(mappedBatchRows)
            setSource({ eventName: liveEvent.name, category: categoryLabel })
            return
          }

          const stages = payload?.stages ?? []
          const firstStageWithRows = stages.find((s) => (s.rows?.length ?? 0) > 0)
          const stageRows = firstStageWithRows?.rows ?? []
          const mappedStageRows = stageRows.length > 0 ? mapStageRows(stageRows, categoryLabel) : []

          if (mappedStageRows.length > 0) {
            if (!mounted) return
            setRows(mappedStageRows)
            setSource({ eventName: liveEvent.name, category: categoryLabel })
            return
          }
        }

        if (!mounted) return
        setRows([])
        setSource(null)
        setEmptyLabel('Category LIVE ditemukan, tapi hasil belum masuk.')
      } catch (err) {
        if (!mounted) return
        setError(err instanceof Error ? err.message : 'Gagal memuat live preview')
        setRows([])
        setSource(null)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadLivePreview()
    return () => {
      mounted = false
    }
  }, [])

  return (
    <section className="w-full bg-slate-100 px-2 py-4 sm:px-4 md:px-6 md:py-8">
      <div className="mx-auto w-full max-w-[1500px]">
        <div className="relative overflow-hidden rounded-[2rem] bg-[linear-gradient(125deg,#090f1d_0%,#1e293b_42%,#4a0f23_100%)] px-5 py-14 shadow-[0_40px_120px_rgba(15,23,42,0.32)] sm:px-8 sm:py-16 md:rounded-[2.5rem] md:px-14 md:py-20">
          <div className="pointer-events-none absolute -bottom-20 -left-16 h-72 w-72 rounded-full bg-rose-500/15 blur-3xl" />
          <div className="pointer-events-none absolute -top-24 right-0 h-72 w-72 rounded-full bg-sky-400/15 blur-3xl" />

          <div className="relative z-10 mx-auto max-w-5xl">
            <h2 className="text-center text-3xl font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl">
              See Live Results in Action
            </h2>
            {source && (
              <p className="mt-4 text-center text-sm font-semibold text-slate-300">
                {source.eventName} - {source.category}
              </p>
            )}

            <div className="mx-auto mt-10 w-full rounded-3xl border border-slate-700/70 bg-slate-900/55 p-3 backdrop-blur-sm sm:mt-12 sm:p-5 md:p-7">
              <div className="table-mobile-hint text-slate-300 before:border-slate-500/70 before:bg-slate-700/60 before:text-slate-200">
                Geser kiri/kanan untuk lihat semua kolom.
              </div>
              <div className="table-scroll-x">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300 sm:px-4">
                        Position
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300 sm:px-4">
                        Rider Name
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300 sm:px-4">
                        Category
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300 sm:px-4">
                        Total Points
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-300 sm:px-4">
                        Rank
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr className="border-b border-slate-700/60 bg-slate-900/55">
                        <td colSpan={5} className="px-4 py-6 text-center text-sm font-semibold text-slate-300">
                          Loading live data...
                        </td>
                      </tr>
                    ) : error ? (
                      <tr className="border-b border-slate-700/60 bg-slate-900/55">
                        <td colSpan={5} className="px-4 py-6 text-center text-sm font-semibold text-rose-300">
                          {error}
                        </td>
                      </tr>
                    ) : rows.length === 0 ? (
                      <tr className="border-b border-slate-700/60 bg-slate-900/55">
                        <td colSpan={5} className="px-4 py-6 text-center text-sm font-semibold text-slate-300">
                          {emptyLabel}
                        </td>
                      </tr>
                    ) : (
                      rows.map((row, idx) => (
                        <tr
                          key={`${row.position}-${row.riderName}`}
                          className={`border-b border-slate-700/60 transition-colors duration-200 hover:bg-slate-700/55 ${
                            idx % 2 === 0 ? 'bg-slate-900/45' : 'bg-slate-800/45'
                          }`}
                        >
                          <td className="px-3 py-3 text-sm font-semibold text-white sm:px-4 sm:py-4">{row.position}</td>
                          <td className="px-3 py-3 text-sm font-medium text-slate-100 sm:px-4 sm:py-4">{row.riderName}</td>
                          <td className="px-3 py-3 text-sm text-slate-300 sm:px-4 sm:py-4">{row.category}</td>
                          <td className="px-3 py-3 text-sm font-mono text-slate-200 sm:px-4 sm:py-4">{row.totalPoints}</td>
                          <td className="px-3 py-3 sm:px-4 sm:py-4">
                            <span className="inline-flex rounded-full border border-sky-400/30 bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-200">
                              {row.rank}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
