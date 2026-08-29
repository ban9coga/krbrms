'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import LogoutButton from '@/src/components/LogoutButton'
import { ThemeToggleSwitch } from '@/src/components/ThemeProvider'
import { useApiFetch } from '@/src/hooks/useApiFetch'
import { useEventRaceRealtime } from '@/src/hooks/useEventRaceRealtime'
import { useHighVisibility } from '@/src/hooks/useHighVisibility'
import { supabase } from '@/src/lib/supabaseClient'

type Category = {
  id: string
  label: string
  enabled: boolean
  sequence_order: number | null
}

type QualificationRow = {
  rider_id: string
  gate_moto1: number | null
  gate_moto2: number | null
  gate_moto3?: number | null
  name: string
  rider_nickname?: string | null
  no_plate: string
  club: string | null
  point_moto1: number | null
  point_moto2: number | null
  point_moto3?: number | null
  moto1_status?: ResultStatus | null
  moto2_status?: ResultStatus | null
  moto3_status?: ResultStatus | null
  penalty_total: number | null
  total_point: number | null
  rank_point: number | null
  status: ResultStatus
  class_label?: string | null
}

type Batch = {
  batch_index: number
  moto1_id: string
  moto2_id: string | null
  moto3_id?: string | null
  rows: QualificationRow[]
}

type ResultStatus = 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING' | 'FINISHED'

type StageRow = {
  rider_id: string
  gate: number | null
  name: string
  rider_nickname?: string | null
  no_plate: string
  club: string | null
  point: number | null
  penalty_total: number | null
  rank: number | null
  status: ResultStatus
  next_class_label?: string | null
}

type Stage = {
  title: string
  moto_id: string
  rows: StageRow[]
}

type ScoreData = {
  category?: string
  batches?: Batch[]
  stages?: Stage[]
}

type MotoState = {
  id: string
  category_id: string
  moto_name: string
  status: 'UPCOMING' | 'READY' | 'LIVE' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED' | 'FINISHED'
}

const motoStatusClass = (status: MotoState['status']) => {
  if (status === 'LIVE') return 'border-emerald-300 bg-emerald-50 text-emerald-800'
  if (status === 'READY') return 'border-sky-300 bg-sky-50 text-sky-800'
  if (status === 'PROVISIONAL') return 'border-amber-300 bg-amber-50 text-amber-800'
  if (status === 'LOCKED' || status === 'FINISHED') return 'border-slate-300 bg-slate-100 text-slate-700'
  return 'border-slate-200 bg-white text-slate-600'
}

const statusClass = (status?: ResultStatus | null) => {
  if (status === 'DNF') return 'border-amber-300 bg-amber-50 text-amber-800'
  if (status === 'DNS') return 'border-rose-300 bg-rose-50 text-rose-800'
  if (status === 'DQ') return 'border-red-400 bg-red-100 text-red-800'
  if (status === 'PENDING') return 'border-slate-300 bg-slate-100 text-slate-600'
  return 'border-emerald-300 bg-emerald-50 text-emerald-800'
}

