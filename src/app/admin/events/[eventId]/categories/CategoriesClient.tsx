'use client'

import { appAlert } from '@/src/lib/appDialog'

import { useEffect, useState } from 'react'
import ToggleSwitch from '../../../../../components/ToggleSwitch'
import { useApiFetch } from '@/src/hooks/useApiFetch'

type CategoryItem = {
  id: string
  year: number
  year_min?: number
  year_max?: number
  category_basis?: 'BIRTH_YEAR' | 'AGE'
  age_min?: number | null
  age_max?: number | null
  capacity?: number | null
  gender: 'BOY' | 'GIRL' | 'MIX'
  label: string
  enabled: boolean
}

type CreateDraft = {
  label: string
  year_min: string
  year_max: string
  category_basis: 'BIRTH_YEAR' | 'AGE'
  age_min: string
  age_max: string
  gender: CategoryItem['gender']
  capacity: string
}

const initialDraft = (): CreateDraft => ({
  label: '',
  year_min: '',
  year_max: '',
  category_basis: 'BIRTH_YEAR',
  age_min: '',
  age_max: '',
  gender: 'BOY',
  capacity: '',
})

export default function CategoriesClient({ eventId }: { eventId: string }) {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createDraft, setCreateDraft] = useState<CreateDraft>(initialDraft())
  const [editMap, setEditMap] = useState<
    Record<string, { year_min: string; year_max: string; category_basis?: 'BIRTH_YEAR' | 'AGE'; age_min?: string; age_max?: string; label: string; capacity: string; gender: CategoryItem['gender'] }>
  >({})

  const getErrorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Request failed')

  const apiFetch = useApiFetch()

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/events/${eventId}/categories`)
      const json = await res.json()
      setCategories(json.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!eventId) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const toggle = async (item: CategoryItem) => {
    setSavingId(item.id)
    try {
      await apiFetch(`/api/categories/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !item.enabled }),
      })
      await load()
    } catch (err: unknown) {
      appAlert(getErrorMessage(err))
    } finally {
      setSavingId(null)
    }
  }

  const syncFromRiders = async () => {
    setSyncing(true)
    try {
      await apiFetch(`/api/events/${eventId}/categories/sync`, { method: 'POST' })
      await load()
    } catch (err: unknown) {
      appAlert(getErrorMessage(err))
    } finally {
      setSyncing(false)
    }
  }

  const updateEdit = (item: CategoryItem) => {
    setEditMap((prev) => ({
      ...prev,
      [item.id]: {
        year_min: String(item.year_min ?? item.year),
        year_max: String(item.year_max ?? item.year),
        category_basis: item.category_basis ?? 'BIRTH_YEAR',
        age_min: item.age_min == null ? '' : String(item.age_min),
        age_max: item.age_max == null ? '' : String(item.age_max),
        label: item.label ?? '',
        capacity: item.capacity == null ? '' : String(item.capacity),
        gender: item.gender,
      },
    }))
  }

  const saveEdit = async (item: CategoryItem) => {
    const draft = editMap[item.id]
    if (!draft) return
    const yearMin = Number(draft.year_min)
    const yearMax = Number(draft.year_max)
    const ageMin = Number(draft.age_min)
    const ageMax = Number(draft.age_max)
    const capacityValue = draft.capacity.trim() === '' ? null : Number(draft.capacity)
    if (draft.category_basis === 'AGE' ? (!draft.age_min?.trim() || !draft.age_max?.trim() || !Number.isInteger(ageMin) || !Number.isInteger(ageMax) || ageMin < 0 || ageMin > ageMax) : (!Number.isFinite(yearMin) || !Number.isFinite(yearMax))) {
      appAlert(draft.category_basis === 'AGE' ? 'Rentang umur tidak valid.' : 'Year range tidak valid.')
      return
    }
    if (draft.category_basis === 'BIRTH_YEAR' && yearMin > yearMax) {
      appAlert('Year min tidak boleh lebih besar dari year max.')
      return
    }
    if (capacityValue !== null && (!Number.isFinite(capacityValue) || capacityValue < 0)) {
      appAlert('Quota tidak valid.')
      return
    }
    setSavingId(item.id)
    try {
      await apiFetch(`/api/categories/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          year_min: yearMin,
          year_max: yearMax,
          category_basis: draft.category_basis,
          age_min: draft.category_basis === 'AGE' ? ageMin : null,
          age_max: draft.category_basis === 'AGE' ? ageMax : null,
          label: draft.label,
          capacity: capacityValue,
          gender: draft.gender,
        }),
      })
      await load()
    } catch (err: unknown) {
      appAlert(getErrorMessage(err))
    } finally {
      setSavingId(null)
    }
  }

  const createCategory = async () => {
    const label = createDraft.label.trim()
    const yearMin = Number(createDraft.year_min)
    const yearMax = Number(createDraft.year_max)
    const ageMin = Number(createDraft.age_min)
    const ageMax = Number(createDraft.age_max)
    const capacityValue = createDraft.capacity.trim() === '' ? null : Number(createDraft.capacity)

    if (!label) {
      appAlert('Label wajib diisi.')
      return
    }
    if (createDraft.category_basis === 'AGE' ? (!createDraft.age_min.trim() || !createDraft.age_max.trim() || !Number.isInteger(ageMin) || !Number.isInteger(ageMax) || ageMin < 0 || ageMin > ageMax) : (!Number.isFinite(yearMin) || !Number.isFinite(yearMax))) {
      appAlert(createDraft.category_basis === 'AGE' ? 'Rentang umur tidak valid.' : 'Year range tidak valid.')
      return
    }
    if (createDraft.category_basis === 'BIRTH_YEAR' && yearMin > yearMax) {
      appAlert('Year min tidak boleh lebih besar dari year max.')
      return
    }
    if (capacityValue !== null && (!Number.isFinite(capacityValue) || capacityValue < 0)) {
      appAlert('Quota tidak valid.')
      return
    }

    setCreating(true)
    try {
      await apiFetch(`/api/events/${eventId}/categories`, {
        method: 'POST',
        body: JSON.stringify({
          label,
          year_min: yearMin,
          year_max: yearMax,
          category_basis: createDraft.category_basis,
          age_min: createDraft.category_basis === 'AGE' ? ageMin : null,
          age_max: createDraft.category_basis === 'AGE' ? ageMax : null,
          gender: createDraft.gender,
          capacity: capacityValue,
          enabled: true,
        }),
      })
      setCreateDraft(initialDraft())
      await load()
    } catch (err: unknown) {
      appAlert(getErrorMessage(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Categories</h1>
      <div style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
        Categories bisa dibuat manual, lalu disesuaikan dari data rider jika diperlukan.
      </div>
      <div style={{ marginTop: 10 }}>
        <button
          type="button"
          onClick={syncFromRiders}
          disabled={syncing}
          className="admin-success-button"
        >
          {syncing ? 'Syncing...' : 'Sync Categories from Riders'}
        </button>
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 14,
          borderRadius: 16,
          border: '2px solid #111',
          background: '#fff',
          display: 'grid',
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 900 }}>Tambah Category</div>
        <select value={createDraft.category_basis} onChange={(e) => setCreateDraft((prev) => ({ ...prev, category_basis: e.target.value as CreateDraft['category_basis'] }))} style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }}>
          <option value="BIRTH_YEAR">Kategori tahun lahir</option>
          <option value="AGE">Kategori umur pada tanggal event</option>
        </select>
        <input
          placeholder="Label (contoh: 2023 Boys)"
          value={createDraft.label}
          onChange={(e) => setCreateDraft((prev) => ({ ...prev, label: e.target.value }))}
          style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }}
        />
        {createDraft.category_basis === 'AGE' ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <input type="number" min="0" placeholder="Umur minimum (tahun)" value={createDraft.age_min} onChange={(e) => setCreateDraft((prev) => ({ ...prev, age_min: e.target.value }))} style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }} />
          <input type="number" min="0" placeholder="Umur maksimum (tahun)" value={createDraft.age_max} onChange={(e) => setCreateDraft((prev) => ({ ...prev, age_max: e.target.value }))} style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }} />
        </div> : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <input
            placeholder="Year min"
            value={createDraft.year_min}
            onChange={(e) => setCreateDraft((prev) => ({ ...prev, year_min: e.target.value }))}
            style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }}
          />
          <input
            placeholder="Year max"
            value={createDraft.year_max}
            onChange={(e) => setCreateDraft((prev) => ({ ...prev, year_max: e.target.value }))}
            style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }}
          />
        </div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <select
            value={createDraft.gender}
            onChange={(e) => setCreateDraft((prev) => ({ ...prev, gender: e.target.value as CategoryItem['gender'] }))}
            style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }}
          >
            <option value="BOY">BOY</option>
            <option value="GIRL">GIRL</option>
            <option value="MIX">MIX</option>
          </select>
          <input
            placeholder="Quota (kosong = unlimited)"
            value={createDraft.capacity}
            onChange={(e) => setCreateDraft((prev) => ({ ...prev, capacity: e.target.value }))}
            style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }}
          />
        </div>
        <button
          type="button"
          onClick={createCategory}
          disabled={creating}
          className="admin-primary-button w-fit"
        >
          {creating ? 'Creating...' : 'Tambah Category'}
        </button>
      </div>

      <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        {loading && (
          <div style={{ padding: 14, borderRadius: 16, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Loading...
          </div>
        )}

        {!loading && categories.length === 0 && (
          <div style={{ padding: 14, borderRadius: 16, border: '2px dashed #111', background: '#fff', fontWeight: 900 }}>
            Belum ada category untuk event ini.
          </div>
        )}

        {categories.map((item) => {
          const draft = editMap[item.id]
          return (
          <div
            key={item.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 14,
              borderRadius: 16,
              border: '2px solid #111',
              background: '#fff',
              gap: 10,
            }}
          >
            <div style={{ display: 'grid', gap: 2 }}>
              <div style={{ fontWeight: 900 }}>{item.label}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#333' }}>
                {item.category_basis === 'AGE' ? `Umur ${item.age_min}Ã¢â‚¬â€œ${item.age_max} tahun` : `${item.year_min ?? item.year}-${item.year_max ?? item.year}`} - {item.gender}
              </div>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#333' }}>
                Quota: {item.capacity == null ? 'Unlimited' : item.capacity}
              </div>
              <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                <input
                  placeholder="Label"
                  value={draft?.label ?? item.label}
                  onChange={(e) =>
                    setEditMap((prev) => ({
                      ...prev,
                      [item.id]: {
                        year_min: prev[item.id]?.year_min ?? String(item.year_min ?? item.year),
                        year_max: prev[item.id]?.year_max ?? String(item.year_max ?? item.year),
                        category_basis: prev[item.id]?.category_basis ?? item.category_basis ?? 'BIRTH_YEAR',
                        age_min: prev[item.id]?.age_min ?? (item.age_min == null ? '' : String(item.age_min)),
                        age_max: prev[item.id]?.age_max ?? (item.age_max == null ? '' : String(item.age_max)),
                        label: e.target.value,
                        capacity: prev[item.id]?.capacity ?? (item.capacity == null ? '' : String(item.capacity)),
                        gender: prev[item.id]?.gender ?? item.gender,
                      },
                    }))
                  }
                  onFocus={() => updateEdit(item)}
                  style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }}
                />
                <select value={draft?.category_basis ?? item.category_basis ?? 'BIRTH_YEAR'} onFocus={() => updateEdit(item)} onChange={(e) => setEditMap((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] ?? { year_min: String(item.year_min ?? item.year), year_max: String(item.year_max ?? item.year), age_min: item.age_min == null ? '' : String(item.age_min), age_max: item.age_max == null ? '' : String(item.age_max), label: item.label, capacity: item.capacity == null ? '' : String(item.capacity), gender: item.gender }), category_basis: e.target.value as 'BIRTH_YEAR' | 'AGE' } }))} style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }}>
                  <option value="BIRTH_YEAR">Kategori tahun lahir</option><option value="AGE">Kategori umur pada tanggal event</option>
                </select>
                {(draft?.category_basis ?? item.category_basis ?? 'BIRTH_YEAR') === 'AGE' ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <input type="number" min="0" placeholder="Umur minimum" value={draft?.age_min ?? (item.age_min == null ? '' : String(item.age_min))} onFocus={() => updateEdit(item)} onChange={(e) => setEditMap((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] ?? { year_min: String(item.year_min ?? item.year), year_max: String(item.year_max ?? item.year), category_basis: 'AGE', age_min: '', age_max: '', label: item.label, capacity: item.capacity == null ? '' : String(item.capacity), gender: item.gender }), age_min: e.target.value } }))} style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }} />
                  <input type="number" min="0" placeholder="Umur maksimum" value={draft?.age_max ?? (item.age_max == null ? '' : String(item.age_max))} onFocus={() => updateEdit(item)} onChange={(e) => setEditMap((prev) => ({ ...prev, [item.id]: { ...(prev[item.id] ?? { year_min: String(item.year_min ?? item.year), year_max: String(item.year_max ?? item.year), category_basis: 'AGE', age_min: '', age_max: '', label: item.label, capacity: item.capacity == null ? '' : String(item.capacity), gender: item.gender }), age_max: e.target.value } }))} style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }} />
                </div> : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <input
                    placeholder="Year min"
                    value={draft?.year_min ?? String(item.year_min ?? item.year)}
                    onChange={(e) =>
                      setEditMap((prev) => ({
                        ...prev,
                        [item.id]: {
                          year_min: e.target.value,
                          year_max: prev[item.id]?.year_max ?? String(item.year_max ?? item.year),
                          category_basis: prev[item.id]?.category_basis ?? item.category_basis ?? 'BIRTH_YEAR',
                          age_min: prev[item.id]?.age_min ?? (item.age_min == null ? '' : String(item.age_min)),
                          age_max: prev[item.id]?.age_max ?? (item.age_max == null ? '' : String(item.age_max)),
                          label: prev[item.id]?.label ?? item.label,
                          capacity: prev[item.id]?.capacity ?? (item.capacity == null ? '' : String(item.capacity)),
                          gender: prev[item.id]?.gender ?? item.gender,
                        },
                      }))
                    }
                    onFocus={() => updateEdit(item)}
                    style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }}
                  />
                  <input
                    placeholder="Year max"
                    value={draft?.year_max ?? String(item.year_max ?? item.year)}
                    onChange={(e) =>
                      setEditMap((prev) => ({
                        ...prev,
                        [item.id]: {
                          year_min: prev[item.id]?.year_min ?? String(item.year_min ?? item.year),
                          year_max: e.target.value,
                          category_basis: prev[item.id]?.category_basis ?? item.category_basis ?? 'BIRTH_YEAR',
                          age_min: prev[item.id]?.age_min ?? (item.age_min == null ? '' : String(item.age_min)),
                          age_max: prev[item.id]?.age_max ?? (item.age_max == null ? '' : String(item.age_max)),
                          label: prev[item.id]?.label ?? item.label,
                          capacity: prev[item.id]?.capacity ?? (item.capacity == null ? '' : String(item.capacity)),
                          gender: prev[item.id]?.gender ?? item.gender,
                        },
                      }))
                    }
                    onFocus={() => updateEdit(item)}
                    style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }}
                  />
                </div>}
                <select
                  value={draft?.gender ?? item.gender}
                  onChange={(e) =>
                    setEditMap((prev) => ({
                      ...prev,
                      [item.id]: {
                        year_min: prev[item.id]?.year_min ?? String(item.year_min ?? item.year),
                        year_max: prev[item.id]?.year_max ?? String(item.year_max ?? item.year),
                        category_basis: prev[item.id]?.category_basis ?? item.category_basis ?? 'BIRTH_YEAR',
                        age_min: prev[item.id]?.age_min ?? (item.age_min == null ? '' : String(item.age_min)),
                        age_max: prev[item.id]?.age_max ?? (item.age_max == null ? '' : String(item.age_max)),
                        label: prev[item.id]?.label ?? item.label,
                        capacity: prev[item.id]?.capacity ?? (item.capacity == null ? '' : String(item.capacity)),
                        gender: e.target.value as CategoryItem['gender'],
                      },
                    }))
                  }
                  onFocus={() => updateEdit(item)}
                  style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }}
                >
                  <option value="BOY">BOY</option>
                  <option value="GIRL">GIRL</option>
                  <option value="MIX">MIX</option>
                </select>
                <input
                  placeholder="Quota (kosong = unlimited)"
                  value={draft?.capacity ?? (item.capacity == null ? '' : String(item.capacity))}
                    onChange={(e) =>
                      setEditMap((prev) => ({
                        ...prev,
                        [item.id]: {
                          year_min: prev[item.id]?.year_min ?? String(item.year_min ?? item.year),
                          year_max: prev[item.id]?.year_max ?? String(item.year_max ?? item.year),
                          category_basis: prev[item.id]?.category_basis ?? item.category_basis ?? 'BIRTH_YEAR',
                          age_min: prev[item.id]?.age_min ?? (item.age_min == null ? '' : String(item.age_min)),
                          age_max: prev[item.id]?.age_max ?? (item.age_max == null ? '' : String(item.age_max)),
                          label: prev[item.id]?.label ?? item.label,
                          capacity: e.target.value,
                          gender: prev[item.id]?.gender ?? item.gender,
                        },
                      }))
                    }
                  onFocus={() => updateEdit(item)}
                  style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }}
                />
                <button
                  type="button"
                  onClick={() => saveEdit(item)}
                  disabled={savingId === item.id}
                  className="admin-primary-button w-fit"
                >
                  {savingId === item.id ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
            <ToggleSwitch
              checked={item.enabled}
              onChange={() => toggle(item)}
              disabled={savingId === item.id}
              label={savingId === item.id ? 'Menyimpan kategori...' : 'Kategori aktif'}
            />
          </div>
        )})}
      </div>
    </div>
  )
}
