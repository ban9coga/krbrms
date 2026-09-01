'use client'

import { useEffect, useMemo, useState } from 'react'
import { useApiFetch } from '@/src/hooks/useApiFetch'
import {
  DEFAULT_DRAW_CATEGORY_CONFIG,
  normalizeDrawCategoryConfig,
  type DrawBatchMode,
  type DrawCategoryConfig,
  type DrawMoto2Order,
} from '@/src/lib/drawConfig'

type DrawCategory = {
  id: string
  label: string
  enabled: boolean
  sequence_order: number | null
  draw_config: DrawCategoryConfig
}

type DrawSettingsData = {
  gate_positions: number
  draw_mode: 'internal_live_draw' | 'external_draw'
  categories: DrawCategory[]
}

const panelClass = 'rounded-xl border border-[#d9c6a8] bg-white p-5 shadow-[0_14px_30px_rgba(64,37,19,0.08)]'
const fieldClass = 'w-full rounded-lg border border-[#cbb896] bg-[#fffaf0] px-3 py-2.5 text-sm font-bold text-[#2a1710] outline-none focus:border-[#b85a1c] focus:ring-2 focus:ring-[#e7b23b]/30'

const cloneConfig = (config: DrawCategoryConfig): DrawCategoryConfig => ({
  ...config,
  custom_batch_sizes: [...config.custom_batch_sizes],
})

