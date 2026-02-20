'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'

type SettingsRow = {
  event_id: string
  event_logo_url: string | null
  sponsor_logo_urls: string[]
  base_price?: number | null
  extra_price?: number | null
  ffa_mix_min_year?: number | null
  ffa_mix_max_year?: number | null
  require_jersey_size?: boolean | null
  scoring_rules: Record<string, unknown>
  display_theme: Record<string, unknown>
  race_format_settings: Record<string, unknown>
  updated_at?: string | null
}

type AdvancedCategory = {
  id: string
  year: number
  gender: 'BOY' | 'GIRL' | 'MIX'
  label: string
  enabled: boolean
}

type AdvancedConfig = {
  id: string
  event_id: string
  category_id: string
  enabled: boolean
  max_riders_per_race: number
  qualification_moto_count: number
}

type CategoryRule = {
  id?: string
  category_id: string
  min_riders: number
  enable_qualification: boolean
  enable_quarter_final: boolean
  enable_semi_final: boolean
  enabled_final_classes: string[]
}

type StageResultRow = {
  id: string
  rider_id: string
  category_id: string
  stage: 'QUALIFICATION' | 'QUARTER_FINAL' | 'SEMI_FINAL' | 'FINAL'
  batch_id: string | null
  final_class: string | null
  position: number | null
  points: number | null
  riders: { name: string; no_plate_display: string } | null
}

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export default function SettingsClient({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [row, setRow] = useState<SettingsRow | null>(null)
  const [advancedLoading, setAdvancedLoading] = useState(false)
  const [advancedSaving, setAdvancedSaving] = useState(false)
  const [advancedItems, setAdvancedItems] = useState<
    Array<{ category: AdvancedCategory; config: AdvancedConfig | null }>
  >([])
  const [rulesByCategory, setRulesByCategory] = useState<Record<string, CategoryRule[]>>({})
  const [draftRules, setDraftRules] = useState<Record<string, CategoryRule>>({})
  const [stagePreview, setStagePreview] = useState<Record<string, StageResultRow[]>>({})
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>({})
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({})
  const [summaryByCategory, setSummaryByCategory] = useState<
    Record<
      string,
      { stageCounts: Record<string, number>; motoCounts: { quarter: number; semi: number; final: number } }
    >
  >({})
  const [sections, setSections] = useState<{ basic: boolean; appearance: boolean; advanced: boolean }>({
    basic: true,
    appearance: false,
    advanced: false,
  })
  const [advancedOpen, setAdvancedOpen] = useState<Record<string, boolean>>({})
  const [initialForm, setInitialForm] = useState<string>('')
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoError, setLogoError] = useState<string>('')

  const [form, setForm] = useState({
    event_logo_url: '',
    sponsor_logo_urls: '',
    base_price: '250000',
    extra_price: '150000',
    ffa_mix_min_year: '2017',
    ffa_mix_max_year: '2017',
    require_jersey_size: false,
    scoring_base_mode: 'finish_order',
    scoring_dns_points: '9',
    scoring_dnf_points: 'last',
    scoring_dq_threshold: '7',
    scoring_tie_breaker: 'last_best',
    display_primary_color: '#2ecc71',
    display_secondary_color: '#111111',
    display_header_bg: '#eaf7ee',
    display_card_bg: '#ffffff',
    display_logo_url: '',
    display_slogan: '',
    race_moto_per_batch: '3',
    race_gate_positions: '8',
    race_qualification_enabled: true,
    race_auto_advance: true,
    race_final_classes: 'ELITE,NOVICE',
    scoring_rules: '{\n}\n',
    display_theme: '{\n}\n',
    race_format_settings: '{\n}\n',
  })

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Request failed')
    return json
  }

  const uploadLogo = async (file: File) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('Session expired. Silakan login ulang.')
    const body = new FormData()
    body.append('file', file)
    const res = await fetch(`/api/events/${eventId}/logo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Gagal upload logo.')
    return json?.url as string
  }

  const load = async () => {
    if (!eventId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/events/${eventId}/settings`)
      const json = await res.json()
      const data = json.data as SettingsRow | null
      setRow(data)
      if (data) {
        const scoring = (data.scoring_rules ?? {}) as Record<string, unknown>
        const theme = (data.display_theme ?? {}) as Record<string, unknown>
        const format = (data.race_format_settings ?? {}) as Record<string, unknown>
        const nextForm = {
          event_logo_url: data.event_logo_url ?? '',
          sponsor_logo_urls: (data.sponsor_logo_urls ?? []).join('\n'),
          base_price: typeof data.base_price === 'number' ? String(data.base_price) : '250000',
          extra_price: typeof data.extra_price === 'number' ? String(data.extra_price) : '150000',
          ffa_mix_min_year:
            typeof data.ffa_mix_min_year === 'number' ? String(data.ffa_mix_min_year) : '2017',
          ffa_mix_max_year:
            typeof data.ffa_mix_max_year === 'number' ? String(data.ffa_mix_max_year) : '2017',
          require_jersey_size: Boolean(data.require_jersey_size),
          scoring_base_mode:
            typeof scoring.base_points_mode === 'string' ? scoring.base_points_mode : 'finish_order',
          scoring_dns_points:
            typeof scoring.dns_points === 'number' ? String(scoring.dns_points) : '9',
          scoring_dnf_points:
            typeof scoring.dnf_points === 'number'
              ? String(scoring.dnf_points)
              : typeof scoring.dnf_points === 'string'
              ? scoring.dnf_points
              : 'last',
          scoring_dq_threshold:
            typeof scoring.dq_penalty_threshold === 'number'
              ? String(scoring.dq_penalty_threshold)
              : '7',
          scoring_tie_breaker:
            typeof scoring.tie_breaker === 'string' ? scoring.tie_breaker : 'last_best',
          display_primary_color:
            typeof theme.primary_color === 'string' ? theme.primary_color : '#2ecc71',
          display_secondary_color:
            typeof theme.secondary_color === 'string' ? theme.secondary_color : '#111111',
          display_header_bg:
            typeof theme.header_bg === 'string' ? theme.header_bg : '#eaf7ee',
          display_card_bg:
            typeof theme.card_bg === 'string' ? theme.card_bg : '#ffffff',
          display_logo_url:
            typeof theme.logo_url === 'string' ? theme.logo_url : '',
          display_slogan:
            typeof theme.slogan === 'string' ? theme.slogan : '',
          race_moto_per_batch:
            typeof format.moto_per_batch === 'number' ? String(format.moto_per_batch) : '3',
          race_gate_positions:
            typeof format.gate_positions === 'number' ? String(format.gate_positions) : '8',
          race_qualification_enabled:
            typeof format.qualification_enabled === 'boolean' ? format.qualification_enabled : true,
          race_auto_advance:
            typeof format.auto_advance === 'boolean' ? format.auto_advance : true,
          race_final_classes:
            Array.isArray(format.final_classes) ? format.final_classes.join(',') : 'ELITE,NOVICE',
          scoring_rules: JSON.stringify(data.scoring_rules ?? {}, null, 2),
          display_theme: JSON.stringify(data.display_theme ?? {}, null, 2),
          race_format_settings: JSON.stringify(data.race_format_settings ?? {}, null, 2),
        }
        setForm(nextForm)
        setInitialForm(JSON.stringify(nextForm))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    loadAdvanced()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const loadAdvanced = async () => {
    if (!eventId) return
    setAdvancedLoading(true)
    try {
      const res = await apiFetch(`/api/events/${eventId}/advanced-race`)
      const categories = (res.data?.categories ?? []) as AdvancedCategory[]
      const configs = (res.data?.configs ?? []) as AdvancedConfig[]
      const rules = (res.data?.rules ?? []) as CategoryRule[]
      const configMap = new Map(configs.map((c) => [c.category_id, c]))
      const merged = categories.map((c) => ({ category: c, config: configMap.get(c.id) ?? null }))
      setAdvancedItems(merged)
      const grouped: Record<string, CategoryRule[]> = {}
      for (const rule of rules) {
        if (!grouped[rule.category_id]) grouped[rule.category_id] = []
        grouped[rule.category_id].push({
          category_id: rule.category_id,
          min_riders: Number(rule.min_riders),
          enable_qualification: Boolean(rule.enable_qualification),
          enable_quarter_final: Boolean(rule.enable_quarter_final),
          enable_semi_final: Boolean(rule.enable_semi_final),
          enabled_final_classes: Array.isArray(rule.enabled_final_classes) ? rule.enabled_final_classes : [],
        })
      }
      setRulesByCategory(grouped)
      const summaryRes = await apiFetch(`/api/events/${eventId}/advanced-race/summary`)
      setSummaryByCategory((summaryRes.data ?? {}) as Record<string, { stageCounts: Record<string, number>; motoCounts: { quarter: number; semi: number; final: number } }>)
    } catch (err) {
      console.warn(err)
    } finally {
      setAdvancedLoading(false)
    }
  }

  const saveAdvanced = async (categoryId: string, enabled: boolean) => {
    if (!eventId) return
    setAdvancedSaving(true)
    try {
      await apiFetch(`/api/events/${eventId}/advanced-race`, {
        method: 'POST',
        body: JSON.stringify({
          category_id: categoryId,
          enabled,
        }),
      })
      await loadAdvanced()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menyimpan advanced config.')
    } finally {
      setAdvancedSaving(false)
    }
  }

  const runQualification = async (categoryId: string) => {
    if (!eventId) return
    setAdvancedSaving(true)
    try {
      const res = await apiFetch(`/api/events/${eventId}/advanced-race/compute`, {
        method: 'POST',
        body: JSON.stringify({ category_id: categoryId }),
      })
      if (res?.warning) {
        alert(res.warning)
      } else {
        alert('Qualification berhasil dihitung.')
      }
      await loadStagePreview(categoryId)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menghitung qualification.')
    } finally {
      setAdvancedSaving(false)
    }
  }

  const runAdvances = async (categoryId: string) => {
    if (!eventId) return
    setAdvancedSaving(true)
    try {
      const res = await apiFetch(`/api/events/${eventId}/advanced-race/advance`, {
        method: 'POST',
        body: JSON.stringify({ category_id: categoryId }),
      })
      if (res?.warning) {
        alert(res.warning)
      } else {
        alert('Advance stages berhasil dihitung.')
      }
      await loadStagePreview(categoryId)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menghitung advance stages.')
    } finally {
      setAdvancedSaving(false)
    }
  }

  const loadStagePreview = async (categoryId: string) => {
    if (!eventId) return
    setPreviewLoading((prev) => ({ ...prev, [categoryId]: true }))
    try {
      const res = await apiFetch(`/api/events/${eventId}/advanced-race/results?category_id=${categoryId}`)
      setStagePreview((prev) => ({ ...prev, [categoryId]: (res.data ?? []) as StageResultRow[] }))
    } catch (err) {
      console.warn(err)
    } finally {
      setPreviewLoading((prev) => ({ ...prev, [categoryId]: false }))
    }
  }

  const togglePreview = async (categoryId: string) => {
    setPreviewOpen((prev) => ({ ...prev, [categoryId]: !prev[categoryId] }))
    if (!stagePreview[categoryId]) {
      await loadStagePreview(categoryId)
    }
  }

  const updateDraft = (categoryId: string, patch: Partial<Omit<CategoryRule, 'category_id'>>) => {
    setDraftRules((prev) => {
      const { category_id: _omit, ...prevRest } = prev[categoryId] ?? {}
      const { category_id: _omitPatch, ...patchRest } = patch as Partial<CategoryRule>
      const next = {
        ...prevRest,
        ...patchRest,
      } as CategoryRule

      if (next.min_riders == null) next.min_riders = 8
      if (next.enable_qualification == null) next.enable_qualification = true
      if (next.enable_quarter_final == null) next.enable_quarter_final = true
      if (next.enable_semi_final == null) next.enable_semi_final = true
      if (!next.enabled_final_classes) next.enabled_final_classes = []
      next.category_id = categoryId

      return {
        ...prev,
        [categoryId]: next,
      }
    })
  }

  const addRule = (categoryId: string) => {
    const draft = draftRules[categoryId]
    if (!draft) return
    setRulesByCategory((prev) => ({
      ...prev,
      [categoryId]: [...(prev[categoryId] ?? []), { ...draft }],
    }))
  }

  const removeRule = (categoryId: string, index: number) => {
    setRulesByCategory((prev) => ({
      ...prev,
      [categoryId]: (prev[categoryId] ?? []).filter((_, i) => i !== index),
    }))
  }

  const saveRules = async (categoryId: string) => {
    if (!eventId) return
    setAdvancedSaving(true)
    try {
      const rules = rulesByCategory[categoryId] ?? []
      await apiFetch(`/api/events/${eventId}/advanced-race/rules`, {
        method: 'POST',
        body: JSON.stringify({ category_id: categoryId, rules }),
      })
      await loadAdvanced()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menyimpan rules.')
    } finally {
      setAdvancedSaving(false)
    }
  }

  const handleSave = async () => {
    const dnsPoints = Number(form.scoring_dns_points)
    const dnfPoints =
      form.scoring_dnf_points.trim().toLowerCase() === 'last'
        ? 'last'
        : Number(form.scoring_dnf_points)
    const dqThreshold = Number(form.scoring_dq_threshold)

    if (!Number.isFinite(dnsPoints) || dnsPoints < 0) {
      alert('DNS points tidak valid.')
      return
    }
    if (dnfPoints !== 'last' && (!Number.isFinite(dnfPoints) || dnfPoints < 0)) {
      alert('DNF points tidak valid.')
      return
    }
    if (!Number.isFinite(dqThreshold) || dqThreshold < 0) {
      alert('DQ threshold tidak valid.')
      return
    }

    const scoring = {
      base_points_mode: form.scoring_base_mode,
      dns_points: dnsPoints,
      dnf_points: dnfPoints,
      dq_penalty_threshold: dqThreshold,
      tie_breaker: form.scoring_tie_breaker,
    }
    const theme = {
      primary_color: form.display_primary_color.trim() || '#2ecc71',
      secondary_color: form.display_secondary_color.trim() || '#111111',
      header_bg: form.display_header_bg.trim() || '#eaf7ee',
      card_bg: form.display_card_bg.trim() || '#ffffff',
      logo_url: form.display_logo_url.trim() || null,
      slogan: form.display_slogan.trim() || null,
    }
    const motoPerBatch = Number(form.race_moto_per_batch)
    const gatePositions = Number(form.race_gate_positions)
    if (!Number.isFinite(motoPerBatch) || motoPerBatch <= 0) {
      alert('Moto per batch tidak valid.')
      return
    }
    if (!Number.isFinite(gatePositions) || gatePositions <= 0) {
      alert('Gate positions tidak valid.')
      return
    }
    const format = {
      moto_per_batch: motoPerBatch,
      gate_positions: gatePositions,
      qualification_enabled: Boolean(form.race_qualification_enabled),
      auto_advance: Boolean(form.race_auto_advance),
      final_classes: form.race_final_classes
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    }

    setSaving(true)
    try {
      const basePriceNum = Number(form.base_price)
      const extraPriceNum = Number(form.extra_price)
      const ffaMinNum = Number(form.ffa_mix_min_year)
      const ffaMaxNum = Number(form.ffa_mix_max_year)
      if (!Number.isFinite(basePriceNum) || basePriceNum <= 0) {
        alert('Base price tidak valid.')
        return
      }
      if (!Number.isFinite(extraPriceNum) || extraPriceNum < 0) {
        alert('Extra price tidak valid.')
        return
      }
      if (!Number.isFinite(ffaMinNum) || !Number.isFinite(ffaMaxNum)) {
        alert('FFA MIX range tidak valid.')
        return
      }
      if (ffaMinNum > ffaMaxNum) {
        alert('FFA MIX min year tidak boleh lebih besar dari max year.')
        return
      }
      await apiFetch(`/api/events/${eventId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          event_logo_url: form.event_logo_url.trim() || null,
          sponsor_logo_urls: form.sponsor_logo_urls
            .split(/\n/)
            .map((s) => s.trim())
            .filter(Boolean),
          base_price: basePriceNum,
          extra_price: extraPriceNum,
          ffa_mix_min_year: ffaMinNum,
          ffa_mix_max_year: ffaMaxNum,
          require_jersey_size: Boolean(form.require_jersey_size),
          scoring_rules: scoring,
          display_theme: theme,
          race_format_settings: format,
        }),
      })
      await load()
      setInitialForm(JSON.stringify({
        ...form,
      }))
      alert('Settings tersimpan.')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menyimpan settings.')
    } finally {
      setSaving(false)
    }
  }

  const isDirty = initialForm !== JSON.stringify(form)
  const basicSummary = `Base ${Number(form.base_price || 0).toLocaleString()} • Extra ${Number(
    form.extra_price || 0
  ).toLocaleString()} • FFA ${form.ffa_mix_min_year}-${form.ffa_mix_max_year} • Jersey ${
    form.require_jersey_size ? 'Wajib' : 'Opsional'
  }`
  const appearanceSummary = `Theme ${form.display_primary_color} • Race ${form.race_moto_per_batch} motos`
  const advancedSummary = `${advancedItems.filter((i) => i.config?.enabled).length} enabled`

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Event Settings</h1>
      <div style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
        Logo/sponsor & konfigurasi display/scoring per event.
      </div>

      <div
        style={{
          marginTop: 16,
          display: 'grid',
          gap: 10,
        }}
      >
        {[
          { key: 'basic', label: 'Basic' },
          { key: 'appearance', label: 'Display & Race Format' },
          { key: 'advanced', label: 'Advanced Multi-Stage' },
        ].map((section) => {
          const isOpen = sections[section.key as keyof typeof sections]
          const summary =
            section.key === 'basic'
              ? basicSummary
              : section.key === 'appearance'
              ? appearanceSummary
              : advancedSummary
          return (
            <button
              key={section.key}
              type="button"
              onClick={() => setSections((prev) => ({ ...prev, [section.key]: !prev[section.key as keyof typeof prev] }))}
              style={{
                padding: '10px 14px',
                borderRadius: 12,
                border: '2px solid #111',
                background: isOpen ? '#bfead2' : '#fff',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
              }}
            >
              <span style={{ display: 'grid', gap: 2, textAlign: 'left' }}>
                <span>{section.label}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#333' }}>{summary}</span>
              </span>
              <span style={{ fontSize: 12 }}>{isOpen ? 'Hide' : 'Show'}</span>
            </button>
          )
        })}
      </div>

      <div
        style={{
          marginTop: 16,
          background: '#fff',
          border: '2px solid #111',
          borderRadius: 16,
          padding: 16,
          display: 'grid',
          gap: 10,
        }}
      >
        {loading && (
          <div style={{ padding: 14, borderRadius: 16, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Loading...
          </div>
        )}

        {!loading && (
          <>
            {sections.basic && (
              <>
                <div style={{ fontWeight: 950, fontSize: 18 }}>Basic</div>
                <input
                  placeholder="Event Logo URL (optional)"
                  value={form.event_logo_url}
                  onChange={(e) => setForm({ ...form, event_logo_url: e.target.value })}
                  style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                />
                <textarea
                  placeholder="Sponsor Logo URLs (1 per line)"
                  value={form.sponsor_logo_urls}
                  onChange={(e) => setForm({ ...form, sponsor_logo_urls: e.target.value })}
                  style={{ padding: 12, borderRadius: 12, border: '2px solid #111', minHeight: 90, fontWeight: 800 }}
                />
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Biaya Pendaftaran
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input
                      type="number"
                      min={0}
                      placeholder="Base Price"
                      value={form.base_price}
                      onChange={(e) => setForm({ ...form, base_price: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Extra Price"
                      value={form.extra_price}
                      onChange={(e) => setForm({ ...form, extra_price: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
                    Base = biaya per rider. Extra = biaya tambahan kategori ekstra.
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    FFA MIX Range
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input
                      type="number"
                      placeholder="FFA Min Year"
                      value={form.ffa_mix_min_year}
                      onChange={(e) => setForm({ ...form, ffa_mix_min_year: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                    <input
                      type="number"
                      placeholder="FFA Max Year"
                      value={form.ffa_mix_max_year}
                      onChange={(e) => setForm({ ...form, ffa_mix_max_year: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
                    Rider dalam rentang ini akan masuk kategori FFA-MIX.
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Jersey
                  </div>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={form.require_jersey_size}
                      onChange={(e) => setForm({ ...form, require_jersey_size: e.target.checked })}
                    />
                    Wajib isi ukuran jersey per rider
                  </label>
                  <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
                    Jika aktif, pendaftar harus memilih ukuran jersey (XS–XL).
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Scoring Rules
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <select
                      value={form.scoring_base_mode}
                      onChange={(e) => setForm({ ...form, scoring_base_mode: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    >
                      <option value="finish_order">finish_order</option>
                    </select>
                    <select
                      value={form.scoring_tie_breaker}
                      onChange={(e) => setForm({ ...form, scoring_tie_breaker: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    >
                      <option value="last_best">last_best</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <input
                      type="number"
                      min={0}
                      placeholder="DNS points"
                      value={form.scoring_dns_points}
                      onChange={(e) => setForm({ ...form, scoring_dns_points: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                    <input
                      placeholder="DNF points (number or 'last')"
                      value={form.scoring_dnf_points}
                      onChange={(e) => setForm({ ...form, scoring_dnf_points: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="DQ threshold"
                      value={form.scoring_dq_threshold}
                      onChange={(e) => setForm({ ...form, scoring_dq_threshold: e.target.value })}
                      style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
                    Scoring rules disimpan otomatis ke JSON scoring_rules saat Save.
                  </div>
                </div>
              </>
            )}

            {sections.appearance && (
              <>
                <div style={{ marginTop: 6, fontWeight: 950, fontSize: 18 }}>Display & Race Format</div>
                <div style={{ marginTop: 10, fontWeight: 900 }}>Display Theme</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <input
                    value={form.display_primary_color}
                    onChange={(e) => setForm({ ...form, display_primary_color: e.target.value })}
                    placeholder="Primary color"
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                  />
                  <input
                    value={form.display_secondary_color}
                    onChange={(e) => setForm({ ...form, display_secondary_color: e.target.value })}
                    placeholder="Secondary color"
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                  />
                  <input
                    value={form.display_header_bg}
                    onChange={(e) => setForm({ ...form, display_header_bg: e.target.value })}
                    placeholder="Header background"
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                  />
                  <input
                    value={form.display_card_bg}
                    onChange={(e) => setForm({ ...form, display_card_bg: e.target.value })}
                    placeholder="Card background"
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                  />
                </div>
                <input
                  value={form.display_logo_url}
                  onChange={(e) => setForm({ ...form, display_logo_url: e.target.value })}
                  placeholder="Logo URL (optional)"
                  style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                />
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontWeight: 900 }}>Upload Logo</div>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={logoUploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setLogoError('')
                      setLogoUploading(true)
                      try {
                        const url = await uploadLogo(file)
                        setForm((prev) => ({
                          ...prev,
                          event_logo_url: url,
                          display_logo_url: url,
                        }))
                      } catch (err: unknown) {
                        setLogoError(err instanceof Error ? err.message : 'Gagal upload logo.')
                      } finally {
                        setLogoUploading(false)
                      }
                    }}
                    style={{ padding: 8, borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
                  />
                  {logoUploading && <div style={{ fontWeight: 800 }}>Uploading...</div>}
                  {logoError && <div style={{ fontWeight: 800, color: '#b91c1c' }}>{logoError}</div>}
                  {form.event_logo_url && (
                    <img
                      src={form.event_logo_url}
                      alt="Event logo preview"
                      style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 12, border: '2px solid #111' }}
                    />
                  )}
                </div>
                <input
                  value={form.display_slogan}
                  onChange={(e) => setForm({ ...form, display_slogan: e.target.value })}
                  placeholder="Event slogan (optional)"
                  style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                />

                <div style={{ marginTop: 14, fontWeight: 900 }}>Race Format</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <input
                    type="number"
                    min={1}
                    value={form.race_moto_per_batch}
                    onChange={(e) => setForm({ ...form, race_moto_per_batch: e.target.value })}
                    placeholder="Moto per batch"
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                  />
                  <input
                    type="number"
                    min={1}
                    value={form.race_gate_positions}
                    onChange={(e) => setForm({ ...form, race_gate_positions: e.target.value })}
                    placeholder="Gate positions"
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={form.race_qualification_enabled}
                      onChange={(e) => setForm({ ...form, race_qualification_enabled: e.target.checked })}
                    />
                    Qualification enabled
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={form.race_auto_advance}
                      onChange={(e) => setForm({ ...form, race_auto_advance: e.target.checked })}
                    />
                    Auto advance
                  </label>
                </div>
                <input
                  value={form.race_final_classes}
                  onChange={(e) => setForm({ ...form, race_final_classes: e.target.value })}
                  placeholder="Final classes (comma)"
                  style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 800 }}
                />
              </>
            )}

          </>
        )}
      </div>

      {sections.advanced && (
        <div
          style={{
            marginTop: 24,
            background: '#fff',
            border: '2px solid #111',
            borderRadius: 16,
            padding: 16,
            display: 'grid',
            gap: 12,
          }}
        >
        <div style={{ fontWeight: 950, fontSize: 18 }}>Advanced Multi-Stage (Optional)</div>
        <div style={{ color: '#333', fontWeight: 700, fontSize: 13 }}>
          Aktifkan per category jika ingin memakai skema Qualification → Quarter → Semi → Finals. Default OFF.
        </div>

        {advancedLoading && (
          <div style={{ padding: 12, borderRadius: 12, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Loading advanced config...
          </div>
        )}

        {!advancedLoading && advancedItems.length === 0 && (
          <div style={{ padding: 12, borderRadius: 12, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Tidak ada kategori.
          </div>
        )}

        {!advancedLoading && advancedItems.length > 0 && (
          <div style={{ display: 'grid', gap: 10 }}>
            {advancedItems.map((item) => {
              const isOpen = advancedOpen[item.category.id] ?? false
              return (
              <div
                key={item.category.id}
                style={{
                  border: '2px solid #111',
                  borderRadius: 14,
                  padding: 12,
                  display: 'grid',
                  gap: 8,
                  background: '#eaf7ee',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontWeight: 900 }}>{item.category.label}</div>
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((prev) => ({ ...prev, [item.category.id]: !isOpen }))}
                    style={{
                      padding: '4px 8px',
                      borderRadius: 999,
                      border: '2px solid #111',
                      background: isOpen ? '#bfead2' : '#fff',
                      fontWeight: 900,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {isOpen ? 'Hide' : 'Show'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800 }}>
                    <input
                      type="checkbox"
                      checked={item.config?.enabled ?? false}
                      onChange={(e) => saveAdvanced(item.category.id, e.target.checked)}
                      disabled={advancedSaving}
                    />
                    Enable Advanced Stage
                  </label>
                  <button
                    type="button"
                    onClick={() => runQualification(item.category.id)}
                    disabled={advancedSaving || !(item.config?.enabled ?? false)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '2px solid #111',
                      background: item.config?.enabled ? '#bfead2' : '#eee',
                      fontWeight: 900,
                      cursor: item.config?.enabled ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Run Qualification
                  </button>
                  <button
                    type="button"
                    onClick={() => runAdvances(item.category.id)}
                    disabled={advancedSaving || !(item.config?.enabled ?? false)}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '2px solid #111',
                      background: item.config?.enabled ? '#d7ecff' : '#eee',
                      fontWeight: 900,
                      cursor: item.config?.enabled ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Compute QF/SF/Final
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePreview(item.category.id)}
                    disabled={advancedSaving}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 10,
                      border: '2px solid #111',
                      background: '#fff',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    {previewOpen[item.category.id] ? 'Hide Preview' : 'Preview Results'}
                  </button>
                </div>

                {isOpen && (
                  <>
                    <div style={{ marginTop: 8, fontWeight: 900 }}>Rules</div>
                    {(rulesByCategory[item.category.id] ?? []).length === 0 && (
                      <div style={{ fontWeight: 800, color: '#333' }}>Belum ada rules.</div>
                    )}
                    {(rulesByCategory[item.category.id] ?? []).map((rule, idx) => (
                      <div
                        key={`${item.category.id}-${idx}`}
                        style={{
                          padding: 10,
                          borderRadius: 12,
                          border: '2px solid #111',
                          background: '#fff',
                          display: 'grid',
                          gap: 6,
                          fontWeight: 800,
                        }}
                      >
                        <div>Min riders: {rule.min_riders}</div>
                        <div>
                          Stages: Q={rule.enable_qualification ? 'ON' : 'OFF'} | QF=
                          {rule.enable_quarter_final ? 'ON' : 'OFF'} | SF=
                          {rule.enable_semi_final ? 'ON' : 'OFF'}
                        </div>
                        <div>Final classes: {rule.enabled_final_classes.join(', ') || '-'}</div>
                        <button
                          type="button"
                          onClick={() => removeRule(item.category.id, idx)}
                          disabled={advancedSaving}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 10,
                            border: '2px solid #111',
                            background: '#ffd7d7',
                            fontWeight: 900,
                            cursor: 'pointer',
                            width: 'fit-content',
                          }}
                        >
                          Remove Rule
                        </button>
                      </div>
                    ))}

                    <div style={{ marginTop: 8, fontWeight: 900 }}>Add Rule</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      <input
                        type="number"
                        placeholder="min_riders"
                        value={draftRules[item.category.id]?.min_riders ?? 8}
                        onChange={(e) => updateDraft(item.category.id, { min_riders: Number(e.target.value) })}
                        style={{ padding: 10, borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
                      />
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {(
                          [
                            { key: 'enable_qualification', label: 'Qualification' },
                            { key: 'enable_quarter_final', label: 'Quarter Final' },
                            { key: 'enable_semi_final', label: 'Semi Final' },
                          ] as const
                        ).map((opt) => (
                          <label key={opt.key} style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 800 }}>
                            <input
                              type="checkbox"
                              checked={Boolean(draftRules[item.category.id]?.[opt.key])}
                              onChange={(e) =>
                                updateDraft(item.category.id, { [opt.key]: e.target.checked } as Partial<CategoryRule>)
                              }
                            />
                            {opt.label}
                          </label>
                        ))}
                      </div>
                      <input
                        placeholder="Final classes (comma)"
                        value={(draftRules[item.category.id]?.enabled_final_classes ?? []).join(',')}
                        onChange={(e) =>
                          updateDraft(item.category.id, {
                            enabled_final_classes: e.target.value
                              .split(',')
                              .map((v) => v.trim())
                              .filter(Boolean),
                          })
                        }
                        style={{ padding: 10, borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
                      />
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => addRule(item.category.id)}
                          disabled={advancedSaving}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 10,
                            border: '2px solid #111',
                            background: '#2ecc71',
                            fontWeight: 900,
                            cursor: 'pointer',
                          }}
                        >
                          Add Rule
                        </button>
                        <button
                          type="button"
                          onClick={() => saveRules(item.category.id)}
                          disabled={advancedSaving}
                          style={{
                            padding: '8px 12px',
                            borderRadius: 10,
                            border: '2px solid #111',
                            background: '#bfead2',
                            fontWeight: 900,
                            cursor: 'pointer',
                          }}
                        >
                          Save Rules
                        </button>
                      </div>
                    </div>

                    {previewOpen[item.category.id] && (
                      <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                        <div style={{ fontWeight: 900 }}>Stage Results Preview</div>
                        {previewLoading[item.category.id] ? (
                          <div style={{ fontWeight: 800 }}>Loading...</div>
                        ) : (stagePreview[item.category.id] ?? []).length === 0 ? (
                          <div style={{ fontWeight: 800 }}>Belum ada hasil stage.</div>
                        ) : (
                          ['QUALIFICATION', 'QUARTER_FINAL', 'SEMI_FINAL', 'FINAL'].map((stage) => {
                            const rows = (stagePreview[item.category.id] ?? []).filter((r) => r.stage === stage)
                            if (rows.length === 0) return null
                            return (
                              <div
                                key={stage}
                                style={{
                                  padding: 10,
                                  borderRadius: 12,
                                  border: '2px solid #111',
                                  background: '#fff',
                                  display: 'grid',
                                  gap: 6,
                                }}
                              >
                                <div style={{ fontWeight: 900 }}>{stage}</div>
                                {rows.map((r) => (
                                  <div
                                    key={r.id}
                                    style={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between' }}
                                  >
                                    <div>
                                      {r.riders?.no_plate_display ?? '-'} {r.riders?.name ?? '-'}
                                    </div>
                                    <div>
                                      {r.final_class ? `${r.final_class}` : r.position ? `Rank ${r.position}` : '-'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )
                          })
                        )}
                      </div>
                    )}

                    <div style={{ marginTop: 12, display: 'grid', gap: 6 }}>
                      <div style={{ fontWeight: 900 }}>Auto-Generate Summary</div>
                      <div style={{ fontWeight: 800, color: '#333' }}>
                        Stage results: Q={summaryByCategory[item.category.id]?.stageCounts?.QUALIFICATION ?? 0} | QF=
                        {summaryByCategory[item.category.id]?.stageCounts?.QUARTER_FINAL ?? 0} | SF=
                        {summaryByCategory[item.category.id]?.stageCounts?.SEMI_FINAL ?? 0} | F=
                        {summaryByCategory[item.category.id]?.stageCounts?.FINAL ?? 0}
                      </div>
                      <div style={{ fontWeight: 800, color: '#333' }}>
                        Motos: QF={summaryByCategory[item.category.id]?.motoCounts?.quarter ?? 0} | SF=
                        {summaryByCategory[item.category.id]?.motoCounts?.semi ?? 0} | Final=
                        {summaryByCategory[item.category.id]?.motoCounts?.final ?? 0}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )})}
          </div>
        )}
        </div>
      )}

      <div
        style={{
          position: 'sticky',
          bottom: 12,
          marginTop: 20,
          border: '2px solid #111',
          borderRadius: 16,
          background: '#fff',
          padding: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ display: 'grid', gap: 2 }}>
          <div style={{ fontWeight: 900 }}>Save Event Settings</div>
          <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
            {isDirty ? 'Unsaved changes' : `Saved: ${row?.updated_at ? new Date(row.updated_at).toLocaleString() : '-'}`}
          </div>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '10px 16px',
            borderRadius: 12,
            border: '2px solid #111',
            background: '#2ecc71',
            fontWeight: 950,
            cursor: 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}



