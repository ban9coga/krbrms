'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'

type CategoryRow = {
  id: string
  label: string
  year?: number | null
  gender?: 'BOY' | 'GIRL' | 'MIX' | null
  total_riders?: number | null
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
}

const FINAL_CLASS_OPTIONS = ['ELITE', 'NOVICE', 'PRO', 'ROOKIE', 'ADVANCED', 'ACADEMY', 'AMATEUR', 'BEGINNER']
const TARGET_STAGE_OPTIONS: Array<CustomSplitRule['target_stage']> = ['FINAL', 'SEMI_FINAL', 'QUARTER_FINAL']

const createEmptyRule = (categoryId: string, sortOrder: number): CustomSplitRule => ({
  category_id: categoryId,
  source_stage: 'QUALIFICATION',
  rank_from: Math.max(1, sortOrder + 1),
  rank_to: Math.max(1, sortOrder + 1),
  target_stage: 'FINAL',
  target_final_class: 'ELITE',
  sort_order: sortOrder,
})

export default function CustomFinalSplitClient({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(false)
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null)
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
        grouped[row.category_id].push(row)
      }
      Object.keys(grouped).forEach((categoryId) => {
        grouped[categoryId] = grouped[categoryId]
          .sort((a, b) => a.sort_order - b.sort_order || a.rank_from - b.rank_from)
          .map((rule, index) => ({ ...rule, sort_order: index }))
      })
      setCategories(nextCategories)
      setRulesByCategory(grouped)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal memuat custom final split.')
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
          : rules.map((rule) => `${rule.rank_from}-${rule.rank_to} → ${rule.target_stage === 'FINAL' ? rule.target_final_class : rule.target_stage}`).join(' | ')
    }
    return summary
  }, [categories, rulesByCategory])

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
      current.push(createEmptyRule(categoryId, current.length))
      return { ...prev, [categoryId]: current }
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
    }))
    const category = categories.find((item) => item.id === categoryId)
    const totalRiders = Math.max(0, Number(category?.total_riders ?? 0))
    const highestCoveredRank = payload.reduce((max, rule) => Math.max(max, Number(rule.rank_to) || 0), 0)

    if (totalRiders > 0 && payload.length > 0 && highestCoveredRank < totalRiders) {
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
      alert('Custom final split berhasil disimpan.')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menyimpan custom final split.')
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
        </div>
      </div>

      {loading && (
        <div style={{ padding: 14, border: '2px dashed #111', borderRadius: 14, background: '#fff', fontWeight: 900 }}>
          Loading custom split...
        </div>
      )}

      {!loading &&
        categories.map((category) => {
          const rules = rulesByCategory[category.id] ?? []
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
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>{categorySummary[category.id]}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                  <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>
                    <span>Rank From</span>
                    <input
                      type="number"
                      min={1}
                      value={rule.rank_from}
                      onChange={(e) => updateRule(category.id, index, { rank_from: Number(e.target.value) || 1 })}
                      style={{ padding: '10px 12px', borderRadius: 10, border: '2px solid #111', background: '#fff' }}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: 6, fontWeight: 800 }}>
                    <span>Rank To</span>
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
    </div>
  )
}
