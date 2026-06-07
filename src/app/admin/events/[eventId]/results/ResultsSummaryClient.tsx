'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import ResultStoryCard, {
  generateResultStoryCardPngBlob,
  getResultStoryCardFilename,
  type ResultStoryCardData,
} from '../../../../../components/ResultStoryCard'
import { supabase } from '../../../../../lib/supabaseClient'
import type { BusinessSettings } from '../../../../../lib/eventService'

type CategoryItem = {
  id: string
  label: string
  year: number
  year_min?: number
  year_max?: number
  gender: 'BOY' | 'GIRL' | 'MIX'
  enabled: boolean
}

type SummaryRow = {
  batch_index: number
  rider_id: string
  name: string
  no_plate: string
  club: string
  gate_moto1: number | null
  gate_moto2: number | null
  gate_moto3: number | null
  point_moto1: number | null
  point_moto2: number | null
  point_moto3: number | null
  penalty_total: number | null
  total_point: number | null
  rank_point: number | null
  class_label?: string | null
  status?: string | null
}

type Batch = {
  batch_index: number
  rows: SummaryRow[]
}

type StageRow = {
  rider_id: string
  gate: number | null
  name: string
  no_plate: string
  club: string | null
  point: number | null
  penalty_total: number | null
  rank: number | null
  status: 'FINISH' | 'DNF' | 'DNS' | 'DQ' | 'PENDING'
}

type StageGroup = {
  title: string
  moto_id: string
  rows: StageRow[]
}

type CategoryRecap = {
  category: CategoryItem
  stages: StageGroup[]
}

type EventMeta = {
  name: string
  location?: string | null
  event_date?: string | null
  event_logo_url?: string | null
  business_settings?: BusinessSettings | null
}

type PenaltyRow = {
  rider_id: string
  rule_code: string | null
  penalty_point: number | null
  approval_status: string | null
  created_at: string | null
}

