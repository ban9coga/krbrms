'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'

type FeatureFlags = {
  penalty_enabled: boolean
  absent_enabled: boolean
  dns_enabled: boolean
  dnf_enabled: boolean
}

type PenaltyRule = {
  id: string
  code: string
  description: string | null
  penalty_point: number
  applies_to_stage: 'MOTO' | 'QUARTER' | 'REPECHAGE' | 'SEMI' | 'FINAL' | 'ALL'
  is_active: boolean
  checker_enabled: boolean
  rd_enabled: boolean
}

type SafetyRequirement = {
  id: string
  label: string
  is_required: boolean
  sort_order?: number | null
  penalty_code?: string | null
  icon_key?: string | null
}

type RiderItem = {
  id: string
  name: string
  no_plate_display: string
  birth_year: number | null
  gender: 'BOY' | 'GIRL' | null
}

type RiderStatus = {
  rider_id: string
  participation_status: 'ACTIVE' | 'DNS' | 'DNF' | 'ABSENT'
  registration_order: number
}

type CategoryItem = {
  id: string
  label: string
  year: number | null
  gender?: string | null
}

type AdvancedConfig = {
  id: string
  event_id: string
  category_id: string
  enabled: boolean
  max_riders_per_race: number
  qualification_moto_count: number
  repechage_max_riders_per_race: number | null
  quarter_final_max_riders_per_race: number | null
  semi_final_max_riders_per_race: number | null
  dnf_point_override: number | null
  dns_point_override: number | null
}

type AdvancedCategoryItem = {
  category: CategoryItem
  config: AdvancedConfig | null
}

type RiderGroup = {
  id: string
  label: string
  year: number | null
  riders: RiderItem[]
}

const SAFETY_ICON_OPTIONS = [
  { key: 'helmet', icon: '⛑', shortLabel: 'Helm' },
  { key: 'gloves', icon: '🧤', shortLabel: 'Gloves' },
  { key: 'elbow', icon: '💪', shortLabel: 'Siku' },
  { key: 'knee', icon: '🦵', shortLabel: 'Lutut' },
  { key: 'jersey', icon: '👕', shortLabel: 'Jersey' },
  { key: 'shoes', icon: '👟', shortLabel: 'Sepatu' },
  { key: 'pants', icon: '🩳', shortLabel: 'Celana' },
]

function getSafetyVisual(label: string, iconKey?: string | null) {
  if (iconKey) {
    const matched = SAFETY_ICON_OPTIONS.find((option) => option.key === iconKey)
    if (matched) return matched
  }

  const normalized = label.toLowerCase()

  if (normalized.includes('helm') || normalized.includes('helmet')) {
    return SAFETY_ICON_OPTIONS[0]
  }
  if (normalized.includes('sarung tangan') || normalized.includes('glove') || normalized.includes('gloves')) {
    return SAFETY_ICON_OPTIONS[1]
  }
  if (normalized.includes('siku') || normalized.includes('elbow')) {
    return SAFETY_ICON_OPTIONS[2]
  }
  if (normalized.includes('lutut') || normalized.includes('knee')) {
    return SAFETY_ICON_OPTIONS[3]
  }
  if (normalized.includes('jersey')) {
    return SAFETY_ICON_OPTIONS[4]
  }
  if (normalized.includes('sepatu') || normalized.includes('shoe')) {
    return SAFETY_ICON_OPTIONS[5]
  }
  if (normalized.includes('celana') || normalized.includes('pants')) {
    return SAFETY_ICON_OPTIONS[6]
  }

  return { icon: '✓', shortLabel: label }
}

const sortCategories = (a: CategoryItem, b: CategoryItem) => {
  const ay = a.year ?? -1
  const by = b.year ?? -1
  if (ay === by) return a.label.localeCompare(b.label)
  return by - ay
}

const createDefaultAdvancedConfig = (eventId: string, categoryId: string): AdvancedConfig => ({
  id: '',
  event_id: eventId,
  category_id: categoryId,
  enabled: false,
  max_riders_per_race: 8,
  qualification_moto_count: 2,
  repechage_max_riders_per_race: null,
  quarter_final_max_riders_per_race: null,
  semi_final_max_riders_per_race: null,
  dnf_point_override: null,
  dns_point_override: null,
})

