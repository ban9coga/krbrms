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

export default function ResultsSummaryClient({ eventId }: { eventId: string }) {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [batches, setBatches] = useState<Batch[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

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
    } catch {
      setErrorMsg('Gagal memuat summary.')
      setBatches([])
    } finally {
      setLoading(false)
    }
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
    if (rows.length === 0) {
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
    a.download = `results_${selectedCategory}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const categoryLabel = useMemo(
    () => categories.find((c) => c.id === selectedCategory)?.label ?? 'Category',
    [categories, selectedCategory]
  )

  return (
    <div style={{ maxWidth: 1020 }}>
      <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Results Summary</h1>
      <div style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
        Ringkasan hasil per kategori + export CSV.
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
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
        </div>

        <div style={{ fontWeight: 900 }}>Kategori: {categoryLabel}</div>

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

        {batches.map((batch) => (
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
                  {batch.rows.map((row) => (
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
                      <td style={{ padding: 8 }}>{row.penalty_total ?? '-'}</td>
                      <td style={{ padding: 8, fontWeight: 900 }}>{row.total_point ?? '-'}</td>
                      <td style={{ padding: 8 }}>{row.class_label ?? '-'}</td>
                      <td style={{ padding: 8 }}>{row.status ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
