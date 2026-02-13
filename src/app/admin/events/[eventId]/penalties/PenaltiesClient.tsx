'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'

type FeatureFlags = {
  penalty_enabled: boolean
  absent_enabled: boolean
}

type PenaltyRule = {
  id: string
  code: string
  description: string | null
  penalty_point: number
  applies_to_stage: 'MOTO' | 'QUARTER' | 'SEMI' | 'FINAL' | 'ALL'
  is_active: boolean
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

type RiderGroup = {
  id: string
  label: string
  year: number | null
  riders: RiderItem[]
}

export default function PenaltiesClient({ eventId }: { eventId: string }) {
  const [flags, setFlags] = useState<FeatureFlags | null>(null)
  const [rules, setRules] = useState<PenaltyRule[]>([])
  const [statuses, setStatuses] = useState<Record<string, RiderStatus>>({})
  const [groups, setGroups] = useState<RiderGroup[]>([])
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [ruleForm, setRuleForm] = useState({
    code: '',
    description: '',
    penalty_point: '',
    applies_to_stage: 'ALL' as PenaltyRule['applies_to_stage'],
    is_active: true,
  })

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json?.error || 'Request failed')
    return json
  }

  const loadAll = async () => {
    setLoading(true)
    try {
      const [flagRes, ruleRes, statusRes] = await Promise.all([
        fetch(`/api/events/${eventId}/modules`),
        fetch(`/api/events/${eventId}/penalties`),
        fetch(`/api/events/${eventId}/rider-status`),
      ])
      const flagJson = await flagRes.json()
      const ruleJson = await ruleRes.json()
      const statusJson = await statusRes.json()

      setFlags(flagJson.data ?? { penalty_enabled: false, absent_enabled: false })
      setRules(ruleJson.data ?? [])

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
      const categories = (categoryJson.data ?? []) as CategoryItem[]

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
        .sort((a, b) => {
          const ay = a.year ?? -1
          const by = b.year ?? -1
          if (ay === by) return a.label.localeCompare(b.label)
          return by - ay
        })

      if (uncategorized.length > 0) {
        grouped.push({ id: 'uncategorized', label: 'Uncategorized', year: null, riders: uncategorized })
      }

      setGroups(grouped)
      setExpandedCategoryId((prev) => {
        if (prev && grouped.some((g) => g.id === prev)) return prev
        return grouped[0]?.id ?? null
      })
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
        }),
      })
      setRuleForm({ code: '', description: '', penalty_point: '', applies_to_stage: 'ALL', is_active: true })
      await loadAll()
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
              onChange={(e) => saveFlags({ penalty_enabled: e.target.checked, absent_enabled: flags?.absent_enabled ?? false })}
            />
            Enable Penalty Module
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 900 }}>
            <input
              type="checkbox"
              checked={flags?.absent_enabled ?? false}
              onChange={(e) => saveFlags({ penalty_enabled: flags?.penalty_enabled ?? false, absent_enabled: e.target.checked })}
            />
            Enable Absent Module
          </label>
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
            {['MOTO','QUARTER','SEMI','FINAL','ALL'].map((s) => (
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
                      return (
                        <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center' }}>
                          <div style={{ fontWeight: 900 }}>{r.no_plate_display} • {r.name}</div>
                          <select
                            value={statusValue}
                            onChange={(e) => {
                              const next = e.target.value as RiderStatus['participation_status']
                              setStatuses((prev) => ({ ...prev, [r.id]: { rider_id: r.id, participation_status: next, registration_order: orderValue } }))
                            }}
                            style={{ padding: '6px 8px', borderRadius: 10, border: '2px solid #111', fontWeight: 900 }}
                          >
                            {['ACTIVE','DNS','DNF','ABSENT'].map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
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
    </div>
  )
}