const renderPoint = (point: number | null, status?: ResultStatus | null) => {
  if (status === 'DNF' || status === 'DNS' || status === 'DQ') {
    return (
      <span className="inline-flex flex-col items-center gap-1">
        <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-black ${statusClass(status)}`}>{status}</span>
        <span>{point ?? '-'}</span>
      </span>
    )
  }
  return point ?? '-'
}

const stageSortKey = (title: string) => {
  const normalized = title.trim().toUpperCase()
  if (normalized.startsWith('REPECHAGE')) return 0
  if (normalized.startsWith('QUARTER FINAL')) return 1
  if (normalized.startsWith('SEMI FINAL')) return 2
  if (normalized.startsWith('FINAL')) return 3
  return 4
}

const riderDisplayName = (row: { name: string; rider_nickname?: string | null }) => row.rider_nickname?.trim() || row.name

const hasDifferentNickname = (row: { name: string; rider_nickname?: string | null }) => {
  const nickname = row.rider_nickname?.trim()
  return Boolean(nickname && nickname.toLocaleLowerCase() !== row.name.trim().toLocaleLowerCase())
}

function CompactQualificationTable({ batch, showMoto3, large }: { batch: Batch; showMoto3: boolean; large: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className={`w-full min-w-[720px] border-collapse ${large ? 'text-sm md:text-base' : 'text-xs md:text-sm'}`}>
        <thead className="bg-slate-100 text-left text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
          <tr>
            <th className="min-w-[210px] px-3 py-2.5">Rider</th>
            <th className="px-2 py-2.5 text-center">G1</th>
            <th className="px-2 py-2.5 text-center">G2</th>
            {showMoto3 && <th className="px-2 py-2.5 text-center">G3</th>}
            <th className="px-2 py-2.5 text-center">P1</th>
            <th className="px-2 py-2.5 text-center">P2</th>
            {showMoto3 && <th className="px-2 py-2.5 text-center">P3</th>}
            <th className="px-2 py-2.5 text-center">Penalty</th>
            <th className="px-2 py-2.5 text-center">Total</th>
            <th className="px-2 py-2.5 text-center">Rank</th>
            <th className="min-w-[110px] px-3 py-2.5">Lanjut</th>
          </tr>
        </thead>
        <tbody>
          {batch.rows.map((row, index) => (
            <tr key={row.rider_id} className={`border-t-2 border-slate-200 transition-colors hover:bg-amber-50 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}`}>
              <td className="px-3 py-2.5">
                <div className="font-black text-slate-900">{riderDisplayName(row)}</div>
                {hasDifferentNickname(row) && <div className="mt-0.5 text-[9px] font-bold text-slate-500">{row.name}</div>}
                <div className="mt-1 text-[10px] font-bold text-amber-700">{row.no_plate} <span className="text-slate-400">|</span> <span className="text-slate-600">{row.club || '-'}</span></div>
              </td>
              <td className="px-2 py-2.5 text-center font-black">{row.gate_moto1 ?? '-'}</td>
              <td className="px-2 py-2.5 text-center font-black">{row.gate_moto2 ?? '-'}</td>
              {showMoto3 && <td className="px-2 py-2.5 text-center font-black">{row.gate_moto3 ?? '-'}</td>}
              <td className="px-2 py-2.5 text-center font-black text-sky-700">{renderPoint(row.point_moto1, row.moto1_status)}</td>
              <td className="px-2 py-2.5 text-center font-black text-sky-700">{renderPoint(row.point_moto2, row.moto2_status)}</td>
              {showMoto3 && <td className="px-2 py-2.5 text-center font-black text-sky-700">{renderPoint(row.point_moto3 ?? null, row.moto3_status)}</td>}
              <td className="px-2 py-2.5 text-center font-black text-amber-700">{row.penalty_total ?? '-'}</td>
              <td className="px-2 py-2.5 text-center font-black text-slate-900">{row.total_point ?? '-'}</td>
              <td className="px-2 py-2.5 text-center font-black text-emerald-700">{row.rank_point ?? '-'}</td>
              <td className="px-3 py-2.5 text-[10px] font-black uppercase leading-tight text-slate-600">{row.class_label || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CompactStageTable({ stage, large }: { stage: Stage; large: boolean }) {
  const isFinal = stage.title.trim().toUpperCase().startsWith('FINAL')
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className={`w-full min-w-[620px] border-collapse ${large ? 'text-sm md:text-base' : 'text-xs md:text-sm'}`}>
        <thead className="bg-slate-100 text-left text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
          <tr>
            <th className="min-w-[220px] px-3 py-2.5">Rider</th>
            <th className="px-2 py-2.5 text-center">Gate</th>
            <th className="px-2 py-2.5 text-center">Point</th>
            <th className="px-2 py-2.5 text-center">Penalty</th>
            <th className="px-2 py-2.5 text-center">Rank</th>
            {!isFinal && <th className="min-w-[110px] px-3 py-2.5">Lanjut</th>}
          </tr>
        </thead>
        <tbody>
          {stage.rows.map((row, index) => (
            <tr key={row.rider_id} className={`border-t-2 border-slate-200 transition-colors hover:bg-amber-50 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}`}>
              <td className="px-3 py-2.5">
                <div className="font-black text-slate-900">{riderDisplayName(row)}</div>
                {hasDifferentNickname(row) && <div className="mt-0.5 text-[9px] font-bold text-slate-500">{row.name}</div>}
                <div className="mt-1 text-[10px] font-bold text-amber-700">{row.no_plate} <span className="text-slate-400">|</span> <span className="text-slate-600">{row.club || '-'}</span></div>
              </td>
              <td className="px-2 py-2.5 text-center font-black">{row.gate ?? '-'}</td>
              <td className="px-2 py-2.5 text-center font-black text-sky-700">{renderPoint(row.point, row.status)}</td>
              <td className="px-2 py-2.5 text-center font-black text-amber-700">{row.penalty_total ?? '-'}</td>
              <td className="px-2 py-2.5 text-center font-black text-emerald-700">{row.rank ?? '-'}</td>
              {!isFinal && <td className="px-3 py-2.5 text-[10px] font-black uppercase leading-tight text-slate-600">{row.next_class_label || '-'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function McLivePage() {
  const params = useParams()
  const router = useRouter()
  const eventId = String(params?.eventId ?? '')
  const routeCategoryId = typeof params?.categoryId === 'string' ? params.categoryId : null
  const isCategoryPage = Boolean(routeCategoryId)
  const apiFetch = useApiFetch()
  const { highVisibility, toggleHighVisibility } = useHighVisibility('mc-high-visibility')
  const [categories, setCategories] = useState<Category[]>([])
  const [score, setScore] = useState<ScoreData | null>(null)
  const [motoStates, setMotoStates] = useState<MotoState[]>([])
  const [loadingCategories, setLoadingCategories] = useState(true)
  const [loadingScore, setLoadingScore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === routeCategoryId) ?? null,
    [categories, routeCategoryId]
  )

  const loadCategories = useCallback(async () => {
    if (!eventId) return
    setLoadingCategories(true)
    setError(null)
    try {
      const json = await apiFetch(`/api/events/${eventId}/categories`)
      const nextCategories = ((json.data ?? []) as Category[]).filter((category) => category.enabled !== false)
      setCategories(nextCategories)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat kategori.')
    } finally {
      setLoadingCategories(false)
    }
  }, [apiFetch, eventId])

  const loadScore = useCallback(async (silent = false) => {
    if (!eventId || !routeCategoryId) return
    if (!silent) setLoadingScore(true)
    setError(null)
    try {
      const query = new URLSearchParams({ category_id: routeCategoryId, include_upcoming: '1', include_photos: '0' })
      const [json, motoStateJson] = await Promise.all([
        apiFetch(`/api/public/events/${eventId}/live-score?${query.toString()}`),
        apiFetch(`/api/jury/events/${eventId}/moto-state`),
      ])
      setScore((json.data ?? null) as ScoreData | null)
      setMotoStates(((motoStateJson.data ?? []) as MotoState[]).filter((moto) => moto.category_id === routeCategoryId))
      setLastUpdated(new Date().toLocaleTimeString())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat hasil kategori.')
    } finally {
      if (!silent) setLoadingScore(false)
    }
  }, [apiFetch, eventId, routeCategoryId])

  useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  useEffect(() => {
    setScore(null)
    setMotoStates([])
    if (routeCategoryId) void loadScore()
  }, [loadScore, routeCategoryId])

  useEventRaceRealtime({
    eventId,
    enabled: Boolean(eventId && routeCategoryId),
    onRaceStateChanged: () => void loadScore(true),
    debounceMs: 500,
  })

  useEffect(() => {
    if (!routeCategoryId) return
    const interval = window.setInterval(() => void loadScore(true), 45_000)
    return () => window.clearInterval(interval)
  }, [loadScore, routeCategoryId])

  const batches = score?.batches ?? []
  const stages = useMemo(() => [...(score?.stages ?? [])].sort((a, b) => stageSortKey(a.title) - stageSortKey(b.title) || a.title.localeCompare(b.title)), [score])
  const showMoto3 = batches.some((batch) => Boolean(batch.moto3_id))
  const motoStateById = useMemo(() => new Map(motoStates.map((moto) => [moto.id, moto])), [motoStates])
  const nextCategory = useMemo(() => {
    if (!routeCategoryId) return null
    const currentIndex = categories.findIndex((category) => category.id === routeCategoryId)
    return currentIndex >= 0 ? categories[currentIndex + 1] ?? null : null
  }, [categories, routeCategoryId])

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut()
    document.cookie = 'sb-access-token=; Path=/; Max-Age=0'
    router.replace('/login')
  }, [router])

  return (
    <div className="min-h-screen bg-[var(--app-bg)] text-[var(--app-text)]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3 px-3 py-2.5 sm:px-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[#e95c18]">RacePushbike Crew</p>
            <p className="text-sm font-black text-slate-900">MC Control</p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggleSwitch />
            <LogoutButton onClick={handleLogout} />
          </div>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-[1440px] gap-4 px-3 py-3 sm:px-5 sm:py-5">
        <section className="public-hero live-score-editorial-hero !rounded-[24px] px-4 py-5 sm:px-6">
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#f3c63d]">MC Control</p>
              <h1 className="mt-1 text-3xl font-black uppercase text-[#fff8e8] sm:text-4xl">{selectedCategory?.label ?? 'Pilih kategori'}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={isCategoryPage ? `/mc/${eventId}` : '/mc'} className="rounded-full border border-white/25 px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-white transition-colors hover:bg-white/10">{isCategoryPage ? 'Semua Kategori' : 'Ganti Event'}</Link>
              {nextCategory ? (
                <button type="button" onClick={() => router.push(`/mc/${eventId}/${nextCategory.id}`)} className="rounded-full border border-[#f3c63d] px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-[#f3c63d] transition-colors hover:bg-[#f3c63d] hover:text-[#201008]">
                  Next: {nextCategory.label}
                </button>
              ) : null}
              <button type="button" onClick={toggleHighVisibility} className="rounded-full border border-[#f3c63d] bg-[#f3c63d] px-3 py-2 text-xs font-black uppercase tracking-[0.1em] text-[#201008] transition-colors hover:bg-[#ffda5e]">
                {highVisibility ? 'Mode Besar Aktif' : 'Mode Besar'}
              </button>
            </div>
          </div>
        </section>

        {!isCategoryPage ? <section className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-[0.12em] text-slate-800">Kategori Event</h2>
            <button type="button" onClick={() => void loadCategories()} className="text-xs font-black uppercase tracking-[0.1em] text-amber-700 hover:text-amber-900">Muat Ulang</button>
          </div>
          {loadingCategories ? <div className="py-6 text-center text-sm font-bold text-slate-500">Memuat kategori...</div> : null}
          {!loadingCategories && categories.length === 0 ? <div className="py-6 text-center text-sm font-bold text-slate-500">Belum ada kategori aktif.</div> : null}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {categories.map((category) => {
              const selected = category.id === routeCategoryId
              const categoryName = category.label.toUpperCase()
              const isGirls = categoryName.includes('GIRL')
              const isBoys = categoryName.includes('BOY')
              const isMix = categoryName.includes('MIX')
              const categoryStyle = isGirls
                ? 'border-[#e78da7] bg-[#fff0f4] text-[#79233d] hover:bg-[#ffdfe8]'
                : isBoys
                  ? 'border-[#7194c9] bg-[#edf3ff] text-[#173d72] hover:bg-[#dce9ff]'
                  : isMix
                    ? 'border-[#42a49c] bg-[#e8f7f3] text-[#0d4a46] hover:bg-[#d7f0ea]'
                    : 'border-[#f2a43a] bg-[#fff6df] text-[#5b2b08] hover:bg-[#ffedbd]'
              const accentStyle = isGirls ? 'bg-[#d65b82]' : isBoys ? 'bg-[#3f6ca8]' : isMix ? 'bg-[#15857d]' : 'bg-[#e95c18]'
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => router.push(`/mc/${eventId}/${category.id}`)}
                  className={`relative min-h-20 overflow-hidden rounded-xl border px-3 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
                    selected ? 'border-[#e95c18] bg-[#e95c18] text-white shadow-sm' : categoryStyle
                  }`}
                >
                  <span className={`absolute inset-x-0 top-0 h-1 ${selected ? 'bg-[#f3c63d]' : accentStyle}`} />
                  <span className="block pr-8 text-sm font-black leading-tight">{category.label}</span>
                  <span className={`mt-2 block text-[10px] font-black uppercase tracking-[0.1em] ${selected ? 'text-white/80' : 'opacity-70'}`}>Buka tabel kategori</span>
                  <span className={`absolute bottom-3 right-3 text-lg font-black ${selected ? 'text-white/80' : 'opacity-45'}`} aria-hidden="true">→</span>
                </button>
              )
            })}
          </div>
        </section> : null}

        {selectedCategory ? (
          <section className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.14em] text-amber-700">Kategori Terpilih</p>
                <h2 className={`${highVisibility ? 'text-3xl' : 'text-2xl'} font-black text-slate-900`}>{selectedCategory.label}</h2>
              </div>
              <div className="flex items-center gap-3">
                {lastUpdated ? <span className="text-xs font-bold text-slate-500">Update {lastUpdated}</span> : null}
                <button type="button" onClick={() => void loadScore()} disabled={loadingScore} className="rounded-full border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-white transition-colors hover:bg-slate-700 disabled:opacity-60">
                  {loadingScore ? 'Memuat...' : 'Refresh'}
                </button>
              </div>
            </div>

            {loadingScore && !score ? <div className="rounded-[20px] border border-slate-200 bg-white py-12 text-center text-sm font-bold text-slate-500">Memuat tabel kategori...</div> : null}
            {!loadingScore && batches.length === 0 && stages.length === 0 ? <div className="rounded-[20px] border border-slate-200 bg-white py-12 text-center text-sm font-bold text-slate-500">Belum ada batch atau stage untuk kategori ini.</div> : null}

            {batches.map((batch) => (
              <article key={batch.batch_index} className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <h3 className={`${highVisibility ? 'text-xl' : 'text-lg'} font-black text-slate-900`}>Batch {batch.batch_index}</h3>
                    <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-amber-800">Kualifikasi</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {[batch.moto1_id, batch.moto2_id, batch.moto3_id].filter((id): id is string => Boolean(id)).map((motoId) => {
                      const moto = motoStateById.get(motoId)
                      return moto ? <span key={motoId} className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${motoStatusClass(moto.status)}`}>{moto.moto_name.replace(/\s*-\s*batch\s*\d+/i, '')}: {moto.status}</span> : null
                    })}
                    <span className="ml-1 text-xs font-black uppercase tracking-[0.1em] text-slate-500">{batch.rows.length} Rider</span>
                  </div>
                </div>
                <CompactQualificationTable batch={batch} showMoto3={showMoto3} large={highVisibility} />
              </article>
            ))}

            {stages.map((stage) => (
              <article key={stage.moto_id} className="overflow-hidden rounded-[20px] border border-[#513723] bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#513723] bg-[#29130a] px-4 py-3">
                  <h3 className={`${highVisibility ? 'text-xl' : 'text-lg'} font-black uppercase text-[#fff8e8]`}>{stage.title}</h3>
                  <div className="flex items-center gap-2">
                    {motoStateById.get(stage.moto_id) ? <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${motoStatusClass(motoStateById.get(stage.moto_id)!.status)}`}>{motoStateById.get(stage.moto_id)!.status}</span> : null}
                    <span className="text-xs font-black uppercase tracking-[0.1em] text-[#f3c63d]">Advanced Stage</span>
                  </div>
                </div>
                <CompactStageTable stage={stage} large={highVisibility} />
              </article>
            ))}
          </section>
        ) : null}

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{error}</div> : null}
      </main>
    </div>
  )
}
