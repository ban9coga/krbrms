'use client'

import { useEffect, useMemo, useState } from 'react'
import { compareMotoSequence } from '../../../../../lib/motoSequence'
import { buildBrandedPrintHtml } from '../../../../../lib/printTheme'
import { supabase } from '../../../../../lib/supabaseClient'

type CategoryItem = {
  id: string
  year_min?: number | null
  year_max?: number | null
  gender: 'BOY' | 'GIRL' | 'MIX'
  label: string
  enabled: boolean
}

type AdvancedConfigItem = {
  category_id: string
  enabled: boolean
}

type AdvancedSummaryItem = {
  stageCounts: Record<string, number>
  motoCounts: { quarter: number; repechage: number; semi: number; final: number }
  readiness: {
    totalRiders: number
    requiresQualification: boolean
    qualificationTotalBatches: number
    qualificationCompleteBatches: number
    qualificationReady: boolean
    qualificationRun: boolean
    quarterReady: boolean
    repechageReady: boolean
    semiReady: boolean
    canRunQualification: boolean
    canComputeAdvances: boolean
    allQualificationLocked: boolean
    allCategoryMotosLocked: boolean
  }
}

type MotoItem = {
  id: string
  category_id: string
  moto_name: string
  moto_order: number
  status: 'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED'
  is_published?: boolean | null
  published_at?: string | null
  provisional_at?: string | null
}

type GateMotoItem = {
  id: string
  moto_name: string
  moto_order: number
  status: MotoItem['status']
  gates: Array<{
    gate_position: number
    rider_id: string
    name: string
    no_plate_display: string
    club?: string | null
  }>
}

const getAllowedMotoStatuses = (current: MotoItem['status']) => {
  switch (current) {
    case 'UPCOMING':
      return ['UPCOMING', 'LIVE'] as MotoItem['status'][]
    case 'LIVE':
      return ['UPCOMING', 'LIVE', 'PROVISIONAL'] as MotoItem['status'][]
    case 'PROVISIONAL':
      return ['UPCOMING', 'PROVISIONAL'] as MotoItem['status'][]
    case 'PROTEST_REVIEW':
      return ['PROTEST_REVIEW'] as MotoItem['status'][]
    case 'LOCKED':
      return ['LOCKED'] as MotoItem['status'][]
    case 'FINISHED':
      return ['FINISHED'] as MotoItem['status'][]
    default:
      return [current]
  }
}

const parseMotoBatch = (motoName: string) => {
  const match = motoName.match(/moto\s*(\d+)\s*-\s*batch\s*(\d+)/i)
  if (!match) return { motoNo: 0, batchNo: 0 }
  return {
    motoNo: Number(match[1] ?? 0),
    batchNo: Number(match[2] ?? 0),
  }
}

