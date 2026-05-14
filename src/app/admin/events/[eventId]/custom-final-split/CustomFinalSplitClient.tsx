'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'

type CategoryRow = {
  id: string
  label: string
  year?: number | null
  gender?: 'BOY' | 'GIRL' | 'MIX' | null
  total_riders?: number | null
  resolver_source?: 'override' | 'rule' | 'default' | null
  stages?: {
    enableQualification: boolean
    enableQuarterFinal: boolean
    enableSemiFinal: boolean
  } | null
  final_classes?: string[] | null
  max_riders_per_race?: number | null
  qualification_moto_count?: number | null
}

type CustomSplitRule = {
  id?: string
  category_id: string
  source_stage: 'QUALIFICATION'
  rank_from: number
  rank_to: number
  target_stage: 'QUARTER_FINAL' | 'SEMI_FINAL' | 'FINAL'
  target_final_class: string | null
  sort_order: number
  split_basis: 'COMBINED' | 'PER_BATCH' | 'CUSTOM_PER_BATCH'
  batch_no: number | null
}

const FINAL_CLASS_OPTIONS = ['ELITE', 'NOVICE', 'PRO', 'ROOKIE', 'ADVANCED', 'ACADEMY', 'AMATEUR', 'BEGINNER']
const TARGET_STAGE_OPTIONS: Array<CustomSplitRule['target_stage']> = ['FINAL', 'SEMI_FINAL', 'QUARTER_FINAL']
const SPLIT_BASIS_OPTIONS: Array<CustomSplitRule['split_basis']> = ['COMBINED', 'PER_BATCH', 'CUSTOM_PER_BATCH']

const splitBasisLabel = (value: CustomSplitRule['split_basis']) => {
  if (value === 'PER_BATCH') return 'Top N Per Batch'
  if (value === 'CUSTOM_PER_BATCH') return 'Custom Per Batch'
  return 'Combined Rank'
}

const createEmptyRule = (
  categoryId: string,
  sortOrder: number,
  splitBasis: CustomSplitRule['split_basis'] = 'COMBINED'
): CustomSplitRule => ({
  category_id: categoryId,
  source_stage: 'QUALIFICATION',
  rank_from: Math.max(1, sortOrder + 1),
  rank_to: Math.max(1, sortOrder + 1),
  target_stage: 'FINAL',
  target_final_class: 'ELITE',
  sort_order: sortOrder,
  split_basis: splitBasis,
  batch_no: splitBasis === 'CUSTOM_PER_BATCH' ? 1 : null,
})