export default function PenaltiesClient({ eventId }: { eventId: string }) {
  const [flags, setFlags] = useState<FeatureFlags | null>(null)
  const [rules, setRules] = useState<PenaltyRule[]>([])
  const [requirements, setRequirements] = useState<SafetyRequirement[]>([])
  const [statuses, setStatuses] = useState<Record<string, RiderStatus>>({})
  const [groups, setGroups] = useState<RiderGroup[]>([])
  const [advancedItems, setAdvancedItems] = useState<AdvancedCategoryItem[]>([])
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null)
  const [editingRequirementId, setEditingRequirementId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [ruleForm, setRuleForm] = useState({
    code: '',
    description: '',
    penalty_point: '',
    applies_to_stage: 'ALL' as PenaltyRule['applies_to_stage'],
    is_active: true,
    checker_enabled: true,
    rd_enabled: true,
  })
  const [requirementForm, setRequirementForm] = useState({
    label: '',
    sort_order: '',
    is_required: true,
    icon_key: '',
  })

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    if (data.session?.access_token) return data.session.access_token
    const refreshed = await supabase.auth.refreshSession()
    return refreshed.data.session?.access_token ?? null
  }, [])

  const apiFetch = useCallback(async (url: string, options: RequestInit = {}, retryUnauthorized = true) => {
    const token = await getToken()
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 401 && retryUnauthorized) {
        return apiFetch(url, options, false)
      }
      if (res.status === 401) {
        throw new Error('Session login habis. Silakan login ulang.')
      }
      throw new Error(json?.error || 'Request failed')
    }
    return json
  }, [getToken])

  const loadAll = async () => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const [flagRes, ruleRes, statusRes, reqRes, advancedRes] = await Promise.all([
        apiFetch(`/api/events/${eventId}/modules`),
        apiFetch(`/api/events/${eventId}/penalties`),
        apiFetch(`/api/events/${eventId}/rider-status`),
        apiFetch(`/api/events/${eventId}/safety-requirements`),
        apiFetch(`/api/events/${eventId}/advanced-race`),
      ])
      const flagJson = flagRes
      const ruleJson = ruleRes
      const statusJson = statusRes
      const reqJson = reqRes
      const advancedJson = advancedRes

      setFlags(flagJson.data ?? { penalty_enabled: false, absent_enabled: false, dns_enabled: false, dnf_enabled: false })
      setRules(ruleJson.data ?? [])
      setRequirements(reqJson.data ?? [])
      const advancedCategories = (advancedJson.data?.categories ?? []) as CategoryItem[]
      const advancedConfigs = (advancedJson.data?.configs ?? []) as AdvancedConfig[]
      const advancedConfigMap = new Map(advancedConfigs.map((config) => [config.category_id, config]))
      setAdvancedItems(
        [...advancedCategories]
          .sort(sortCategories)
          .map((category) => ({
            category,
            config: advancedConfigMap.get(category.id) ?? null,
          }))
      )

      const map: Record<string, RiderStatus> = {}
      for (const row of statusJson.data ?? []) {
        map[row.rider_id] = row
      }
      setStatuses(map)

      const fetchRiders = async (params: Record<string, string>) => {
        const all: RiderItem[] = []
        let page = 1
        const pageSize = 200
        let total = 0
        do {
          const qs = new URLSearchParams({
            event_id: eventId,
            page: String(page),
            page_size: String(pageSize),
            ...params,
          })
          const res = await fetch(`/api/riders?${qs.toString()}`)
          const json = await res.json()
          const rows = (json.data ?? []) as RiderItem[]
          total = Number(json.total ?? 0)
          all.push(...rows)
          page++
        } while (all.length < total)
        return all
      }

      const [allRiders, categoryRes] = await Promise.all([
        fetchRiders({}),
        fetch(`/api/events/${eventId}/categories`),
      ])
      const categoryJson = await categoryRes.json()
      const categories = ((categoryJson.data ?? []) as CategoryItem[]).sort(sortCategories)

      const groupedRaw = await Promise.all(
        categories.map(async (category) => {
          const categoryRiders = await fetchRiders({ category_id: category.id })
          return { id: category.id, label: category.label, year: category.year ?? null, riders: categoryRiders }
        })
      )

      const categorizedIds = new Set<string>()
      for (const group of groupedRaw) {
        for (const rider of group.riders) categorizedIds.add(rider.id)
      }
      const uncategorized = allRiders.filter((r) => !categorizedIds.has(r.id))

      const grouped = groupedRaw
        .filter((group) => group.riders.length > 0)
        .sort((a, b) => sortCategories(a, b))

      if (uncategorized.length > 0) {
        grouped.push({ id: 'uncategorized', label: 'Uncategorized', year: null, riders: uncategorized })
      }

      setGroups(grouped)
      setExpandedCategoryId((prev) => {
        if (prev && grouped.some((g) => g.id === prev)) return prev
        return grouped[0]?.id ?? null
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal memuat data penalties.'
      setErrorMessage(message)
      alert(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!eventId) return
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const saveFlags = async (next: FeatureFlags) => {
    setSaving(true)
    try {
      const json = await apiFetch(`/api/events/${eventId}/modules`, {
        method: 'PATCH',
        body: JSON.stringify(next),
      })
      setFlags(json.data)
      setErrorMessage(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan feature flags.'
      setErrorMessage(message)
      alert(message)
    } finally {
      setSaving(false)
    }
  }

  const handleCreateRule = async () => {
    if (!ruleForm.code.trim() || !ruleForm.penalty_point.trim()) {
      alert('Code dan Penalty Point wajib diisi.')
      return
    }
    setSaving(true)
    try {
      await apiFetch(`/api/events/${eventId}/penalties`, {
        method: 'POST',
        body: JSON.stringify({
          code: ruleForm.code.trim(),
          description: ruleForm.description.trim() || null,
          penalty_point: Number(ruleForm.penalty_point),
          applies_to_stage: ruleForm.applies_to_stage,
          is_active: ruleForm.is_active,
          checker_enabled: ruleForm.checker_enabled,
          rd_enabled: ruleForm.rd_enabled,
        }),
      })
      setRuleForm({
        code: '',
        description: '',
        penalty_point: '',
        applies_to_stage: 'ALL',
        is_active: true,
        checker_enabled: true,
        rd_enabled: true,
      })
      await loadAll()
      setErrorMessage(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menambah penalty rule.'
      setErrorMessage(message)
      alert(message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRule = async (rule: PenaltyRule) => {
    setSaving(true)
    try {
      await apiFetch(`/api/events/${eventId}/penalties/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify(rule),
      })
      await loadAll()
      setErrorMessage(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan penalty rule.'
      setErrorMessage(message)
      alert(message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Hapus rule ini?')) return
    setSaving(true)
    try {
      await apiFetch(`/api/events/${eventId}/penalties/${ruleId}`, { method: 'DELETE' })
      await loadAll()
      setErrorMessage(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menghapus penalty rule.'
      setErrorMessage(message)
      alert(message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRequirement = async (req: SafetyRequirement) => {
    setSaving(true)
    try {
      await apiFetch(`/api/events/${eventId}/safety-requirements`, {
        method: 'PATCH',
        body: JSON.stringify({
          id: req.id,
          label: req.label,
          is_required: req.is_required,
          sort_order: req.sort_order ?? 0,
          penalty_code: req.penalty_code ?? null,
          icon_key: req.icon_key ?? null,
        }),
      })
      await loadAll()
      setEditingRequirementId(null)
      setErrorMessage(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan safety mapping.'
      setErrorMessage(message)
      alert(message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRequirement = async (requirementId: string) => {
    if (!confirm('Hapus safety requirement ini?')) return
    setSaving(true)
    try {
      await apiFetch(`/api/events/${eventId}/safety-requirements`, {
        method: 'DELETE',
        body: JSON.stringify({ id: requirementId }),
      })
      await loadAll()
      if (editingRequirementId === requirementId) setEditingRequirementId(null)
      setErrorMessage(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menghapus safety requirement.'
      setErrorMessage(message)
      alert(message)
    } finally {
      setSaving(false)
    }
  }

  const updatePointOverrideDraft = (categoryId: string, patch: Partial<AdvancedConfig>) => {
    setAdvancedItems((prev) =>
      prev.map((item) => {
        if (item.category.id !== categoryId) return item
        return {
          ...item,
          config: {
            ...(item.config ?? createDefaultAdvancedConfig(eventId, categoryId)),
            ...patch,
          },
        }
      })
    )
  }

  const handleSavePointOverrides = async (categoryId: string) => {
    const currentItem = advancedItems.find((item) => item.category.id === categoryId)
    if (!currentItem) return
    const currentConfig = currentItem.config ?? createDefaultAdvancedConfig(eventId, categoryId)

    setSaving(true)
    try {
      await apiFetch(`/api/events/${eventId}/advanced-race`, {
        method: 'POST',
        body: JSON.stringify({
          category_id: categoryId,
          enabled: currentConfig.enabled,
          max_riders_per_race: currentConfig.max_riders_per_race,
          qualification_moto_count: currentConfig.qualification_moto_count,
          repechage_max_riders_per_race: currentConfig.repechage_max_riders_per_race,
          quarter_final_max_riders_per_race: currentConfig.quarter_final_max_riders_per_race,
          semi_final_max_riders_per_race: currentConfig.semi_final_max_riders_per_race,
          dnf_point_override: currentConfig.dnf_point_override,
          dns_point_override: currentConfig.dns_point_override,
        }),
      })
      await loadAll()
      setErrorMessage(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan DNF/DNS point override.'
      setErrorMessage(message)
      alert(message)
    } finally {
      setSaving(false)
    }
  }

  const checkerRules = rules.filter((rule) => rule.is_active && rule.checker_enabled)
  const rdRules = rules.filter((rule) => rule.is_active && rule.rd_enabled)

  const handleCreateRequirement = async () => {
    if (!requirementForm.label.trim()) {
      alert('Label safety wajib diisi.')
      return
    }
    setSaving(true)
    try {
      await apiFetch(`/api/events/${eventId}/safety-requirements`, {
        method: 'POST',
        body: JSON.stringify({
          label: requirementForm.label.trim(),
          sort_order: requirementForm.sort_order.trim() ? Number(requirementForm.sort_order) : 0,
          is_required: requirementForm.is_required,
          icon_key: requirementForm.icon_key || null,
        }),
      })
      setRequirementForm({ label: '', sort_order: '', is_required: true, icon_key: '' })
      await loadAll()
      setErrorMessage(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menambah safety requirement.'
      setErrorMessage(message)
      alert(message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveStatus = async (riderId: string, status: RiderStatus['participation_status'], order: number) => {
    setSaving(true)
    try {
      await apiFetch(`/api/events/${eventId}/rider-status`, {
        method: 'POST',
        body: JSON.stringify({
          rider_id: riderId,
          participation_status: status,
          registration_order: order,
        }),
      })
      await loadAll()
      setErrorMessage(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan rider status.'
      setErrorMessage(message)
      alert(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Penalties & Participation</h1>
      <div style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
        Modul ini optional dan hanya aktif jika di-enable untuk event ini.
      </div>
      {errorMessage && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 12,
            border: '2px solid #b91c1c',
            background: '#fee2e2',
            color: '#991b1b',
            fontWeight: 800,
          }}
        >
          {errorMessage}
        </div>
      )}

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
        <div style={{ fontWeight: 950 }}>Feature Flags</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 900 }}>
            <input
              type="checkbox"
              checked={flags?.penalty_enabled ?? false}
              onChange={(e) =>
                saveFlags({
                  penalty_enabled: e.target.checked,
                  absent_enabled: flags?.absent_enabled ?? false,
                  dns_enabled: flags?.dns_enabled ?? false,
                  dnf_enabled: flags?.dnf_enabled ?? false,
                })
              }
            />
            Enable Penalty Module
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 900 }}>
            <input
              type="checkbox"
              checked={flags?.absent_enabled ?? false}
              onChange={(e) =>
                saveFlags({
                  penalty_enabled: flags?.penalty_enabled ?? false,
                  absent_enabled: e.target.checked,
                  dns_enabled: flags?.dns_enabled ?? false,
                  dnf_enabled: flags?.dnf_enabled ?? false,
                })
              }
            />
            Enable Absent Module
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 900 }}>
            <input
              type="checkbox"
              checked={flags?.dns_enabled ?? false}
              onChange={(e) =>
                saveFlags({
                  penalty_enabled: flags?.penalty_enabled ?? false,
                  absent_enabled: flags?.absent_enabled ?? false,
                  dns_enabled: e.target.checked,
                  dnf_enabled: flags?.dnf_enabled ?? false,
                })
              }
            />
            Enable DNS Module
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 900 }}>
            <input
              type="checkbox"
              checked={flags?.dnf_enabled ?? false}
              onChange={(e) =>
                saveFlags({
                  penalty_enabled: flags?.penalty_enabled ?? false,
                  absent_enabled: flags?.absent_enabled ?? false,
                  dns_enabled: flags?.dns_enabled ?? false,
                  dnf_enabled: e.target.checked,
                })
              }
            />
            Enable DNF Module
          </label>
        </div>
        <div style={{ display: 'grid', gap: 6, fontSize: 12, fontWeight: 800, color: '#334155' }}>
          <div>DNS module: checker bisa menandai rider DNS. Nilai rider otomatis dihitung sebagai jumlah rider + 2.</div>
          <div>DNF module: finisher bisa menandai rider DNF. Nilai rider otomatis dihitung sebagai posisi terakhir.</div>
        </div>
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
        <div style={{ fontWeight: 950, fontSize: 18 }}>Penalty Rules</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <input
            placeholder="Code (unique)"
            value={ruleForm.code}
            onChange={(e) => setRuleForm({ ...ruleForm, code: e.target.value })}
            style={{ padding: 10, borderRadius: 10, border: '2px solid #111' }}
          />
          <input
            placeholder="Description"
            value={ruleForm.description}
            onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })}
            style={{ padding: 10, borderRadius: 10, border: '2px solid #111' }}
          />
          <input
            placeholder="Penalty Point"
            inputMode="numeric"
            value={ruleForm.penalty_point}
            onChange={(e) => setRuleForm({ ...ruleForm, penalty_point: e.target.value.replace(/[^\d]/g, '') })}
            style={{ padding: 10, borderRadius: 10, border: '2px solid #111' }}
          />
          <select
            value={ruleForm.applies_to_stage}
            onChange={(e) => setRuleForm({ ...ruleForm, applies_to_stage: e.target.value as PenaltyRule['applies_to_stage'] })}
            style={{ padding: 10, borderRadius: 10, border: '2px solid #111', fontWeight: 900 }}
          >
            {['MOTO', 'QUARTER', 'REPECHAGE', 'SEMI', 'FINAL', 'ALL'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 900 }}>
            <input
              type="checkbox"
              checked={ruleForm.is_active}
              onChange={(e) => setRuleForm({ ...ruleForm, is_active: e.target.checked })}
            />
            Active
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 900 }}>
            <input
              type="checkbox"
              checked={ruleForm.checker_enabled}
              onChange={(e) => setRuleForm({ ...ruleForm, checker_enabled: e.target.checked })}
            />
            Checker Auto
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 900 }}>
            <input
              type="checkbox"
              checked={ruleForm.rd_enabled}
              onChange={(e) => setRuleForm({ ...ruleForm, rd_enabled: e.target.checked })}
            />
            RD Manual
          </label>
          <button
            type="button"
            onClick={handleCreateRule}
            disabled={saving}
            style={{ padding: 12, borderRadius: 12, border: '2px solid #111', background: '#2ecc71', fontWeight: 900 }}
          >
            {saving ? 'Saving...' : 'Add Rule'}
          </button>
        </div>

        <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
          {rules.map((rule) => (
            <div key={rule.id} style={{ padding: 10, border: '2px solid #111', borderRadius: 12, background: '#fff' }}>
              <div style={{ fontWeight: 900 }}>{rule.code}</div>
              <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
                {rule.description || '-'} • {rule.penalty_point} pts • {rule.applies_to_stage}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={rule.is_active}
                    onChange={(e) => setRules((prev) => prev.map((r) => (r.id === rule.id ? { ...r, is_active: e.target.checked } : r)))}
                  />
                  Active
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={rule.checker_enabled}
                    onChange={(e) =>
                      setRules((prev) =>
                        prev.map((r) => (r.id === rule.id ? { ...r, checker_enabled: e.target.checked } : r))
                      )
                    }
                  />
                  Checker Auto
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={rule.rd_enabled}
                    onChange={(e) =>
                      setRules((prev) =>
                        prev.map((r) => (r.id === rule.id ? { ...r, rd_enabled: e.target.checked } : r))
                      )
                    }
                  />
                  RD Manual
                </label>
                <button
                  type="button"
                  onClick={() => handleSaveRule(rule)}
                  disabled={saving}
                  style={{ padding: '6px 10px', borderRadius: 10, border: '2px solid #111', background: '#2ecc71', fontWeight: 900 }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteRule(rule.id)}
                  disabled={saving}
                  style={{ padding: '6px 10px', borderRadius: 10, border: '2px solid #b40000', background: '#ffd7d7', color: '#b40000', fontWeight: 900 }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
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
        <div style={{ fontWeight: 950, fontSize: 18 }}>Safety Checklist Mapping</div>
        <div style={{ fontSize: 12, color: '#444', fontWeight: 700 }}>
          Hubungkan item safety dengan penalty rule. Hanya rules dengan toggle Checker Auto ON yang muncul di sini.
        </div>
        <div
          style={{
            display: 'grid',
            gap: 8,
            padding: 12,
            borderRadius: 12,
            border: '2px solid #111',
            background: '#f9fafb',
          }}
        >
          <div style={{ fontWeight: 900 }}>Add Safety Requirement</div>
          {requirementForm.label.trim() && (
            <div
              style={{
                display: 'inline-grid',
                justifyItems: 'center',
                alignContent: 'center',
                gap: 4,
                minHeight: 78,
                width: 112,
                padding: 10,
                borderRadius: 12,
                border: '2px solid #111',
                background: '#e5e7eb',
                color: '#111',
                fontWeight: 900,
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 24, lineHeight: 1 }}>
                {getSafetyVisual(requirementForm.label, requirementForm.icon_key || null).icon}
              </span>
              <span style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.1 }}>
                {getSafetyVisual(requirementForm.label, requirementForm.icon_key || null).shortLabel}
              </span>
            </div>
          )}
          <input
            placeholder="Label (contoh: Helm, Pelindung Lutut, Sarung Tangan)"
            value={requirementForm.label}
            onChange={(e) => setRequirementForm((prev) => ({ ...prev, label: e.target.value }))}
            style={{ padding: 10, borderRadius: 10, border: '2px solid #111' }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, alignItems: 'center' }}>
            <input
              placeholder="Sort Order"
              inputMode="numeric"
              value={requirementForm.sort_order}
              onChange={(e) =>
                setRequirementForm((prev) => ({ ...prev, sort_order: e.target.value.replace(/[^\d-]/g, '') }))
              }
              style={{ padding: 10, borderRadius: 10, border: '2px solid #111' }}
            />
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 900 }}>
              <input
                type="checkbox"
                checked={requirementForm.is_required}
                onChange={(e) => setRequirementForm((prev) => ({ ...prev, is_required: e.target.checked }))}
              />
              Required
            </label>
          </div>
          <select
            value={requirementForm.icon_key}
            onChange={(e) => setRequirementForm((prev) => ({ ...prev, icon_key: e.target.value }))}
            style={{ padding: 10, borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
          >
            <option value="">Auto detect dari label</option>
            {SAFETY_ICON_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.icon} {option.shortLabel}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleCreateRequirement}
            disabled={saving}
            style={{
              padding: 10,
              borderRadius: 10,
              border: '2px solid #111',
              background: '#2ecc71',
              fontWeight: 900,
            }}
          >
            {saving ? 'Saving...' : 'Add Requirement'}
          </button>
        </div>
        {requirements.length === 0 && (
          <div style={{ padding: 12, borderRadius: 12, border: '2px dashed #111' }}>Belum ada safety requirements.</div>
        )}
        <div style={{ display: 'grid', gap: 10 }}>
          {requirements.map((req) => {
            const visual = getSafetyVisual(req.label, req.icon_key)
            const isEditing = editingRequirementId === req.id
            return (
            <div key={req.id} style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 12, border: '2px solid #111' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div
                  style={{
                    display: 'inline-grid',
                    justifyItems: 'center',
                    alignContent: 'center',
                    gap: 4,
                    minHeight: 74,
                    width: 96,
                    padding: 8,
                    borderRadius: 12,
                    border: '2px solid #111',
                    background: '#f1f5f9',
                    color: '#111',
                    fontWeight: 900,
                  }}
                  title={req.label}
                >
                  <span aria-hidden="true" style={{ fontSize: 24, lineHeight: 1 }}>
                    {visual.icon}
                  </span>
                  <span style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.1 }}>
                    {visual.shortLabel}
                  </span>
                </div>
                <div>
                  <div style={{ fontWeight: 900 }}>{req.label}</div>
                  <div style={{ fontSize: 11, color: '#333', fontWeight: 700 }}>
                    Preview tombol checker
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setEditingRequirementId(isEditing ? null : req.id)}
                    disabled={saving}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 10,
                      border: '2px solid #111',
                      background: isEditing ? '#e0f2fe' : '#fff',
                      fontWeight: 900,
                    }}
                  >
                    {isEditing ? 'Cancel Edit' : 'Edit'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteRequirement(req.id)}
                    disabled={saving}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 10,
                      border: '2px solid #b40000',
                      background: '#ffd7d7',
                      color: '#b40000',
                      fontWeight: 900,
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#333', fontWeight: 700 }}>
                Sort: {req.sort_order ?? 0} | {req.is_required ? 'Required' : 'Optional'}
              </div>
              {isEditing && (
                <div style={{ display: 'grid', gap: 8, padding: 10, borderRadius: 12, border: '2px solid #cbd5e1', background: '#f8fafc' }}>
                  <input
                    placeholder="Label"
                    value={req.label}
                    onChange={(e) =>
                      setRequirements((prev) =>
                        prev.map((r) => (r.id === req.id ? { ...r, label: e.target.value } : r))
                      )
                    }
                    style={{ padding: '8px 10px', borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, alignItems: 'center' }}>
                    <input
                      placeholder="Sort Order"
                      inputMode="numeric"
                      value={String(req.sort_order ?? 0)}
                      onChange={(e) =>
                        setRequirements((prev) =>
                          prev.map((r) =>
                            r.id === req.id
                              ? { ...r, sort_order: e.target.value.trim() ? Number(e.target.value.replace(/[^\d-]/g, '')) : 0 }
                              : r
                          )
                        )
                      }
                      style={{ padding: '8px 10px', borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
                    />
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 900 }}>
                      <input
                        type="checkbox"
                        checked={req.is_required}
                        onChange={(e) =>
                          setRequirements((prev) =>
                            prev.map((r) => (r.id === req.id ? { ...r, is_required: e.target.checked } : r))
                          )
                        }
                      />
                      Required
                    </label>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={req.icon_key ?? ''}
                  onChange={(e) =>
                    setRequirements((prev) =>
                      prev.map((r) => (r.id === req.id ? { ...r, icon_key: e.target.value || null } : r))
                    )
                  }
                  style={{ padding: '8px 10px', borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
                >
                  <option value="">Auto icon</option>
                  {SAFETY_ICON_OPTIONS.map((option) => (
                    <option key={`${req.id}-${option.key}`} value={option.key}>
                      {option.icon} {option.shortLabel}
                    </option>
                  ))}
                </select>
                <select
                  value={req.penalty_code ?? ''}
                  onChange={(e) =>
                    setRequirements((prev) =>
                      prev.map((r) => (r.id === req.id ? { ...r, penalty_code: e.target.value || null } : r))
                    )
                  }
                  style={{ padding: '8px 10px', borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
                >
                  <option value="">-- Not linked --</option>
                  {checkerRules.map((rule) => (
                    <option key={rule.id} value={rule.code}>
                      {rule.code} | {rule.penalty_point} pts
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleSaveRequirement(req)}
                  disabled={saving}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 10,
                    border: '2px solid #111',
                    background: '#2ecc71',
                    fontWeight: 900,
                  }}
                >
                  Save {isEditing ? 'Requirement' : 'Mapping'}
                </button>
              </div>
              {req.is_required && (
                <div style={{ fontSize: 11, fontWeight: 800, color: '#b45309' }}>
                  Required: penalty_code wajib ada.
                </div>
              )}
            </div>
          )})}
        </div>
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
        <div style={{ fontWeight: 950, fontSize: 18 }}>DNF / DNS Point Override</div>
        <div style={{ fontSize: 12, color: '#444', fontWeight: 700 }}>
          Override point DNF dan DNS dipindah ke halaman Penalties supaya satu napas dengan aturan scoring event. Data tetap disimpan per kategori.
        </div>
        {advancedItems.length === 0 ? (
          <div style={{ padding: 12, borderRadius: 12, border: '2px dashed #111', fontWeight: 800 }}>
            Belum ada kategori.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {advancedItems.map((item) => {
              const config = item.config ?? createDefaultAdvancedConfig(eventId, item.category.id)
              return (
                <div
                  key={item.category.id}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: '2px solid #111',
                    background: '#f8fafc',
                    display: 'grid',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 900 }}>{item.category.label}</div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#475569' }}>
                      AMS {config.enabled ? 'ON' : 'OFF'}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                    <input
                      type="number"
                      min={1}
                      placeholder="DNF point override"
                      value={config.dnf_point_override ?? ''}
                      onChange={(e) =>
                        updatePointOverrideDraft(item.category.id, {
                          dnf_point_override: e.target.value.trim() ? Math.max(1, Number(e.target.value)) : null,
                        })
                      }
                      style={{ padding: 10, borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
                    />
                    <input
                      type="number"
                      min={1}
                      placeholder="DNS point override"
                      value={config.dns_point_override ?? ''}
                      onChange={(e) =>
                        updatePointOverrideDraft(item.category.id, {
                          dns_point_override: e.target.value.trim() ? Math.max(1, Number(e.target.value)) : null,
                        })
                      }
                      style={{ padding: 10, borderRadius: 10, border: '2px solid #111', fontWeight: 800 }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: '#475569', fontWeight: 700 }}>
                    Kosongkan field kalau mau pakai aturan default sistem.
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleSavePointOverrides(item.category.id)}
                      disabled={saving}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        border: '2px solid #111',
                        background: '#dbeafe',
                        fontWeight: 900,
                      }}
                    >
                      Save Point Override
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
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
        <div style={{ fontWeight: 950, fontSize: 18 }}>RD Penalty Rules</div>
        <div style={{ fontSize: 12, color: '#444', fontWeight: 700 }}>
          Rules dengan toggle RD Manual ON akan tersedia di panel Race Director untuk keputusan manual, termasuk kasus pelanggaran wali rider yang berdampak ke rider.
        </div>
        {rdRules.length === 0 ? (
          <div style={{ padding: 12, borderRadius: 12, border: '2px dashed #111', fontWeight: 800 }}>
            Belum ada rule yang diaktifkan untuk RD.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {rdRules.map((rule) => (
              <div key={`rd-${rule.id}`} style={{ padding: 12, borderRadius: 12, border: '2px solid #111', background: '#f8fafc' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 900 }}>{rule.code}</div>
                  <div style={{ fontSize: 11, fontWeight: 900, color: '#475569' }}>
                    {rule.penalty_point} pts | {rule.applies_to_stage}
                  </div>
                </div>
                <div style={{ marginTop: 6, fontSize: 12, color: '#334155', fontWeight: 700 }}>
                  {rule.description || 'Tanpa deskripsi'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {false && (
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
        <div style={{ fontWeight: 950, fontSize: 18 }}>Mark ABSENT</div> 
        {loading && <div style={{ fontWeight: 900 }}>Loading...</div>}
        {!loading && groups.length === 0 && (
          <div style={{ padding: 12, borderRadius: 12, border: '2px dashed #111' }}>No riders.</div>
        )}
        <div style={{ display: 'grid', gap: 12 }}>
          {groups.map((group) => {
            const isOpen = expandedCategoryId === group.id
            return (
              <div key={group.id} style={{ border: '2px solid #111', borderRadius: 14, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setExpandedCategoryId(isOpen ? null : group.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 14px',
                    background: isOpen ? '#eaf7ee' : '#fff',
                    border: 'none',
                    borderBottom: '2px solid #111',
                    fontWeight: 950,
                    cursor: 'pointer',
                  }}
                >
                  {group.label} ({group.riders.length})
                </button>
                {isOpen && (
                  <div style={{ display: 'grid', gap: 8, padding: 12 }}>
                    {group.riders.map((r, idx) => {
                      const statusRow = statuses[r.id]
                      const statusValue = statusRow?.participation_status ?? 'ACTIVE'
                      const orderValue = statusRow?.registration_order ?? idx + 1
                      const statusOptions: RiderStatus['participation_status'][] = ['ACTIVE', 'DNS', 'DNF', 'ABSENT']
                      return (
                        <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center' }}>
                          <div style={{ fontWeight: 900 }}>{r.no_plate_display} • {r.name}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {statusOptions.map((option) => {
                              const isActive = statusValue === option
                              return (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() =>
                                    setStatuses((prev) => ({
                                      ...prev,
                                      [r.id]: { rider_id: r.id, participation_status: option, registration_order: orderValue },
                                    }))
                                  }
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: 999,
                                    border: '2px solid #111',
                                    background: isActive ? '#dcfce7' : '#fff',
                                    color: '#111',
                                    fontWeight: 900,
                                    cursor: 'pointer',
                                  }}
                                >
                                  {option}
                                </button>
                              )
                            })}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSaveStatus(r.id, statuses[r.id]?.participation_status ?? statusValue, orderValue)}
                            disabled={saving}
                            style={{ padding: '6px 10px', borderRadius: 10, border: '2px solid #111', background: '#fff', fontWeight: 900 }}
                          >
                            Save
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div> 
      </div> 
      )}
    </div>
  )
}