export default function DrawSettingsClient({ eventId }: { eventId: string }) {
  const apiFetch = useApiFetch()
  const [data, setData] = useState<DrawSettingsData | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [draft, setDraft] = useState<DrawCategoryConfig>(cloneConfig(DEFAULT_DRAW_CATEGORY_CONFIG))
  const [customPattern, setCustomPattern] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modeSaving, setModeSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const selectedCategory = useMemo(
    () => data?.categories.find((category) => category.id === selectedCategoryId) ?? null,
    [data, selectedCategoryId]
  )

  const applyCategory = (category: DrawCategory | null) => {
    const config = cloneConfig(category?.draw_config ?? DEFAULT_DRAW_CATEGORY_CONFIG)
    setDraft(config)
    setCustomPattern(config.custom_batch_sizes.join(', '))
  }

  const load = async () => {
    setLoading(true)
    try {
      const json = await apiFetch(`/api/events/${eventId}/draw-settings`)
      const nextData = json.data as DrawSettingsData
      setData(nextData)
      const nextCategoryId = selectedCategoryId || nextData.categories[0]?.id || ''
      setSelectedCategoryId(nextCategoryId)
      applyCategory(nextData.categories.find((category) => category.id === nextCategoryId) ?? null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal memuat Draw Settings.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const selectCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId)
    applyCategory(data?.categories.find((category) => category.id === categoryId) ?? null)
    setMessage(null)
  }

  const saveCategory = async () => {
    if (!selectedCategoryId) return
    const parsedPattern = customPattern
      .split(/[\s,]+/)
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item > 0)
    const nextDraft = normalizeDrawCategoryConfig({
      ...draft,
      custom_batch_sizes: draft.batch_mode === 'CUSTOM_BATCH_SIZES' ? parsedPattern : [],
    })
    if (nextDraft.batch_mode === 'CUSTOM_BATCH_SIZES' && parsedPattern.length === 0) {
      setMessage('Isi pola batch, misalnya 5, 4 atau 8, 8, 7.')
      return
    }
    if (nextDraft.batch_mode === 'AUTO_BY_GATE' && nextDraft.batch_size && nextDraft.batch_size > (data?.gate_positions ?? 8)) {
      setMessage(`Maksimal rider per batch tidak boleh lebih dari jumlah gate (${data?.gate_positions ?? 8}).`)
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      const json = await apiFetch(`/api/events/${eventId}/draw-settings`, {
        method: 'PUT',
        body: JSON.stringify({ category_id: selectedCategoryId, draw_config: nextDraft }),
      })
      const savedConfig = json.data.draw_config as DrawCategoryConfig
      setDraft(cloneConfig(savedConfig))
      setCustomPattern(savedConfig.custom_batch_sizes.join(', '))
      setData((previous) =>
        previous
          ? {
              ...previous,
              categories: previous.categories.map((category) =>
                category.id === selectedCategoryId ? { ...category, draw_config: savedConfig } : category
              ),
            }
          : previous
      )
      setMessage(`Konfigurasi ${selectedCategory?.label ?? 'kategori'} tersimpan.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menyimpan konfigurasi drawing.')
    } finally {
      setSaving(false)
    }
  }

  const saveDrawMode = async (drawMode: DrawSettingsData['draw_mode']) => {
    if (!data || drawMode === data.draw_mode) return
    setModeSaving(true)
    setMessage(null)
    try {
      const json = await apiFetch(`/api/events/${eventId}/draw-settings`, {
        method: 'PATCH',
        body: JSON.stringify({ draw_mode: drawMode }),
      })
      setData((previous) => (previous ? { ...previous, draw_mode: json.data.draw_mode } : previous))
      setMessage(drawMode === 'internal_live_draw' ? 'Mode Spin Draw aktif untuk event ini.' : 'Mode input manual aktif untuk event ini.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Gagal menyimpan mode drawing.')
    } finally {
      setModeSaving(false)
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 pb-10">
      <header className="rounded-xl border border-[#7d4b2d] bg-[#28140b] px-5 py-6 text-[#fff5df] shadow-[0_18px_38px_rgba(64,37,19,0.18)] sm:px-7">
        <p className="m-0 text-[11px] font-black uppercase tracking-[0.16em] text-[#f4c743]">Race setup</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Draw Settings</h1>
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#e7d1b0]">
          Tetapkan format drawing sebelum petugas menjalankan undian. Pengaturan ini digunakan pada drawing berikutnya dan tidak mengubah moto yang sudah dibuat.
        </p>
      </header>

      {message && <div className={`${panelClass} border-[#d5b16a] bg-[#fff5dc] text-sm font-bold text-[#5d3c13]`}>{message}</div>}

      {loading || !data ? (
        <div className={`${panelClass} text-sm font-bold text-[#664b38]`}>Memuat konfigurasi drawing...</div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.78fr)_minmax(0,1.5fr)]">
          <aside className={`${panelClass} h-fit`}>
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-[#98602c]">Mode Event</p>
            <label className="grid gap-2 text-sm font-black text-[#2a1710]">
              Metode drawing
              <select
                value={data.draw_mode}
                onChange={(event) => void saveDrawMode(event.target.value as DrawSettingsData['draw_mode'])}
                disabled={modeSaving}
                className={fieldClass}
              >
                <option value="internal_live_draw">Spin Draw</option>
                <option value="external_draw">Input manual / external</option>
              </select>
            </label>
            <p className="mt-3 text-xs font-semibold leading-5 text-[#765946]">
              {data.draw_mode === 'internal_live_draw'
                ? 'Petugas akan mengundi urutan rider dari layar Drawing.'
                : 'Petugas memasukkan atau menyusun urutan dari sumber drawing eksternal.'}
            </p>

            <div className="my-5 border-t border-[#eadcc6]" />
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-[#98602c]">Kategori</p>
            <div className="grid gap-2">
              {data.categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => selectCategory(category.id)}
                  className={`rounded-lg border px-3 py-3 text-left text-sm font-black transition ${
                    category.id === selectedCategoryId
                      ? 'border-[#a95019] bg-[#f6c73b] text-[#21150f]'
                      : 'border-[#decdb5] bg-[#fffaf0] text-[#4d3020] hover:border-[#b67542]'
                  }`}
                >
                  {category.label}
                  {!category.enabled && <span className="ml-2 text-[10px] font-bold uppercase opacity-60">Nonaktif</span>}
                </button>
              ))}
            </div>
          </aside>

          <section className={panelClass}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eadcc6] pb-4">
              <div>
                <p className="m-0 text-[11px] font-black uppercase tracking-[0.14em] text-[#98602c]">Konfigurasi kategori</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-[#25150e]">{selectedCategory?.label ?? 'Pilih kategori'}</h2>
              </div>
              <span className="rounded-full border border-[#d6b77b] bg-[#fff5dc] px-3 py-1 text-xs font-black text-[#765116]">{data.gate_positions} gate tersedia</span>
            </div>

            <div className="mt-5 grid gap-5">
              <label className="grid gap-2 text-sm font-black text-[#2a1710]">
                Pembagian batch
                <select
                  value={draft.batch_mode}
                  onChange={(event) => setDraft((previous) => ({ ...previous, batch_mode: event.target.value as DrawBatchMode }))}
                  className={fieldClass}
                >
                  <option value="AUTO_BY_GATE">Otomatis berdasarkan kapasitas gate</option>
                  <option value="MANUAL_BATCH_COUNT">Tentukan jumlah batch</option>
                  <option value="CUSTOM_BATCH_SIZES">Tentukan jumlah rider per batch</option>
                </select>
              </label>

              {draft.batch_mode === 'AUTO_BY_GATE' && (
                <label className="grid max-w-xs gap-2 text-sm font-black text-[#2a1710]">
                  Maksimal rider per batch
                  <input
                    type="number"
                    min={1}
                    max={data.gate_positions}
                    value={draft.batch_size ?? data.gate_positions}
                    onChange={(event) => setDraft((previous) => ({ ...previous, batch_size: Number(event.target.value) || null }))}
                    className={fieldClass}
                  />
                </label>
              )}

              {draft.batch_mode === 'MANUAL_BATCH_COUNT' && (
                <label className="grid max-w-xs gap-2 text-sm font-black text-[#2a1710]">
                  Jumlah batch
                  <input
                    type="number"
                    min={1}
                    value={draft.batch_count ?? ''}
                    onChange={(event) => setDraft((previous) => ({ ...previous, batch_count: Number(event.target.value) || null }))}
                    className={fieldClass}
                  />
                </label>
              )}

              {draft.batch_mode === 'CUSTOM_BATCH_SIZES' && (
                <label className="grid gap-2 text-sm font-black text-[#2a1710]">
                  Pola rider per batch
                  <input
                    type="text"
                    value={customPattern}
                    onChange={(event) => setCustomPattern(event.target.value)}
                    placeholder="Contoh: 5, 4 atau 8, 8, 7"
                    className={fieldClass}
                  />
                  <span className="text-xs font-semibold text-[#765946]">Setiap angka tidak boleh melebihi jumlah gate. Total akhir akan dicek lagi saat drawing dijalankan.</span>
                </label>
              )}

              <label className="grid gap-2 text-sm font-black text-[#2a1710]">
                Urutan gate Moto 2
                <select
                  value={draft.moto2_order}
                  onChange={(event) => setDraft((previous) => ({ ...previous, moto2_order: event.target.value as DrawMoto2Order }))}
                  className={fieldClass}
                >
                  <option value="REVERSE">Dibalik dari urutan Moto 1</option>
                  <option value="SAME">Sama seperti urutan Moto 1</option>
                </select>
              </label>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#eadcc6] pt-5">
              <p className="max-w-lg text-xs font-semibold leading-5 text-[#765946]">Konfigurasi ini dipakai ketika kategori belum memiliki moto. Setelah drawing disimpan, perubahan format tidak akan mengubah batch yang sudah dibuat.</p>
              <button
                type="button"
                onClick={() => void saveCategory()}
                disabled={saving || !selectedCategoryId}
                className="rounded-lg border border-[#6f3d1c] bg-[#f6c73b] px-5 py-3 text-sm font-black text-[#21150f] shadow-[0_4px_0_#8d4d1d] transition hover:bg-[#ffd85b] active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
