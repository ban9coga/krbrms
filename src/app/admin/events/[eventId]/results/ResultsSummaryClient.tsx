'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'

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

type PenaltyRow = {
  rider_id: string
  rule_code: string | null
  penalty_point: number | null
  approval_status: string | null
  created_at: string | null
}

export default function ResultsSummaryClient({ eventId }: { eventId: string }) {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'FINISHED' | 'DNF' | 'DNS' | 'DQ'>('ALL')
  const [batchFilter, setBatchFilter] = useState<'ALL' | string>('ALL')
  const [penaltyMap, setPenaltyMap] = useState<Record<string, PenaltyRow[]>>({})

  const apiFetch = async (url: string) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
    const json = await res.json().catch(() => ({}))
    return { res, json }
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

  const loadSummary = async (categoryId: string) => {
    if (!categoryId) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const { res, json } = await apiFetch(
        `/api/public/events/${eventId}/live-score?category_id=${encodeURIComponent(categoryId)}`
      )
      if (!res.ok) {
        setErrorMsg(json?.error || 'Gagal memuat summary.')
        setBatches([])
        return
      }
      const data = json.data ?? {}
      const rawBatches = (data.batches ?? []) as Array<{ batch_index: number; rows: SummaryRow[] }>
      const next = rawBatches.map((b) => ({
        batch_index: b.batch_index,
        rows: (b.rows ?? []).map((row) => ({
          ...row,
          batch_index: b.batch_index,
        })),
      }))
      setBatches(next)
      await loadPenalties(next)
      if (batchFilter !== 'ALL') {
        const valid = next.some((b) => String(b.batch_index) === batchFilter)
        if (!valid) setBatchFilter('ALL')
      }
    } catch {
      setErrorMsg('Gagal memuat summary.')
      setBatches([])
    } finally {
      setLoading(false)
    }
  }

  const loadPenalties = async (nextBatches: Batch[]) => {
    const riderIds = Array.from(
      new Set(nextBatches.flatMap((b) => b.rows.map((r) => r.rider_id)))
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
    loadCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  useEffect(() => {
    if (selectedCategory) {
      loadSummary(selectedCategory)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory])

  const exportCsv = () => {
    const rows = batches.flatMap((batch) => batch.rows)
    const filtered = statusFilter === 'ALL' ? rows : rows.filter((r) => r.status === statusFilter)
    if (filtered.length === 0) {
      alert('Tidak ada data untuk diexport.')
      return
    }
    const header = [
      'batch',
      'rank',
      'name',
      'no_plate',
      'club',
      'gate_m1',
      'gate_m2',
      'gate_m3',
      'point_m1',
      'point_m2',
      'point_m3',
      'penalty',
      'total_point',
      'class',
      'status',
    ]
    const csv = [
      header.join(','),
      ...filtered.map((r) =>
        [
          r.batch_index,
          r.rank_point ?? '',
          `"${r.name ?? ''}"`,
          `"${r.no_plate ?? ''}"`,
          `"${r.club ?? ''}"`,
          r.gate_moto1 ?? '',
          r.gate_moto2 ?? '',
          r.gate_moto3 ?? '',
          r.point_moto1 ?? '',
          r.point_moto2 ?? '',
          r.point_moto3 ?? '',
          r.penalty_total ?? 0,
          r.total_point ?? '',
          r.class_label ?? '',
          r.status ?? '',
        ].join(',')
      ),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `results_${selectedCategory}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const exportPerBatch = () => {
    if (batches.length === 0) {
      alert('Tidak ada batch untuk diexport.')
      return
    }
    const header = [
      'batch',
      'rank',
      'name',
      'no_plate',
      'club',
      'gate_m1',
      'gate_m2',
      'gate_m3',
      'point_m1',
      'point_m2',
      'point_m3',
      'penalty',
      'total_point',
      'class',
      'status',
    ]
    batches.forEach((batch) => {
      const rows = statusFilter === 'ALL'
        ? batch.rows
        : batch.rows.filter((r) => r.status === statusFilter)
      if (rows.length === 0) return
      const csv = [
        header.join(','),
        ...rows.map((r) =>
          [
            r.batch_index,
            r.rank_point ?? '',
            `"${r.name ?? ''}"`,
            `"${r.no_plate ?? ''}"`,
            `"${r.club ?? ''}"`,
            r.gate_moto1 ?? '',
            r.gate_moto2 ?? '',
            r.gate_moto3 ?? '',
            r.point_moto1 ?? '',
            r.point_moto2 ?? '',
            r.point_moto3 ?? '',
            r.penalty_total ?? 0,
            r.total_point ?? '',
            r.class_label ?? '',
            r.status ?? '',
          ].join(',')
        ),
      ].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `results_${selectedCategory}_batch_${batch.batch_index}.csv`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  const categoryLabel = useMemo(
    () => categories.find((c) => c.id === selectedCategory)?.label ?? 'Category',
    [categories, selectedCategory]
  )

  const summary = useMemo(() => {
    const rows =
      batchFilter === 'ALL'
        ? batches.flatMap((b) => b.rows)
        : batches.find((b) => String(b.batch_index) === batchFilter)?.rows ?? []
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
  }, [batches, statusFilter])

  return (
    <div style={{ maxWidth: 1020 }}>
      <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Results Summary</h1>
      <div style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
        Ringkasan hasil per kategori + export CSV.
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }} className="no-print">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value as typeof batchFilter)}
            style={{ padding: '8px 12px', borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
          >
            <option value="ALL">All Batches</option>
            {batches.map((b) => (
              <option key={b.batch_index} value={String(b.batch_index)}>
                Batch {b.batch_index}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            style={{ padding: '8px 12px', borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
          >
            <option value="ALL">All Status</option>
            <option value="FINISHED">FINISHED</option>
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
            onClick={exportCsv}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '2px solid #111',
              background: '#2ecc71',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={exportPerBatch}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              border: '2px solid #111',
              background: '#d7ecff',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Export per Batch
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
            Print
          </button>
        </div>

        <div style={{ fontWeight: 900 }}>Kategori: {categoryLabel}</div>
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
            Avg Total Point
            <div style={{ fontSize: 18 }}>{summary.avg.toFixed(2)}</div>
          </div>
          <div style={{ padding: 10, borderRadius: 12, border: '2px solid #111', background: '#fff', fontWeight: 900 }}>
            Top 3
            <div style={{ fontSize: 12, fontWeight: 800 }}>
              {summary.top.length === 0
                ? '-'
                : summary.top.map((r, idx) => `${idx + 1}. ${r.name} (${r.total_point})`).join(' | ')}
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
        {!loading && !errorMsg && batches.length === 0 && (
          <div style={{ padding: 12, border: '2px dashed #111', borderRadius: 12, background: '#fff', fontWeight: 900 }}>
            Belum ada hasil.
          </div>
        )}

        {batches.map((batch) => {
          if (batchFilter !== 'ALL' && String(batch.batch_index) !== batchFilter) return null
          const rows = statusFilter === 'ALL'
            ? batch.rows
            : batch.rows.filter((r) => r.status === statusFilter)
          if (rows.length === 0) return null
          return (
          <div key={batch.batch_index} style={{ border: '2px solid #111', borderRadius: 14, background: '#fff' }}>
            <div style={{ padding: '10px 12px', borderBottom: '2px solid #111', fontWeight: 900 }}>
              Batch {batch.batch_index}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          )
        })}
      </div>
      <style>
        {`
          @media print {
            .no-print { display: none !important; }
            body { background: #fff !important; }
          }
        `}
      </style>
    </div>
  )
}