export default function CustomFinalSplitClient({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(false)
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(false)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [rulesByCategory, setRulesByCategory] = useState<Record<string, CustomSplitRule[]>>({})

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...((options.headers ?? {}) as Record<string, string>),
    }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Request failed')
    return json
  }

  const load = async () => {
    if (!eventId) return
    setLoading(true)
    try {
      const res = await apiFetch(`/api/events/${eventId}/custom-final-split`)
      const nextCategories = (res.data?.categories ?? []) as CategoryRow[]
      const nextRules = (res.data?.rules ?? []) as CustomSplitRule[]
      const grouped: Record<string, CustomSplitRule[]> = {}
      for (const row of nextRules) {
        if (!grouped[row.category_id]) grouped[row.category_id] = []
        grouped[row.category_id].push({
          ...row,
          split_basis:
            row.split_basis === 'CUSTOM_PER_BATCH'
              ? 'CUSTOM_PER_BATCH'
              : row.split_basis === 'PER_BATCH'
                ? 'PER_BATCH'
                : 'COMBINED',
          batch_no: row.batch_no != null ? Number(row.batch_no) : null,
        })
      }
      Object.keys(grouped).forEach((categoryId) => {
        grouped[categoryId] = grouped[categoryId]
          .sort((a, b) => a.sort_order - b.sort_order || a.rank_from - b.rank_from)
          .map((rule, index) => ({ ...rule, sort_order: index }))
      })
      setCategories(nextCategories)
      setRulesByCategory(grouped)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal memuat final class rules.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const categorySummary = useMemo(() => {
    const summary: Record<string, string> = {}
    for (const category of categories) {
      const rules = rulesByCategory[category.id] ?? []
      summary[category.id] =
        rules.length === 0
          ? 'Belum ada custom split.'
          : `${splitBasisLabel(rules[0]?.split_basis ?? 'COMBINED')} | ` +
            rules
              .map((rule) => {
                const rankLabel = `${rule.rank_from}-${rule.rank_to}`
                const targetLabel = rule.target_stage === 'FINAL' ? rule.target_final_class : rule.target_stage
                return rule.split_basis === 'CUSTOM_PER_BATCH'
                  ? `Batch ${rule.batch_no ?? '?'} ${rankLabel} -> ${targetLabel}`
                  : `${rankLabel} -> ${targetLabel}`
              })
              .join(' | ')
    }
    return summary
  }, [categories, rulesByCategory])

  const guideEntries = useMemo(() => {
    return categories.map((category) => {
      const rules = rulesByCategory[category.id] ?? []
      const totalRiders = Math.max(0, Number(category.total_riders ?? 0))
      const maxRidersPerRace = Math.max(1, Number(category.max_riders_per_race ?? 8))
      const batchCount = totalRiders > 0 ? Math.max(1, Math.ceil(totalRiders / maxRidersPerRace)) : 0
      const usesSingleBatchFinal = batchCount === 1
      const qualificationMotoCount = usesSingleBatchFinal
        ? 3
        : Math.max(2, Number(category.qualification_moto_count ?? 2))
      const stageFlags = category.stages ?? {
        enableQualification: false,
        enableQuarterFinal: false,
        enableSemiFinal: false,
      }
      const introParts = [
        `${category.label} diikuti ${totalRiders} rider`,
        batchCount > 0 ? `dibagi menjadi ${batchCount} batch` : 'belum punya batch',
      ]
      if (stageFlags.enableQualification || usesSingleBatchFinal) {
        introParts.push(`dengan ${qualificationMotoCount} moto qualification per batch`)
      }

      let systemText = ''
      if (rules.length > 0) {
        const splitBasis = rules[0]?.split_basis ?? 'COMBINED'
        systemText = `Pembagian final memakai ${splitBasisLabel(splitBasis)}.`
      } else if (stageFlags.enableQuarterFinal) {
        systemText = 'Kategori ini memakai alur AMS standar: qualification, quarter final, semi final, lalu final class.'
      } else if (stageFlags.enableSemiFinal) {
        systemText = 'Kategori ini memakai alur AMS standar: qualification, semi final, lalu final class.'
      } else if (stageFlags.enableQualification) {
        systemText = 'Kategori ini memakai alur AMS standar: qualification lalu dibagi ke final class.'
      } else if (usesSingleBatchFinal) {
        systemText = 'Kategori 1 batch ini memakai format 3 moto, dan total point dari semua moto menentukan hasil akhir.'
      } else {
        systemText = 'Kategori ini memakai alur AMS standar tanpa custom split tambahan.'
      }

      const ruleLines =
        rules.length === 0
          ? [
              stageFlags.enableQualification
                ? `Final class standar yang mungkin terbentuk: ${(category.final_classes ?? []).join(', ') || 'ELITE'}.`
                : `Final class default kategori ini: ${(category.final_classes ?? []).join(', ') || 'ELITE'}.`,
            ]
          : rules.map((rule) => {
              const targetLabel = rule.target_stage === 'FINAL' ? `Final ${rule.target_final_class}` : rule.target_stage.replace(/_/g, ' ')
              if (rule.split_basis === 'CUSTOM_PER_BATCH') {
                return `Batch ${rule.batch_no ?? '?'} rank ${rule.rank_from}-${rule.rank_to} masuk ${targetLabel}.`
              }
              if (rule.split_basis === 'PER_BATCH') {
                return `Setiap batch rank ${rule.rank_from}-${rule.rank_to} masuk ${targetLabel}.`
              }
              return `Rank gabungan ${rule.rank_from}-${rule.rank_to} masuk ${targetLabel}.`
            })

      const stageLine = stageFlags.enableQuarterFinal
        ? 'Rider yang lolos dari qualification akan lanjut ke Quarter Final, Semi Final, lalu Final.'
        : stageFlags.enableSemiFinal
          ? 'Rider yang lolos dari qualification akan lanjut ke Semi Final, lalu Final.'
          : stageFlags.enableQualification
            ? 'Setelah qualification selesai, rider dibagi ke final class sesuai aturan kategori ini.'
            : usesSingleBatchFinal
              ? 'Setelah Moto 3 selesai dan dikunci, total point akan menjadi hasil akhir kategori.'
              : 'Kategori ini langsung memakai hasil final tanpa stage lanjutan.'

      return {
        category,
        title: category.label,
        intro: `${introParts.join(', ')}.`,
        systemText,
        ruleLines,
        stageLine,
      }
    })
  }, [categories, rulesByCategory])

  const guideText = useMemo(
    () =>
      guideEntries
        .map((entry) => [entry.title, entry.intro, entry.systemText, entry.stageLine, ...entry.ruleLines].join('\n'))
        .join('\n\n'),
    [guideEntries]
  )

  const copyGuideText = async () => {
    try {
      await navigator.clipboard.writeText(guideText)
      alert('Race System Guide berhasil disalin.')
    } catch {
      alert('Gagal menyalin Race System Guide.')
    }
  }

  const printGuide = () => {
    const sections = guideEntries
      .map(
        (entry) => `
          <section class="guide-card">
            <h2>${entry.title}</h2>
            <p>${entry.intro}</p>
            <p>${entry.systemText}</p>
            <p>${entry.stageLine}</p>
            <ul>${entry.ruleLines.map((line) => `<li>${line}</li>`).join('')}</ul>
          </section>
        `
      )
      .join('')

    const frame = document.createElement('iframe')
    frame.style.position = 'fixed'
    frame.style.right = '0'
    frame.style.bottom = '0'
    frame.style.width = '0'
    frame.style.height = '0'
    frame.style.border = '0'
    frame.setAttribute('aria-hidden', 'true')
    document.body.appendChild(frame)

    const frameWindow = frame.contentWindow
    const frameDocument = frame.contentDocument ?? frameWindow?.document
    if (!frameWindow || !frameDocument) {
      document.body.removeChild(frame)
      alert('Gagal membuka dokumen cetak Race System Guide.')
      return
    }

    frameDocument.open()
    frameDocument.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Race System Guide</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
      .page { padding: 28px; }
      .hero { background: linear-gradient(135deg, #0f172a, #1d4ed8); color: white; padding: 24px; border-radius: 18px; margin-bottom: 18px; }
      .hero h1 { margin: 0 0 8px; font-size: 28px; }
      .hero p { margin: 0; font-size: 14px; opacity: 0.92; }
      .guide-card { background: white; border: 2px solid #cbd5e1; border-radius: 16px; padding: 18px; margin-bottom: 14px; page-break-inside: avoid; }
      .guide-card h2 { margin: 0 0 8px; font-size: 22px; }
      .guide-card p { margin: 0 0 8px; line-height: 1.5; }
      .guide-card ul { margin: 10px 0 0 18px; padding: 0; }
      .guide-card li { margin-bottom: 6px; line-height: 1.45; }
      @media print {
        body { background: white; }
        .page { padding: 0; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <div class="hero">
        <h1>Race System Guide</h1>
        <p>Penjelasan otomatis sistem race per kategori untuk dibagikan ke wali rider dan panitia.</p>
      </div>
      ${sections}
    </main>
    <script>
      window.onload = () => {
        window.print();
      };
    </script>
  </body>
</html>`)
    frameDocument.close()
    frameWindow.focus()
    const cleanup = () => {
      window.setTimeout(() => {
        if (frame.parentNode) {
          frame.parentNode.removeChild(frame)
        }
      }, 1000)
    }
    frameWindow.onafterprint = cleanup
    window.setTimeout(() => {
      try {
        frameWindow.print()
      } finally {
        cleanup()
      }
    }, 250)
  }

  const updateRule = (categoryId: string, index: number, patch: Partial<CustomSplitRule>) => {
    setRulesByCategory((prev) => {
      const current = [...(prev[categoryId] ?? [])]
      current[index] = { ...current[index], ...patch }
      return { ...prev, [categoryId]: current }
    })
  }

  const addRule = (categoryId: string) => {
    setRulesByCategory((prev) => {
      const current = [...(prev[categoryId] ?? [])]
      const splitBasis = current[0]?.split_basis ?? 'COMBINED'
      current.push(createEmptyRule(categoryId, current.length, splitBasis))
      return { ...prev, [categoryId]: current }
    })
  }

  const updateSplitBasis = (categoryId: string, splitBasis: CustomSplitRule['split_basis']) => {
    setRulesByCategory((prev) => {
      const current = [...(prev[categoryId] ?? [])]
      if (current.length === 0) {
        return { ...prev, [categoryId]: [createEmptyRule(categoryId, 0, splitBasis)] }
      }
      return {
        ...prev,
        [categoryId]: current.map((rule) => ({
          ...rule,
          split_basis: splitBasis,
          batch_no: splitBasis === 'CUSTOM_PER_BATCH' ? rule.batch_no ?? 1 : null,
        })),
      }
    })
  }

  const removeRule = (categoryId: string, index: number) => {
    setRulesByCategory((prev) => {
      const current = [...(prev[categoryId] ?? [])]
      current.splice(index, 1)
      return {
        ...prev,
        [categoryId]: current.map((rule, nextIndex) => ({ ...rule, sort_order: nextIndex })),
      }
    })
  }

  const saveRules = async (categoryId: string) => {
    const payload = (rulesByCategory[categoryId] ?? []).map((rule, index) => ({
      ...rule,
      sort_order: index,
      rank_from: Number(rule.rank_from),
      rank_to: Number(rule.rank_to),
      target_final_class: rule.target_stage === 'FINAL' ? rule.target_final_class ?? 'ELITE' : null,
      split_basis:
        rule.split_basis === 'CUSTOM_PER_BATCH'
          ? 'CUSTOM_PER_BATCH'
          : rule.split_basis === 'PER_BATCH'
            ? 'PER_BATCH'
            : 'COMBINED',
      batch_no: rule.split_basis === 'CUSTOM_PER_BATCH' ? Math.max(1, Number(rule.batch_no) || 1) : null,
    }))
    const category = categories.find((item) => item.id === categoryId)
    const totalRiders = Math.max(0, Number(category?.total_riders ?? 0))
    const highestCoveredRank = payload.reduce((max, rule) => Math.max(max, Number(rule.rank_to) || 0), 0)
    const splitBasis = payload[0]?.split_basis ?? 'COMBINED'

    if (splitBasis === 'COMBINED' && totalRiders > 0 && payload.length > 0 && highestCoveredRank < totalRiders) {
      alert(
        `Rule saat ini hanya mencakup rank 1-${highestCoveredRank}, sementara total rider kategori ini ${totalRiders}. Lengkapi rule sampai rank ${totalRiders} dulu.`
      )
      return
    }

    setSavingCategoryId(categoryId)
    try {
      await apiFetch(`/api/events/${eventId}/custom-final-split`, {
        method: 'POST',
        body: JSON.stringify({
          category_id: categoryId,
          rules: payload,
        }),
      })
      await load()
      alert('Final class rules berhasil disimpan.')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menyimpan final class rules.')
    } finally {
      setSavingCategoryId(null)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 1180 }}>
      <div
        style={{
          border: '2px solid #111',
          borderRadius: 18,
          background: '#fff',
          padding: 18,
          display: 'grid',
          gap: 8,
        }}
      >
                <div style={{ fontSize: 26, fontWeight: 950 }}>Final Class Rules</div>
                <div style={{ color: '#334155', fontWeight: 700 }}>
          Override split standar AMS per kategori. Dipakai kalau kamu butuh pola khusus seperti 9 rider: top 3 ke Final Elite, 3 berikutnya ke Final Novice.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '2px solid #111',
              background: '#dbeafe',
              fontWeight: 900,
            }}
          >
            Race System Guide
          </button>
        </div>
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '2px dashed #111',
            background: '#f8fafc',
            fontSize: 13,
            fontWeight: 700,
            color: '#475569',
          }}
        >
          Scope saat ini: custom split dipakai untuk hasil <b>Qualification</b>. Jadi rule di bawah akan override pembagian default batch qualification kategori itu.
          <br />
          <b>Combined Rank</b> berarti rank gabungan seluruh batch. <b>Top N Per Batch</b> berarti range rank dibaca ulang di masing-masing batch.
          <b>Custom Per Batch</b> berarti tiap batch boleh punya rule sendiri, misalnya Batch 1 ambil top 4 dan Batch 2 ambil top 3.
        </div>
      </div>

      {loading && (
        <div style={{ padding: 14, border: '2px dashed #111', borderRadius: 14, background: '#fff', fontWeight: 900 }}>
          Loading final class rules...
        </div>
      )}

      {!loading &&
        categories.map((category) => {
          const rules = rulesByCategory[category.id] ?? []
          const splitBasis = rules[0]?.split_basis ?? 'COMBINED'
          return (
            <section
              key={category.id}
              style={{
                border: '2px solid #111',
                borderRadius: 18,
                background: '#fff',
                padding: 18,
                display: 'grid',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 24, fontWeight: 950 }}>{category.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                    Total Rider: {category.total_riders ?? 0}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>
                    Rule Basis: {splitBasisLabel(splitBasis)}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>{categorySummary[category.id]}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select
                    value={splitBasis}
                    onChange={(e) => updateSplitBasis(category.id, e.target.value as CustomSplitRule['split_basis'])}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '2px solid #111',
                      background: '#fff',
                      fontWeight: 900,
                    }}
                  >
                    {SPLIT_BASIS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {splitBasisLabel(option)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => addRule(category.id)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '2px solid #111',
                      background: '#fff1b8',
                      fontWeight: 900,
                    }}
                  >
                    Add Rule
                  </button>
                  <button
                    type="button"
                    onClick={() => saveRules(category.id)}
                    disabled={savingCategoryId === category.id}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '2px solid #111',
                      background: '#bfead2',
                      fontWeight: 900,
                      opacity: savingCategoryId === category.id ? 0.7 : 1,
                    }}
                  >
                    {savingCategoryId === category.id ? 'Saving...' : 'Save Rules'}
                  </button>
                </div>
              </div>

              {rules.length === 0 && (
                <div style={{ padding: 12, borderRadius: 12, border: '2px dashed #111', background: '#f8fafc', fontWeight: 800 }}>
                  Belum ada custom split. Kalau kategori ini cukup pakai rule AMS standar, boleh dibiarkan kosong.
                </div>
              )}

              {rules.map((rule, index) => (
                <div
                  key={`${category.id}-${index}`}
                  style={{
                    display: 'grid',
                    gap: 10,
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    alignItems: 'end',
                    border: '2px solid #111',
                    borderRadius: 14,
                    padding: 12,
                    background: '#f8fafc',
                  }}
                >
                  {splitBasis === 'CUSTOM_PER_BATCH' && (
                    <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>
                      <span>Batch</span>
                      <input
                        type="number"
                        min={1}
                        value={rule.batch_no ?? 1}
                        onChange={(e) => updateRule(category.id, index, { batch_no: Math.max(1, Number(e.target.value) || 1) })}
                        style={{ padding: '10px 12px', borderRadius: 10, border: '2px solid #111', background: '#fff' }}
                      />
                    </label>
                  )}

                  <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>
                    <span>{splitBasis === 'COMBINED' ? 'Rank From' : 'Rank From Per Batch'}</span>
                    <input
                      type="number"
                      min={1}
                      value={rule.rank_from}
                      onChange={(e) => updateRule(category.id, index, { rank_from: Number(e.target.value) || 1 })}
                      style={{ padding: '10px 12px', borderRadius: 10, border: '2px solid #111', background: '#fff' }}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>
                    <span>{splitBasis === 'COMBINED' ? 'Rank To' : 'Rank To Per Batch'}</span>
                    <input
                      type="number"
                      min={rule.rank_from}
                      value={rule.rank_to}
                      onChange={(e) => updateRule(category.id, index, { rank_to: Number(e.target.value) || rule.rank_from })}
                      style={{ padding: '10px 12px', borderRadius: 10, border: '2px solid #111', background: '#fff' }}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>
                    <span>Target Stage</span>
                    <select
                      value={rule.target_stage}
                      onChange={(e) =>
                        updateRule(category.id, index, {
                          target_stage: e.target.value as CustomSplitRule['target_stage'],
                          target_final_class: e.target.value === 'FINAL' ? rule.target_final_class ?? 'ELITE' : null,
                        })
                      }
                      style={{ padding: '10px 12px', borderRadius: 10, border: '2px solid #111', background: '#fff' }}
                    >
                      {TARGET_STAGE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>
                    <span>Final Class</span>
                    <select
                      value={rule.target_final_class ?? 'ELITE'}
                      onChange={(e) => updateRule(category.id, index, { target_final_class: e.target.value })}
                      disabled={rule.target_stage !== 'FINAL'}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 10,
                        border: '2px solid #111',
                        background: rule.target_stage === 'FINAL' ? '#fff' : '#e2e8f0',
                      }}
                    >
                      {FINAL_CLASS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={() => removeRule(category.id, index)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '2px solid #111',
                      background: '#ffd7d7',
                      fontWeight: 900,
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </section>
          )
        })}

      {showGuide && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            display: 'grid',
            placeItems: 'center',
            padding: 20,
            zIndex: 60,
          }}
        >
          <div
            style={{
              width: 'min(980px, 100%)',
              maxHeight: '90vh',
              overflow: 'auto',
              borderRadius: 20,
              border: '2px solid #111',
              background: '#fff',
              padding: 18,
              display: 'grid',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 28, fontWeight: 950 }}>Race System Guide</div>
                <div style={{ color: '#475569', fontWeight: 700 }}>
                  Penjelasan otomatis sistem penilaian dan pembagian stage/final per kategori.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => void copyGuideText()}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '2px solid #111',
                    background: '#fff1b8',
                    fontWeight: 900,
                  }}
                >
                  Copy Text
                </button>
                <button
                  type="button"
                  onClick={printGuide}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '2px solid #111',
                    background: '#d9f99d',
                    fontWeight: 900,
                  }}
                >
                  Cetak / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: '2px solid #111',
                    background: '#ffd7d7',
                    fontWeight: 900,
                  }}
                >
                  Tutup
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {guideEntries.map((entry) => (
                <section
                  key={entry.category.id}
                  style={{
                    border: '2px solid #cbd5e1',
                    borderRadius: 16,
                    background: '#f8fafc',
                    padding: 16,
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <div style={{ fontSize: 22, fontWeight: 950 }}>{entry.title}</div>
                  <div style={{ color: '#0f172a', fontWeight: 700, lineHeight: 1.5 }}>{entry.intro}</div>
                  <div style={{ color: '#334155', fontWeight: 700, lineHeight: 1.5 }}>{entry.systemText}</div>
                  <div style={{ color: '#334155', fontWeight: 700, lineHeight: 1.5 }}>{entry.stageLine}</div>
                  <ul style={{ margin: '4px 0 0 18px', padding: 0, display: 'grid', gap: 6 }}>
                    {entry.ruleLines.map((line, index) => (
                      <li key={`${entry.category.id}-${index}`} style={{ color: '#0f172a', fontWeight: 700, lineHeight: 1.45 }}>
                        {line}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