export default function MotosClient({ eventId }: { eventId: string }) {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [motos, setMotos] = useState<MotoItem[]>([])
  const [gateOrdersByCategory, setGateOrdersByCategory] = useState<Record<string, GateMotoItem[]>>({})
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<string[]>([])
  const [showMotoRiderList, setShowMotoRiderList] = useState(false)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [eventStatus, setEventStatus] = useState<'UPCOMING' | 'LIVE' | 'FINISHED' | 'PROVISIONAL' | 'PROTEST_REVIEW' | 'LOCKED' | null>(null)
  const [eventName, setEventName] = useState('Event')
  const [advancedEnabledByCategory, setAdvancedEnabledByCategory] = useState<Record<string, boolean>>({})
  const [advancedSummaryByCategory, setAdvancedSummaryByCategory] = useState<Record<string, AdvancedSummaryItem>>({})
  const [computingCategoryId, setComputingCategoryId] = useState<string | null>(null)

  const getErrorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Request failed')

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(url, { cache: 'no-store', ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Request failed')
    return json
  }

  const loadGateOrders = async (categoryIds: string[]) => {
    if (categoryIds.length === 0) {
      setGateOrdersByCategory({})
      return
    }
    const entries = await Promise.all(
      categoryIds.map(async (categoryId) => {
        const res = await fetch(`/api/events/${eventId}/gate-order?categoryId=${categoryId}`, { cache: 'no-store' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return [categoryId, []] as const
        return [categoryId, (json?.data ?? []) as GateMotoItem[]] as const
      })
    )
    const map: Record<string, GateMotoItem[]> = {}
    for (const [categoryId, rows] of entries) {
      map[categoryId] = [...rows].sort(compareMotoSequence)
    }
    setGateOrdersByCategory(map)
  }

  const load = async (mode: 'initial' | 'refresh' = 'initial') => {
    if (!eventId) return
    if (mode === 'initial' && !hasLoadedOnce) setLoading(true)
    else setRefreshing(true)
    try {
      const nonce = Date.now()
      const catRes = await fetch(`/api/events/${eventId}/categories?_=${nonce}`, { cache: 'no-store' })
      const catJson = await catRes.json()
      const enabledCategories = (catJson.data ?? []).filter((c: CategoryItem) => c.enabled)
      setCategories(enabledCategories)

      const eventJson = await apiFetch(`/api/events/${eventId}`)
      setEventStatus(eventJson?.data?.status ?? null)
      setEventName(eventJson?.data?.name ?? 'Event')

      const [advancedJson, advancedSummaryJson] = await Promise.all([
        apiFetch(`/api/events/${eventId}/advanced-race`),
        apiFetch(`/api/events/${eventId}/advanced-race/summary`),
      ])
      const enabledMap: Record<string, boolean> = {}
      for (const row of (advancedJson?.data?.configs ?? []) as AdvancedConfigItem[]) {
        enabledMap[row.category_id] = Boolean(row.enabled)
      }
      setAdvancedEnabledByCategory(enabledMap)
      setAdvancedSummaryByCategory((advancedSummaryJson?.data ?? {}) as Record<string, AdvancedSummaryItem>)

      const motoRes = await fetch(`/api/motos?event_id=${eventId}&_=${nonce}`, { cache: 'no-store' })
      const motoJson = await motoRes.json()
      const motoRows = (motoJson.data ?? []) as MotoItem[]
      setMotos(motoRows)
      const categoryIds = Array.from(new Set(motoRows.map((m) => m.category_id))).filter(Boolean)
      setHiddenCategoryIds([])
      await loadGateOrders(categoryIds)
    } finally {
      setLoading(false)
      setRefreshing(false)
      setHasLoadedOnce(true)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  useEffect(() => {
    if (!eventId) return
    const interval = window.setInterval(() => {
      void load('refresh')
    }, 5000)
    return () => window.clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const categoryLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of categories) {
      map.set(c.id, c.label)
    }
    return map
  }, [categories])

  const categoriesSorted = useMemo(() => {
    return [...categories].sort((a, b) => {
      const ayMax = typeof a.year_max === 'number' ? a.year_max : typeof a.year_min === 'number' ? a.year_min : 0
      const byMax = typeof b.year_max === 'number' ? b.year_max : typeof b.year_min === 'number' ? b.year_min : 0
      if (byMax !== ayMax) return byMax - ayMax
      const ayMin = typeof a.year_min === 'number' ? a.year_min : ayMax
      const byMin = typeof b.year_min === 'number' ? b.year_min : byMax
      if (byMin !== ayMin) return byMin - ayMin
      const order = { BOY: 0, GIRL: 1, MIX: 2 } as const
      const ag = order[a.gender] ?? 9
      const bg = order[b.gender] ?? 9
      return ag - bg
    })
  }, [categories])

  const motosByCategory = useMemo(() => {
    const grouped = new Map<string, MotoItem[]>()
    for (const moto of motos) {
      const list = grouped.get(moto.category_id) ?? []
      list.push(moto)
      grouped.set(moto.category_id, list)
    }
    for (const list of grouped.values()) {
      list.sort(compareMotoSequence)
    }
    return grouped
  }, [motos])

  const printGroups = useMemo(() => {
    return categoriesSorted
      .map((category) => {
        const rows = gateOrdersByCategory[category.id] ?? []
        if (rows.length === 0) return null

        const batchMap = new Map<number, GateMotoItem[]>()
        for (const row of rows) {
          const { batchNo } = parseMotoBatch(row.moto_name)
          const key = batchNo > 0 ? batchNo : 1
          const list = batchMap.get(key) ?? []
          list.push(row)
          batchMap.set(key, list)
        }

        const batches = Array.from(batchMap.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([batchNo, batchRows]) => ({
            batchNo,
            motos: batchRows.sort((a, b) => {
              const pa = parseMotoBatch(a.moto_name)
              const pb = parseMotoBatch(b.moto_name)
              if (pa.motoNo !== pb.motoNo) return pa.motoNo - pb.motoNo
              return compareMotoSequence(a, b)
            }),
          }))
          .map((batch) => {
            const motoColumns = batch.motos.map((moto, idx) => {
              const parsed = parseMotoBatch(moto.moto_name)
              const motoNo = parsed.motoNo > 0 ? parsed.motoNo : idx + 1
              return {
                key: motoNo,
                label: `M${motoNo}`,
                moto_name: moto.moto_name,
                status: moto.status,
              }
            })

            const rowMap = new Map<
              string,
              {
                rider_id: string
                name: string
                no_plate_display: string
                club: string | null
                gates: Record<number, number>
              }
            >()

            for (let i = 0; i < batch.motos.length; i += 1) {
              const moto = batch.motos[i]
              const col = motoColumns[i]
              for (const gate of moto.gates) {
                const existing = rowMap.get(gate.rider_id)
                if (existing) {
                  existing.gates[col.key] = gate.gate_position
                } else {
                  rowMap.set(gate.rider_id, {
                    rider_id: gate.rider_id,
                    name: gate.name,
                    no_plate_display: gate.no_plate_display,
                    club: gate.club ?? null,
                    gates: { [col.key]: gate.gate_position },
                  })
                }
              }
            }

            const firstCol = motoColumns[0]?.key
            const riderRows = Array.from(rowMap.values()).sort((a, b) => {
              const ga = firstCol ? (a.gates[firstCol] ?? 999) : 999
              const gb = firstCol ? (b.gates[firstCol] ?? 999) : 999
              if (ga !== gb) return ga - gb
              return a.name.localeCompare(b.name)
            })

            return {
              batchNo: batch.batchNo,
              motoColumns,
              riderRows,
            }
          })

        return {
          categoryId: category.id,
          categoryLabel: category.label,
          batches,
        }
      })
      .filter(Boolean) as Array<{
      categoryId: string
      categoryLabel: string
      batches: Array<{
        batchNo: number
        motoColumns: Array<{ key: number; label: string; moto_name: string; status: MotoItem['status'] }>
        riderRows: Array<{ rider_id: string; name: string; no_plate_display: string; club: string | null; gates: Record<number, number> }>
      }>
    }>
  }, [categoriesSorted, gateOrdersByCategory])

  const handleUpdateMotoStatus = async (motoId: string, status: MotoItem['status']) => {
    try {
      const moto = motos.find((item) => item.id === motoId)
      if (!moto || moto.status === status) return

      if (status === 'LOCKED') {
        await apiFetch(`/api/motos/${motoId}/status`, {
          method: 'POST',
          body: JSON.stringify({ status }),
        })
      } else {
        await apiFetch(`/api/motos/${motoId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        })
      }
      await load()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    }
  }

  const handleOpenReview = async (motoId: string) => {
    try {
      await apiFetch(`/api/jury/motos/${motoId}/open-review`, { method: 'POST' })
      await load()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    }
  }

  const handleLockMoto = async (motoId: string) => {
    try {
      await apiFetch(`/api/motos/${motoId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'LOCKED' }),
      })
      await load()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    }
  }

  const handleUnlockMoto = async (motoId: string) => {
    const moto = motos.find((m) => m.id === motoId)
    if (!moto) return

    const ok = confirm(`Unlock moto: ${moto.moto_name}? Moto akan kembali ke status PROVISIONAL.`)
    if (!ok) return

    try {
      await apiFetch(`/api/motos/${motoId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'PROVISIONAL' }),
      })
      await load()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    }
  }

  const handleResetResults = async (motoId: string) => {
    const moto = motos.find((m) => m.id === motoId)
    if (!moto) return

    const currentStatus = String(moto.status ?? '').toUpperCase()
    if (currentStatus === 'LOCKED') {
      alert('Moto masih LOCKED. Unlock dulu sebelum reset results.')
      return
    }
    if (currentStatus === 'PROTEST_REVIEW') {
      alert('Moto sedang PROTEST_REVIEW. Selesaikan review dulu sebelum reset.')
      return
    }

    const ok = confirm(`Reset results untuk moto: ${moto.moto_name}?`)
    if (!ok) return

    const reason = window.prompt('Alasan reset results moto ini', 'Perbaikan hasil input')
    if (reason === null) return

    try {
      await apiFetch(`/api/race-director/motos/${motoId}/reset-results`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() || 'Reset moto results' }),
      })
      alert('Results berhasil direset!')
      await load()
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    }
  }

  const toggleCategoryCard = (categoryId: string) => {
    setHiddenCategoryIds((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId]
    )
  }

  const getComputeAction = (categoryId: string) => {
    const summary = advancedSummaryByCategory[categoryId]
    const readiness = summary?.readiness
    const advancedEnabled = advancedEnabledByCategory[categoryId] ?? false

    if (!advancedEnabled) {
      return {
        visible: false,
        label: '',
        description: 'Advanced Stage belum aktif untuk kategori ini.',
        endpoint: null as null | 'compute' | 'advance',
        disabled: true,
      }
    }

    if (!readiness) {
      return {
        visible: true,
        label: 'Memuat Status Compute...',
        description: 'Mengambil readiness kategori ini.',
        endpoint: null as null | 'compute' | 'advance',
        disabled: true,
      }
    }

    if (!readiness.requiresQualification) {
      return {
        visible: true,
        label: '1 Batch - Tanpa Compute',
        description: `Kategori ini ${readiness.totalRiders} rider / 1 batch, jadi stage compute tidak diperlukan.`,
        endpoint: null as null | 'compute' | 'advance',
        disabled: true,
      }
    }

    if (!readiness.qualificationRun) {
      return {
        visible: true,
        label: 'Run Qualification',
        description: readiness.qualificationReady
          ? 'Hitung hasil qualification dan bentuk stage awal kategori ini.'
          : `Lengkapi Moto 1 dan Moto 2 semua batch dulu (${readiness.qualificationCompleteBatches}/${readiness.qualificationTotalBatches} batch complete).`,
        endpoint: 'compute' as const,
        disabled: !readiness.canRunQualification,
      }
    }

    if (summary?.motoCounts?.repechage > 0 && !readiness.repechageReady) {
      return {
        visible: true,
        label: 'Tunggu Repechage Selesai',
        description: 'Selesaikan semua heat repechage dulu, lalu compute lagi untuk lanjut ke stage berikutnya.',
        endpoint: null as null | 'compute' | 'advance',
        disabled: true,
      }
    }

    if (summary?.motoCounts?.quarter > 0 && !readiness.quarterReady) {
      return {
        visible: true,
        label: 'Tunggu Quarter Final Selesai',
        description: 'Semua heat Quarter Final harus selesai dulu sebelum final bisa dibentuk.',
        endpoint: null as null | 'compute' | 'advance',
        disabled: true,
      }
    }

    if (summary?.motoCounts?.semi > 0 && !readiness.semiReady) {
      return {
        visible: true,
        label: 'Tunggu Semi Final Selesai',
        description: 'Selesaikan Semi Final dulu sebelum compute final.',
        endpoint: null as null | 'compute' | 'advance',
        disabled: true,
      }
    }

    if (readiness.canComputeAdvances) {
      if ((summary?.motoCounts?.repechage ?? 0) > 0 && readiness.repechageReady && !readiness.quarterReady) {
        return {
          visible: true,
          label: 'Compute Repechage -> Quarter Final',
          description: 'Masukkan winner repechage ke Quarter Final dan sinkronkan stage berikutnya.',
          endpoint: 'advance' as const,
          disabled: false,
        }
      }
      if ((summary?.motoCounts?.quarter ?? 0) > 0 && readiness.quarterReady) {
        return {
          visible: true,
          label: 'Compute Quarter Final -> Final',
          description: 'Bentuk final classes dari hasil Quarter Final kategori ini.',
          endpoint: 'advance' as const,
          disabled: false,
        }
      }
      if ((summary?.motoCounts?.semi ?? 0) > 0 && readiness.semiReady) {
        return {
          visible: true,
          label: 'Compute Semi Final -> Final',
          description: 'Bentuk final dari hasil Semi Final kategori ini.',
          endpoint: 'advance' as const,
          disabled: false,
        }
      }
      return {
        visible: true,
        label: 'Compute Stage Berikutnya',
        description: 'Sinkronkan progression stage kategori ini berdasarkan hasil terbaru.',
        endpoint: 'advance' as const,
        disabled: false,
      }
    }

    return {
      visible: true,
      label: 'Belum Siap Compute',
      description: 'Belum ada source stage yang lengkap untuk dihitung lanjut.',
      endpoint: null as null | 'compute' | 'advance',
      disabled: true,
    }
  }

  const handleComputeCategory = async (categoryId: string, endpoint: 'compute' | 'advance') => {
    try {
      setComputingCategoryId(categoryId)
      const res = await apiFetch(`/api/events/${eventId}/advanced-race/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify({ category_id: categoryId }),
      })
      if (res?.warning) {
        alert(res.warning)
      } else {
        alert(endpoint === 'compute' ? 'Qualification berhasil dihitung.' : 'Stage berikutnya berhasil dihitung.')
      }
      await load('refresh')
    } catch (err: unknown) {
      alert(getErrorMessage(err))
    } finally {
      setComputingCategoryId(null)
    }
  }

  const handlePrintMotoRiders = () => {
    if (printGroups.length === 0) {
      alert('Belum ada data rider per moto yang bisa dicetak.')
      return
    }

    const sections = printGroups
      .map((group) => {
        const batchesHtml = group.batches
          .map((batch) => {
            const headers = batch.motoColumns
              .map((col) => `<th>Gate ${col.label}</th>`)
              .join('')
            const motoMeta = batch.motoColumns
              .map((col) => `${col.label}: ${col.moto_name} (${col.status})`)
              .join(' | ')
            const rows = batch.riderRows.length
              ? batch.riderRows
                  .map((row) => {
                    const gates = batch.motoColumns
                      .map((col) => `<td>${row.gates[col.key] ?? '-'}</td>`)
                      .join('')
                    return `
                      <tr>
                        ${gates}
                        <td>${row.no_plate_display}</td>
                        <td>${row.name}</td>
                        <td>${row.club ?? '-'}</td>
                      </tr>
                    `
                  })
                  .join('')
              : `
                <tr>
                  <td colspan="${batch.motoColumns.length + 3}">Belum ada rider pada batch ini.</td>
                </tr>
              `

            return `
              <section class="section-card" style="margin-top: 12px;">
                <div class="section-title">Batch ${batch.batchNo}</div>
                <div class="meta-row">
                  ${motoMeta
                    .split(' | ')
                    .map((item) => `<span class="meta-pill">${item}</span>`)
                    .join('')}
                </div>
                <table>
                  <thead>
                    <tr>
                      ${headers}
                      <th>No Plate</th>
                      <th>Nama Rider</th>
                      <th>Komunitas</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows}
                  </tbody>
                </table>
              </section>
            `
          })
          .join('')

        return `
          <section class="section-card">
            <h2 class="section-title">${group.categoryLabel}</h2>
            ${batchesHtml}
          </section>
        `
      })
      .join('')

    const html = buildBrandedPrintHtml({
      title: 'Cetak Moto Seluruh Kategori',
      eyebrow: 'Moto Print',
      heading: 'Data Rider Per Moto Seluruh Kategori',
      subtitle: eventName,
      body: sections,
    })

    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.style.visibility = 'hidden'
    document.body.appendChild(iframe)

    const printWindow = iframe.contentWindow
    const printDoc = iframe.contentDocument || printWindow?.document
    if (!printWindow || !printDoc) {
      document.body.removeChild(iframe)
      alert('Gagal membuka preview cetak. Refresh halaman lalu coba lagi.')
      return
    }

    printDoc.open()
    printDoc.write(html)
    printDoc.close()

    const cleanup = () => {
      setTimeout(() => {
        try {
          document.body.removeChild(iframe)
        } catch {
          // no-op
        }
      }, 600)
    }

    printWindow.onafterprint = cleanup
    setTimeout(() => {
      printWindow.focus()
      printWindow.print()
      cleanup()
    }, 350)
  }

  return (
    <div style={{ maxWidth: 980 }} className="motos-print-root">
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => load('refresh')}
          disabled={loading || refreshing}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '2px solid #111',
            background: '#dcfce7',
            fontWeight: 900,
            cursor: loading || refreshing ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap',
            opacity: loading || refreshing ? 0.6 : 1,
          }}
        >
          {loading || refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
        <button
          type="button"
          onClick={handlePrintMotoRiders}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '2px solid #111',
            background: '#fde68a',
            fontWeight: 900,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Cetak Rider Per Moto
        </button>
      </div>
      <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Motos</h1>
      <div
        className="no-print"
        style={{
          marginTop: 10,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 999,
          border: '2px solid #111',
          background: '#ecfccb',
          fontWeight: 900,
          fontSize: 12,
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: '#16a34a',
            display: 'inline-block',
          }}
        />
        Auto Live Next aktif: setelah submit hasil, moto berikutnya dalam kategori yang sama akan otomatis menjadi LIVE. Jika itu moto terakhir kategori, sistem berhenti dulu di PROVISIONAL supaya result board sempat tampil.
      </div>
      {eventStatus && eventStatus !== 'LIVE' && (
        <div
          className="no-print"
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 12,
            border: '2px dashed #111',
            background: '#fff',
            fontWeight: 900,
          }}
        >
          Status event saat ini: {eventStatus}. Update status moto hanya bisa ketika event LIVE.
        </div>
      )}


      <div style={{ marginTop: 16, display: 'grid', gap: 16 }}>
        {loading && motos.length === 0 && (
          <div className="no-print" style={{ padding: 14, borderRadius: 16, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Loading...
          </div>
        )}

        {!loading && motos.length === 0 && (
          <div style={{ padding: 14, borderRadius: 16, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Belum ada moto.
          </div>
        )}

        {categoriesSorted.map((cat) => {
          const list = motosByCategory.get(cat.id) ?? []
          if (list.length === 0) return null
          const isHidden = hiddenCategoryIds.includes(cat.id)
          const computeAction = getComputeAction(cat.id)
          const summary = advancedSummaryByCategory[cat.id]
          return (
          <div
            key={cat.id}
            className="moto-category-card"
            style={{
              padding: 14,
              borderRadius: 16,
              border: '2px solid #111',
              background: '#fff',
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div style={{ fontWeight: 950, fontSize: 18 }}>
                {categoryLabel.get(cat.id) ?? `Category ${cat.id}`}
              </div>
              <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() =>
                    window.open(
                      `/event/${eventId}/live-score/${encodeURIComponent(cat.id)}`,
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    border: '2px solid #111',
                    background: '#dbeafe',
                    fontWeight: 900,
                    fontSize: 12,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Open Public Result
                </button>
                <button
                  type="button"
                  onClick={() => toggleCategoryCard(cat.id)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    border: '2px solid #111',
                    background: '#f8fafc',
                    fontWeight: 900,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {isHidden ? 'Tampilkan' : 'Sembunyikan'}
                </button>
              </div>
            </div>
            {computeAction.visible && (
              <div
                className="no-print"
                style={{
                  padding: 12,
                  borderRadius: 14,
                  border: '2px solid #111',
                  background: '#f8fafc',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: 4 }}>
                    <div style={{ fontWeight: 900, fontSize: 13 }}>Aksi Stage Kategori</div>
                    <div style={{ fontSize: 12, color: '#334155', fontWeight: 700 }}>{computeAction.description}</div>
                    {summary && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, fontWeight: 800, color: '#475569' }}>
                        <span>Q: {summary.stageCounts?.QUALIFICATION ?? 0}</span>
                        <span>QF: {summary.stageCounts?.QUARTER_FINAL ?? 0}</span>
                        <span>REP: {summary.stageCounts?.REPECHAGE ?? 0}</span>
                        <span>SF: {summary.stageCounts?.SEMI_FINAL ?? 0}</span>
                        <span>F: {summary.stageCounts?.FINAL ?? 0}</span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => computeAction.endpoint && handleComputeCategory(cat.id, computeAction.endpoint)}
                    disabled={computeAction.disabled || computingCategoryId === cat.id}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 12,
                      border: '2px solid #111',
                      background: computeAction.disabled ? '#e5e7eb' : '#dbeafe',
                      fontWeight: 900,
                      cursor: computeAction.disabled || computingCategoryId === cat.id ? 'not-allowed' : 'pointer',
                      minWidth: 220,
                    }}
                  >
                    {computingCategoryId === cat.id ? 'Memproses...' : computeAction.label}
                  </button>
                </div>
              </div>
            )}
            {isHidden ? null : (
              <div style={{ display: 'grid', gap: 8 }}>
                {list.map((m) => (
                  <div
                    key={m.id}
                    className="moto-row-card"
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      border: '2px solid #111',
                      background: '#eaf7ee',
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ fontWeight: 900 }}>
                        {m.moto_order}. {m.moto_name}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontWeight: 800, fontSize: 12 }}>
                        <span>Status: {m.status}</span>
                        {m.status === 'LIVE' && (
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: 999,
                              border: '2px solid #111',
                              background: '#bbf7d0',
                            }}
                          >
                            Auto Live Next
                          </span>
                        )}
                        {m.status === 'PROVISIONAL' && m.provisional_at && (
                          <span>Provisional: {new Date(m.provisional_at).toLocaleString()}</span>
                        )}
                        {m.is_published && m.published_at && (
                          <span>Published: {new Date(m.published_at).toLocaleString()}</span>
                        )}
                      </div>
                    </div>
                    <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <select
                        value={m.status}
                        onChange={(e) => handleUpdateMotoStatus(m.id, e.target.value as MotoItem['status'])}
                        disabled={eventStatus !== 'LIVE' || getAllowedMotoStatuses(m.status).length <= 1}
                        style={{ padding: '8px 10px', borderRadius: 12, border: '2px solid #111', fontWeight: 900 }}
                      >
                        {getAllowedMotoStatuses(m.status).map((statusOption) => (
                          <option key={`${m.id}-${statusOption}`} value={statusOption}>
                            {statusOption}
                          </option>
                        ))}
                      </select>
                      {m.status === 'PROVISIONAL' && (
                        <button
                          type="button"
                          onClick={() => handleOpenReview(m.id)}
                          disabled={eventStatus !== 'LIVE'}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 999,
                            border: '2px solid #111',
                            background: '#fef3c7',
                            fontWeight: 900,
                            cursor: eventStatus === 'LIVE' ? 'pointer' : 'not-allowed',
                          }}
                        >
                          Buka Review
                        </button>
                      )}
                      {(m.status === 'PROVISIONAL' || m.status === 'PROTEST_REVIEW') && (
                        <button
                          type="button"
                          onClick={() => handleLockMoto(m.id)}
                          disabled={eventStatus !== 'LIVE'}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 999,
                            border: '2px solid #111',
                            background: '#d1fae5',
                            fontWeight: 900,
                            cursor: eventStatus === 'LIVE' ? 'pointer' : 'not-allowed',
                          }}
                        >
                          Lock Moto
                        </button>
                      )}
                      {m.status === 'LOCKED' && (
                        <button
                          type="button"
                          onClick={() => handleUnlockMoto(m.id)}
                          disabled={eventStatus !== 'LIVE'}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 999,
                            border: '2px solid #111',
                            background: '#e0f2fe',
                            fontWeight: 900,
                            cursor: eventStatus === 'LIVE' ? 'pointer' : 'not-allowed',
                          }}
                        >
                          Unlock Moto
                        </button>
                      )}
                      {m.status !== 'LOCKED' && m.status !== 'PROTEST_REVIEW' && (
                        <button
                          type="button"
                          onClick={() => handleResetResults(m.id)}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 999,
                            border: '2px solid #111',
                            background: '#fee2e2',
                            fontWeight: 900,
                            cursor: 'pointer',
                          }}
                        >
                          Reset Result
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => window.open(`/event/${eventId}/live-score/${encodeURIComponent(m.category_id)}`, '_blank', 'noopener,noreferrer')}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 999,
                          border: '2px solid #111',
                          background: '#dbeafe',
                          fontWeight: 900,
                          cursor: 'pointer',
                        }}
                      >
                        Open Public Result
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )
        })}
      </div>

      <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
        <div
          className="no-print"
          style={{
            padding: 12,
            borderRadius: 14,
            border: '2px solid #111',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 900, color: '#0f172a' }}>
            Daftar rider moto disembunyikan dulu supaya halaman ini fokus ke kontrol status.
          </div>
          <button
            type="button"
            onClick={() => setShowMotoRiderList((prev) => !prev)}
            style={{
              padding: '8px 12px',
              borderRadius: 999,
              border: '2px solid #111',
              background: '#f8fafc',
              fontWeight: 900,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {showMotoRiderList ? 'Sembunyikan Daftar Rider' : 'Tampilkan Daftar Rider'}
          </button>
        </div>

        {showMotoRiderList &&
          printGroups.map((group) => (
          <section
            key={`print-${group.categoryId}`}
            className="moto-print-section"
            style={{
              padding: 14,
              borderRadius: 16,
              border: '2px solid #111',
              background: '#fff',
              color: '#0f172a',
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 950, fontSize: 18 }}>Daftar Rider Moto - {group.categoryLabel}</div>
            {group.batches.map((batch) => (
              <div
                key={`${group.categoryId}-batch-${batch.batchNo}`}
                className="moto-print-batch"
                style={{
                  padding: 12,
                  borderRadius: 14,
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ fontWeight: 900 }}>Batch {batch.batchNo}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>
                  {batch.motoColumns
                    .map((col) => `${col.label}: ${col.moto_name} (${col.status})`)
                    .join(' | ')}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="moto-print-table" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                    <thead>
                      <tr>
                        {batch.motoColumns.map((col) => (
                          <th
                            key={`${group.categoryId}-batch-${batch.batchNo}-${col.key}`}
                            style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1px solid #cbd5e1', fontSize: 12 }}
                          >
                            Gate {col.label}
                          </th>
                        ))}
                        <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1px solid #cbd5e1', fontSize: 12 }}>
                          No Plate
                        </th>
                        <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1px solid #cbd5e1', fontSize: 12 }}>
                          Nama Rider
                        </th>
                        <th style={{ textAlign: 'left', padding: '6px 4px', borderBottom: '1px solid #cbd5e1', fontSize: 12 }}>
                          Komunitas
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {batch.riderRows.map((row) => (
                        <tr key={`${group.categoryId}-batch-${batch.batchNo}-${row.rider_id}`}>
                          {batch.motoColumns.map((col) => (
                            <td
                              key={`${group.categoryId}-batch-${batch.batchNo}-${row.rider_id}-${col.key}`}
                              style={{ padding: '6px 4px', borderBottom: '1px dashed #e2e8f0', fontWeight: 800 }}
                            >
                              {row.gates[col.key] ?? '-'}
                            </td>
                          ))}
                          <td style={{ padding: '6px 4px', borderBottom: '1px dashed #e2e8f0', fontWeight: 800 }}>
                            {row.no_plate_display}
                          </td>
                          <td style={{ padding: '6px 4px', borderBottom: '1px dashed #e2e8f0', fontWeight: 800 }}>
                            {row.name}
                          </td>
                          <td style={{ padding: '6px 4px', borderBottom: '1px dashed #e2e8f0', fontWeight: 800 }}>
                            {row.club ?? '-'}
                          </td>
                        </tr>
                      ))}
                      {batch.riderRows.length === 0 && (
                        <tr>
                          <td
                            colSpan={batch.motoColumns.length + 3}
                            style={{ padding: '8px 4px', color: '#64748b', fontWeight: 700 }}
                          >
                            Belum ada rider pada batch ini.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </section>
          ))}
      </div>
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .motos-print-root {
            max-width: none !important;
          }
          .moto-category-card,
          .moto-row-card,
          .moto-print-section,
          .moto-print-batch,
          .moto-print-card {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  )
}