export default function ResultsSummaryClient({ eventId }: { eventId: string }) {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [eventMeta, setEventMeta] = useState<EventMeta | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [batches, setBatches] = useState<Batch[]>([])
  const [stages, setStages] = useState<StageGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'FINISHED' | 'DNF' | 'DNS' | 'DQ'>('ALL')
  const [sectionFilter, setSectionFilter] = useState<'ALL' | string>('ALL')
  const [resultView] = useState<'QUALIFICATION' | 'STAGES'>('STAGES')
  const [recapCategories, setRecapCategories] = useState<CategoryRecap[]>([])
  const [penaltyMap, setPenaltyMap] = useState<Record<string, PenaltyRow[]>>({})
  const [storyData, setStoryData] = useState<ResultStoryCardData | null>(null)
  const [storyDownloading, setStoryDownloading] = useState(false)

  const apiFetch = async (url: string) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
    const json = await res.json().catch(() => ({}))
    return { res, json }
  }

  const loadEventMeta = async () => {
    try {
      const { res, json } = await apiFetch(`/api/events/${eventId}`)
      if (res.ok) setEventMeta((json.data ?? null) as EventMeta | null)
    } catch {}
  }

  const loadCategories = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/events/${eventId}/categories`)
      const json = await res.json()
      const list = (json.data ?? []) as CategoryItem[]
      const enabled = list.filter((c) => c.enabled)
      enabled.sort((a, b) => (b.year_max ?? b.year) - (a.year_max ?? a.year))
      setCategories(enabled)
      if (!selectedCategory && enabled.length > 0) {
        setSelectedCategory(enabled[0].id)
      }
    } catch {
      setErrorMsg('Gagal memuat kategori.')
    } finally {
      setLoading(false)
    }
  }

  const fetchSummary = async (categoryId: string) => {
    const { res, json } = await apiFetch(
      `/api/admin/events/${eventId}/final-recap?category_id=${encodeURIComponent(categoryId)}`
    )
    if (!res.ok) {
      throw new Error(json?.error || 'Gagal memuat summary.')
    }
      const data = json.data ?? {}
      const rawBatches = (data.batches ?? []) as Array<{ batch_index: number; rows: SummaryRow[] }>
      const rawStages = (data.stages ?? []) as StageGroup[]
      const next = rawBatches.map((b) => ({
        batch_index: b.batch_index,
        rows: (b.rows ?? []).map((row) => ({
          ...row,
          batch_index: b.batch_index,
        })),
      }))
      const nextStages = rawStages.map((stage) => ({
        ...stage,
        rows: [...(stage.rows ?? [])].sort((a, b) => {
          const rankDiff = (a.rank ?? 9999) - (b.rank ?? 9999)
          if (rankDiff !== 0) return rankDiff
          return (a.gate ?? 9999) - (b.gate ?? 9999)
        }),
      }))
    return { batches: next, stages: nextStages }
  }

  const loadSummary = async (categoryId: string) => {
    if (!categoryId) return
    setLoading(true)
    setErrorMsg(null)
    try {
      if (categoryId === 'ALL_CATEGORIES') {
        const groups: CategoryRecap[] = []
        for (const category of categories) {
          const summary = await fetchSummary(category.id)
          groups.push({ category, stages: summary.stages })
        }
        setBatches([])
        setStages(groups.flatMap((group) => group.stages))
        setRecapCategories(groups)
        await loadPenalties([], groups.flatMap((group) => group.stages))
        setSectionFilter('ALL')
        return
      }

      const summary = await fetchSummary(categoryId)
      const category = categories.find((item) => item.id === categoryId)
      const next = summary.batches
      const nextStages = summary.stages
      setBatches(next)
      setStages(nextStages)
      setRecapCategories(category ? [{ category, stages: nextStages }] : [])
      await loadPenalties(next, nextStages)
      if (sectionFilter !== 'ALL') {
        const valid =
          resultView === 'QUALIFICATION'
            ? next.some((b) => String(b.batch_index) === sectionFilter)
            : nextStages.some((stage) => stage.moto_id === sectionFilter)
        if (!valid) setSectionFilter('ALL')
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memuat summary.')
      setBatches([])
      setStages([])
      setRecapCategories([])
    } finally {
      setLoading(false)
    }
  }

  const loadPenalties = async (nextBatches: Batch[], nextStages: StageGroup[] = []) => {
    const riderIds = Array.from(
      new Set([
        ...nextBatches.flatMap((b) => b.rows.map((r) => r.rider_id)),
        ...nextStages.flatMap((stage) => stage.rows.map((r) => r.rider_id)),
      ])
    )
    if (riderIds.length === 0) {
      setPenaltyMap({})
      return
    }
    const { res, json } = await apiFetch(`/api/jury/events/${eventId}/rider-penalties`)
    if (!res.ok) {
      setPenaltyMap({})
      return
    }
    const items = (json?.data ?? []) as Array<{
      rider_id: string
      rule_code: string | null
      penalty_point: number | null
      created_at: string | null
      rider_penalty_approvals?: Array<{ approval_status: string | null }>
    }>
    const grouped: Record<string, PenaltyRow[]> = {}
    for (const row of items) {
      if (!riderIds.includes(row.rider_id)) continue
      if (!grouped[row.rider_id]) grouped[row.rider_id] = []
      grouped[row.rider_id].push({
        rider_id: row.rider_id,
        rule_code: row.rule_code,
        penalty_point: row.penalty_point,
        approval_status: row.rider_penalty_approvals?.[0]?.approval_status ?? null,
        created_at: row.created_at ?? null,
      })
    }
    setPenaltyMap(grouped)
  }

  useEffect(() => {
    if (!eventId) return
    loadEventMeta()
    loadCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  useEffect(() => {
    if (selectedCategory) {
      loadSummary(selectedCategory)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory])

  const sanitizeFilePart = (value: string) => value.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase()
  const sanitizeSheetName = (value: string, fallback: string) => {
    const cleaned = value.replace(/[:\\/?*[\]]/g, ' ').replace(/\s+/g, ' ').trim()
    return (cleaned || fallback).slice(0, 31)
  }
  const uniqueSheetName = (workbook: XLSX.WorkBook, value: string, fallback: string) => {
    const base = sanitizeSheetName(value, fallback).slice(0, 28)
    let name = base
    let counter = 2
    while (workbook.SheetNames.includes(name)) {
      const suffix = ` ${counter}`
      name = `${base.slice(0, 31 - suffix.length)}${suffix}`
      counter += 1
    }
    return name
  }

  const exportFinalXlsx = () => {
    const selectedGroups = recapCategories
      .map((group) => ({
        ...group,
        stages: group.stages.filter((stage) => sectionFilter === 'ALL' || stage.moto_id === sectionFilter),
      }))
      .filter((group) => group.stages.length > 0)

    if (selectedGroups.length === 0) {
      alert('Tidak ada hasil final/stage untuk diexport.')
      return
    }

    const workbook = XLSX.utils.book_new()
    let sheetCount = 0
    selectedGroups.forEach((group) => {
      group.stages.forEach((stage) => {
        const rows = statusFilter === 'ALL'
          ? stage.rows
          : stage.rows.filter((r) => (statusFilter === 'FINISHED' ? r.status === 'FINISH' : r.status === statusFilter))
        if (rows.length === 0) return

        const sheetRows = [
          ['Event', publicEventTitle],
          ['Kategori', group.category.label],
          ['Final / Stage', stage.title],
          ['Lokasi', eventMeta?.location ?? '-'],
          ['Tanggal', eventMeta?.event_date ?? '-'],
          [],
          ['Gate', 'Nama Peserta', 'No Plat', 'Komunitas', 'Point', 'Penalty', 'Rank', 'Status'],
          ...rows.map((row) => [
            row.gate ?? '',
            row.name ?? '',
            row.no_plate ?? '',
            row.club ?? '',
            row.point ?? '',
            row.penalty_total ?? 0,
            row.rank ?? '',
            row.status === 'FINISH' ? 'FINISHED' : row.status ?? '',
          ]),
        ]
        const worksheet = XLSX.utils.aoa_to_sheet(sheetRows)
        worksheet['!cols'] = [
          { wch: 8 },
          { wch: 32 },
          { wch: 12 },
          { wch: 28 },
          { wch: 10 },
          { wch: 10 },
          { wch: 8 },
          { wch: 14 },
        ]
        const sheetName = uniqueSheetName(workbook, `${group.category.label} ${stage.title}`, `Final ${sheetCount + 1}`)
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
        sheetCount += 1
      })
    })

    if (sheetCount === 0) {
      alert('Tidak ada data final/stage sesuai filter.')
      return
    }

    const fileBase = [
      sanitizeFilePart(publicBrandName || publicEventTitle || 'rekap'),
      sanitizeFilePart(categoryLabel),
      'hasil_final',
    ].filter(Boolean).join('_')
    XLSX.writeFile(workbook, `${fileBase}.xlsx`)
  }

  const downloadStoryCard = async (data: ResultStoryCardData) => {
    setStoryDownloading(true)
    try {
      const pngBlob = await generateResultStoryCardPngBlob(data)
      const pngUrl = URL.createObjectURL(pngBlob)
      const link = document.createElement('a')
      const fileBase = getResultStoryCardFilename(data)
      link.href = pngUrl
      link.download = `${fileBase}.png`
      link.click()
      URL.revokeObjectURL(pngUrl)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal download story card.')
    } finally {
      setStoryDownloading(false)
    }
  }


  const business = eventMeta?.business_settings ?? null
  const publicEventTitle = business?.public_event_title?.trim() || eventMeta?.name || 'Rekap Hasil Akhir'
  const publicBrandName = business?.public_brand_name?.trim() || ''
  const operatingCommitteeLabel = business?.operating_committee_label?.trim() || business?.operating_committee_name?.trim() || ''
  const scoringSupportLabel = business?.scoring_support_label?.trim() || business?.scoring_support_name?.trim() || ''
  const eventLogoUrl = eventMeta?.event_logo_url ?? null

  const categoryLabel = useMemo(
    () => selectedCategory === 'ALL_CATEGORIES' ? 'Semua Kategori' : categories.find((c) => c.id === selectedCategory)?.label ?? 'Category',
    [categories, selectedCategory]
  )
  const recapTypeLabel = resultView === 'QUALIFICATION' ? 'Kualifikasi / Batch' : 'Final / Stage Lanjutan'
  const sectionLabel = useMemo(() => {
    if (sectionFilter === 'ALL') return resultView === 'QUALIFICATION' ? 'Semua Batch' : 'Semua Final / Stage'
    if (selectedCategory === 'ALL_CATEGORIES') return 'Final / Stage Terpilih'
    if (resultView === 'QUALIFICATION') return `Batch ${sectionFilter}`
    return stages.find((stage) => stage.moto_id === sectionFilter)?.title ?? 'Final / Stage'
  }, [sectionFilter, resultView, selectedCategory, stages])

  const createStoryData = (row: SummaryRow): ResultStoryCardData => ({
    eventTitle: publicEventTitle,
    eventBrand: publicBrandName || publicEventTitle,
    eventDate: eventMeta?.event_date ?? null,
    eventLocation: eventMeta?.location ?? null,
    categoryLabel,
    classLabel: row.class_label ?? null,
    riderName: row.name,
    plateNumber: row.no_plate,
    rankNumber: row.rank_point ?? null,
    totalPoint: row.total_point ?? null,
    statusLabel: row.status ?? 'FINISHED',
    operatorLabel: operatingCommitteeLabel || null,
    scoringSupportLabel: scoringSupportLabel || null,
  })

  const createStageStoryData = (row: StageRow, stageTitle: string): ResultStoryCardData => ({
    eventTitle: publicEventTitle,
    eventBrand: publicBrandName || publicEventTitle,
    eventDate: eventMeta?.event_date ?? null,
    eventLocation: eventMeta?.location ?? null,
    categoryLabel,
    classLabel: stageTitle,
    riderName: row.name,
    plateNumber: row.no_plate,
    rankNumber: row.rank ?? null,
    totalPoint: row.point ?? null,
    statusLabel: row.status === 'FINISH' ? 'FINISHED' : row.status,
    operatorLabel: operatingCommitteeLabel || null,
    scoringSupportLabel: scoringSupportLabel || null,
  })

  const renderStageTable = (stage: StageGroup) => {
    const rows = statusFilter === 'ALL'
      ? stage.rows
      : stage.rows.filter((r) => (statusFilter === 'FINISHED' ? r.status === 'FINISH' : r.status === statusFilter))
    if (rows.length === 0) return null

    return (
      <div key={stage.moto_id} style={{ border: '2px solid #111', borderRadius: 14, background: '#fff' }}>
        <div style={{ padding: '10px 12px', borderBottom: '2px solid #111', fontWeight: 900 }}>
          {stage.title}
        </div>
        <div className="table-mobile-hint" style={{ margin: '8px 12px 0 12px' }}>
          Geser kiri/kanan untuk lihat semua kolom.
        </div>
        <div className="table-scroll-x" style={{ overscrollBehaviorX: 'contain', WebkitOverflowScrolling: 'touch' }}>
          <table className="table-striped" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                {['Rank', 'Gate', 'Nama', 'No Plat', 'Komunitas', 'Point', 'Penalty', 'Status', 'Story'].map((h) => (
                  <th key={h} style={{ padding: 8, borderBottom: '2px solid #111', fontWeight: 900 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${stage.moto_id}-${row.rider_id}`} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: 8 }}>{row.rank ?? '-'}</td>
                  <td style={{ padding: 8 }}>{row.gate ?? '-'}</td>
                  <td style={{ padding: 8, fontWeight: 800 }}>{row.name}</td>
                  <td style={{ padding: 8 }}>{row.no_plate}</td>
                  <td style={{ padding: 8 }}>{row.club ?? '-'}</td>
                  <td style={{ padding: 8, fontWeight: 900 }}>{row.point ?? '-'}</td>
                  <td style={{ padding: 8 }}>
                    {row.penalty_total ?? '-'}
                    {penaltyMap[row.rider_id]?.length ? (
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 800 }}>Detail</summary>
                        <div style={{ display: 'grid', gap: 4, paddingTop: 4 }}>
                          {penaltyMap[row.rider_id].map((p, idx) => (
                            <div key={`${row.rider_id}-${idx}`} style={{ fontSize: 12 }}>
                              {p.rule_code ?? 'RULE'} | {p.penalty_point ?? 0} | {p.approval_status ?? '-'}
                            </div>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </td>
                  <td style={{ padding: 8 }}>{row.status === 'FINISH' ? 'FINISHED' : row.status}</td>
                  <td style={{ padding: 8 }}>
                    <button
                      type="button"
                      onClick={() => setStoryData(createStageStoryData(row, stage.title))}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 10,
                        border: '2px solid #111',
                        background: '#fbbf24',
                        color: '#111',
                        fontWeight: 900,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Preview
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const summary = useMemo(() => {
    if (resultView === 'STAGES') {
      const rows =
        sectionFilter === 'ALL'
          ? recapCategories.flatMap((group) => group.stages.flatMap((stage) => stage.rows))
          : recapCategories.flatMap((group) =>
              group.stages.filter((stage) => stage.moto_id === sectionFilter).flatMap((stage) => stage.rows)
            )
      const filtered = statusFilter === 'ALL'
        ? rows
        : rows.filter((r) => (statusFilter === 'FINISHED' ? r.status === 'FINISH' : r.status === statusFilter))
      if (filtered.length === 0) return { total: 0, avg: 0, top: [] as StageRow[] }
      const validPoints = filtered.map((r) => r.point).filter((v) => v != null) as number[]
      const avg = validPoints.length ? validPoints.reduce((a, b) => a + b, 0) / validPoints.length : 0
      const top = [...filtered]
        .filter((r) => r.rank != null)
        .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
        .slice(0, 3)
      return { total: filtered.length, avg, top }
    }

    const rows =
      sectionFilter === 'ALL'
        ? batches.flatMap((b) => b.rows)
        : batches.find((b) => String(b.batch_index) === sectionFilter)?.rows ?? []
    const filtered = statusFilter === 'ALL' ? rows : rows.filter((r) => r.status === statusFilter)
    if (filtered.length === 0) {
      return {
        total: 0,
        avg: 0,
        top: [] as SummaryRow[],
      }
    }
    const total = filtered.length
    const validPoints = filtered.map((r) => r.total_point).filter((v) => v != null) as number[]
    const avg = validPoints.length
      ? validPoints.reduce((a, b) => a + b, 0) / validPoints.length
      : 0
    const top = [...filtered]
      .filter((r) => r.total_point != null)
      .sort((a, b) => (a.total_point ?? 9999) - (b.total_point ?? 9999))
      .slice(0, 3)
    return { total, avg, top }
  }, [sectionFilter, batches, recapCategories, resultView, statusFilter])

  return (
    <div style={{ maxWidth: 1020 }}>
      <div
        className="results-print-header"
        style={{
          display: 'grid',
          gridTemplateColumns: eventLogoUrl ? '96px 1fr' : '1fr',
          gap: 16,
          alignItems: 'center',
          padding: 16,
          borderRadius: 18,
          border: '2px solid #111',
          background: '#fff',
        }}
      >
        {eventLogoUrl && (
          <div
            style={{
              position: 'relative',
              width: 96,
              height: 96,
              borderRadius: 14,
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              overflow: 'hidden',
            }}
          >
            <Image src={eventLogoUrl} alt="Logo acara" fill sizes="96px" style={{ objectFit: 'contain' }} />
          </div>
        )}
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: '0.12em', color: '#475569', textTransform: 'uppercase' }}>
            Rekap Hasil Akhir
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>{publicEventTitle}</h1>
          {publicBrandName && <div style={{ fontWeight: 900 }}>{publicBrandName}</div>}
          <div style={{ color: '#334155', fontWeight: 800 }}>
            {eventMeta?.location ?? '-'}
            {eventMeta?.event_date ? ` | ${eventMeta.event_date}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12, fontWeight: 900 }}>
            <span>Kategori: {categoryLabel}</span>
            <span>Tipe Rekap: {recapTypeLabel}</span>
            <span>Filter: {sectionLabel}</span>
            <span>Status: {statusFilter === 'ALL' ? 'Semua Status' : statusFilter === 'FINISHED' ? 'FINISH' : statusFilter}</span>
          </div>
        </div>
      </div>
      {(operatingCommitteeLabel || scoringSupportLabel) && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {operatingCommitteeLabel && <span style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 800, fontSize: 12 }}>Operating Committee: {operatingCommitteeLabel}</span>}
          {scoringSupportLabel && <span style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 800, fontSize: 12 }}>Scoring Support: {scoringSupportLabel}</span>}
        </div>
      )}

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }} className="no-print">
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value)
              setSectionFilter('ALL')
            }}
            style={{ padding: '8px 12px', borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
          >
            <option value="ALL_CATEGORIES">Semua Kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value as typeof sectionFilter)}
            style={{ padding: '8px 12px', borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
          >
            <option value="ALL">Semua Final / Stage</option>
            {selectedCategory !== 'ALL_CATEGORIES' &&
              stages.map((stage) => (
                <option key={stage.moto_id} value={stage.moto_id}>
                  {stage.title}
                </option>
              ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            style={{ padding: '8px 12px', borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
          >
            <option value="ALL">Semua Status</option>
            <option value="FINISHED">FINISH</option>
            <option value="DNF">DNF</option>
            <option value="DNS">DNS</option>
            <option value="DQ">DQ</option>
          </select>
          <button
            type="button"
            onClick={() => loadSummary(selectedCategory)}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '2px solid #111',
              background: '#bfead2',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={exportFinalXlsx}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '2px solid #111',
              background: '#2ecc71',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Save as Excel
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '2px solid #111',
              background: '#fff',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Cetak PDF
          </button>
        </div>

        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ fontWeight: 900 }}>Kategori: {categoryLabel}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>
            Cetak PDF akan memakai logo, identitas event, dan metadata operator/scoring ini.
          </div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10,
          }}
        >
          <div style={{ padding: 10, borderRadius: 12, border: '2px solid #111', background: '#fff', fontWeight: 900 }}>
            Total Rider
            <div style={{ fontSize: 18 }}>{summary.total}</div>
          </div>
          <div style={{ padding: 10, borderRadius: 12, border: '2px solid #111', background: '#fff', fontWeight: 900 }}>
            Rata-rata Point
            <div style={{ fontSize: 18 }}>{summary.avg.toFixed(2)}</div>
          </div>
          <div style={{ padding: 10, borderRadius: 12, border: '2px solid #111', background: '#fff', fontWeight: 900 }}>
            Top 3
            <div style={{ fontSize: 12, fontWeight: 800 }}>
              {summary.top.length === 0
                ? '-'
                : summary.top
                    .map((r, idx) => {
                      const point = 'total_point' in r ? r.total_point : r.point
                      return `${idx + 1}. ${r.name} (${point ?? '-'})`
                    })
                    .join(' | ')}
            </div>
          </div>
        </div>

        {loading && (
          <div style={{ padding: 12, border: '2px dashed #111', borderRadius: 12, background: '#fff', fontWeight: 900 }}>
            Loading...
          </div>
        )}
        {!loading && errorMsg && (
          <div style={{ padding: 12, border: '2px solid #b40000', borderRadius: 12, background: '#ffd6d6', fontWeight: 900 }}>
            {errorMsg}
          </div>
        )}
        {!loading && !errorMsg && resultView === 'QUALIFICATION' && batches.length === 0 && (
          <div style={{ padding: 12, border: '2px dashed #111', borderRadius: 12, background: '#fff', fontWeight: 900 }}>
            Belum ada hasil.
          </div>
        )}
        {!loading && !errorMsg && resultView === 'STAGES' && recapCategories.every((group) => group.stages.length === 0) && (
          <div style={{ padding: 12, border: '2px dashed #111', borderRadius: 12, background: '#fff', fontWeight: 900 }}>
            Belum ada final / advanced stage.
          </div>
        )}

        {resultView === 'STAGES' && recapCategories.map((group) => {
          const visibleStages = group.stages.filter((stage) => sectionFilter === 'ALL' || stage.moto_id === sectionFilter)
          if (visibleStages.length === 0) return null
          return (
            <div key={group.category.id} style={{ display: 'grid', gap: 12 }}>
              <div style={{ padding: '10px 12px', border: '2px solid #111', borderRadius: 14, background: '#eef7ff', fontWeight: 950 }}>
                Kategori: {group.category.label}
              </div>
              {visibleStages.map((stage) => renderStageTable(stage))}
            </div>
          )
        })}

        {resultView === 'QUALIFICATION' && batches.map((batch) => {
          if (sectionFilter !== 'ALL' && String(batch.batch_index) !== sectionFilter) return null
          const rows = statusFilter === 'ALL'
            ? batch.rows
            : batch.rows.filter((r) => r.status === statusFilter)
          if (rows.length === 0) return null
          return (
          <div key={batch.batch_index} style={{ border: '2px solid #111', borderRadius: 14, background: '#fff' }}>
            <div style={{ padding: '10px 12px', borderBottom: '2px solid #111', fontWeight: 900 }}>
              Batch {batch.batch_index}
            </div>
            <div className="table-mobile-hint" style={{ margin: '8px 12px 0 12px' }}>
              Geser kiri/kanan untuk lihat semua kolom.
            </div>
            <div
              className="table-scroll-x"
              style={{
                overscrollBehaviorX: 'contain',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <table className="table-striped" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                    {[
                      'Rank',
                      'Nama',
                      'No Plat',
                      'Gate M1',
                      'Gate M2',
                      'Gate M3',
                      'Point M1',
                      'Point M2',
                      'Point M3',
                      'Penalty',
                      'Total',
                      'Class',
                      'Status',
                      'Story',
                    ].map((h) => (
                      <th key={h} style={{ padding: 8, borderBottom: '2px solid #111', fontWeight: 900 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${batch.batch_index}-${row.rider_id}`} style={{ borderBottom: '1px solid #ddd' }}>
                      <td style={{ padding: 8 }}>{row.rank_point ?? '-'}</td>
                      <td style={{ padding: 8, fontWeight: 800 }}>{row.name}</td>
                      <td style={{ padding: 8 }}>{row.no_plate}</td>
                      <td style={{ padding: 8 }}>{row.gate_moto1 ?? '-'}</td>
                      <td style={{ padding: 8 }}>{row.gate_moto2 ?? '-'}</td>
                      <td style={{ padding: 8 }}>{row.gate_moto3 ?? '-'}</td>
                      <td style={{ padding: 8 }}>{row.point_moto1 ?? '-'}</td>
                      <td style={{ padding: 8 }}>{row.point_moto2 ?? '-'}</td>
                      <td style={{ padding: 8 }}>{row.point_moto3 ?? '-'}</td>
                      <td style={{ padding: 8 }}>
                        {row.penalty_total ?? '-'}
                        {penaltyMap[row.rider_id]?.length ? (
                          <details style={{ marginTop: 4 }}>
                            <summary style={{ cursor: 'pointer', fontWeight: 800 }}>Detail</summary>
                            <div style={{ display: 'grid', gap: 4, paddingTop: 4 }}>
                              {penaltyMap[row.rider_id].map((p, idx) => (
                                <div key={`${row.rider_id}-${idx}`} style={{ fontSize: 12 }}>
                                  {p.rule_code ?? 'RULE'} · {p.penalty_point ?? 0} · {p.approval_status ?? '-'}
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : null}
                      </td>
                      <td style={{ padding: 8, fontWeight: 900 }}>{row.total_point ?? '-'}</td>
                      <td style={{ padding: 8 }}>{row.class_label ?? '-'}</td>
                      <td style={{ padding: 8 }}>{row.status ?? '-'}</td>
                      <td style={{ padding: 8 }}>
                        <button
                          type="button"
                          onClick={() => setStoryData(createStoryData(row))}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 10,
                            border: '2px solid #111',
                            background: '#fbbf24',
                            color: '#111',
                            fontWeight: 900,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Preview
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )
        })}
      </div>
      {storyData && (
        <div
          className="no-print"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(15,23,42,0.74)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
          }}
          onClick={() => setStoryData(null)}
        >
          <div
            style={{
              width: 'min(100%, 920px)',
              maxHeight: 'calc(100vh - 40px)',
              overflow: 'auto',
              background: '#fff',
              borderRadius: 24,
              padding: 20,
              display: 'grid',
              gap: 18,
              boxShadow: '0 24px 80px rgba(15,23,42,0.32)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 22, fontWeight: 950 }}>Story Card Preview</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>
                  Cocok untuk download lalu share ke WhatsApp Story atau Instagram Story.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStoryData(null)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  border: '2px solid #111',
                  background: '#fff',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>

            <div className="story-preview-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 360px) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
              <ResultStoryCard data={storyData} />
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ padding: 14, borderRadius: 16, border: '2px solid #111', background: '#f8fafc' }}>
                  <div style={{ fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#475569' }}>
                    Story Info
                  </div>
                  <div style={{ marginTop: 10, display: 'grid', gap: 6, fontWeight: 800 }}>
                    <div>Rider: {storyData.riderName}</div>
                    <div>Category: {storyData.categoryLabel}</div>
                    <div>Class: {storyData.classLabel || '-'}</div>
                    <div>Rank: {storyData.rankNumber != null ? `#${storyData.rankNumber}` : '-'}</div>
                    <div>Total Point: {storyData.totalPoint ?? '-'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => downloadStoryCard(storyData)}
                    disabled={storyDownloading}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 12,
                      border: '2px solid #111',
                      background: '#fbbf24',
                      color: '#111',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    {storyDownloading ? 'Generating PNG...' : 'Download PNG'}
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Direct share sedang disiapkan"
                    style={{
                      padding: '12px 16px',
                      borderRadius: 12,
                      border: '2px solid #cbd5e1',
                      background: '#f8fafc',
                      color: '#64748b',
                      fontWeight: 900,
                      cursor: 'not-allowed',
                      opacity: 0.75,
                    }}
                  >
                    Share Soon
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <style>
        {`
          .results-print-header {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          @media print {
            .no-print { display: none !important; }
            .results-print-header {
              margin-bottom: 14px !important;
              border-color: #111 !important;
            }
            html, body {
              background:
                radial-gradient(circle at top left, rgba(251, 191, 36, 0.18), transparent 28%),
                radial-gradient(circle at top right, rgba(16, 185, 129, 0.16), transparent 26%),
                #ffffff !important;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .admin-surface,
            .table-striped,
            .table-striped th,
            .table-striped td {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .admin-surface {
              box-shadow: none !important;
            }
            @page { margin: 14mm; }
          }
          @media (max-width: 860px) {
            .story-preview-grid {
              grid-template-columns: 1fr;
            }
          }
        `}
      </style>
    </div>
  )
}
