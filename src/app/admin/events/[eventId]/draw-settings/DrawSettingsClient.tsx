'use client'

import { useEffect, useMemo, useState } from 'react'
import { useApiFetch } from '@/src/hooks/useApiFetch'
import {
  DEFAULT_DRAW_CATEGORY_CONFIG,
  normalizeDrawCategoryConfig,
  type DrawBatchMode,
  type DrawCategoryConfig,
  type DrawMoto2Order,
  type DrawMoto3Order,
  type QualificationBatchMode,
} from '@/src/lib/drawConfig'

type DrawCategory = {
  id: string
  label: string
  enabled: boolean
  sequence_order: number | null
  qualification_moto_count: number
  single_batch_final_enabled: boolean
  draw_config: DrawCategoryConfig
}

type DrawSettingsData = {
  gate_positions: number
  draw_mode: 'internal_live_draw' | 'external_draw'
  qualification_batch_mode: QualificationBatchMode
  categories: DrawCategory[]
}

type CategorySaveNotice = {
  kind: 'saving' | 'success' | 'error'
  text: string
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
  const [draftQualificationMotoCount, setDraftQualificationMotoCount] = useState(2)
  const [draftSingleBatchFinalEnabled, setDraftSingleBatchFinalEnabled] = useState(false)
  const [customPattern, setCustomPattern] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modeSaving, setModeSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [modeSaveNotice, setModeSaveNotice] = useState<CategorySaveNotice | null>(null)
  const [categorySaveNotice, setCategorySaveNotice] = useState<CategorySaveNotice | null>(null)
  const [categorySearch, setCategorySearch] = useState('')

  const selectedCategory = useMemo(
    () => data?.categories.find((category) => category.id === selectedCategoryId) ?? null,
    [data, selectedCategoryId]
  )
  const filteredCategories = useMemo(() => {
    const query = categorySearch.trim().toLocaleLowerCase()
    return (data?.categories ?? []).filter((category) => category.label.toLocaleLowerCase().includes(query))
  }, [categorySearch, data?.categories])

  const applyCategory = (category: DrawCategory | null) => {
    const config = cloneConfig(category?.draw_config ?? DEFAULT_DRAW_CATEGORY_CONFIG)
    setDraft(config)
    setDraftQualificationMotoCount(Number(category?.qualification_moto_count ?? 2) >= 3 ? 3 : 2)
    setDraftSingleBatchFinalEnabled(category?.single_batch_final_enabled === true)
    setCustomPattern(config.custom_batch_sizes.join(', '))
  }

  const load = async () => {
    setLoading(true)
    setMessage(null)
    setModeSaveNotice(null)
    setCategorySaveNotice(null)
    setCategorySearch('')
    try {
      const json = await apiFetch(`/api/events/${eventId}/draw-settings`)
      const nextData = json.data as DrawSettingsData
      setData(nextData)
      const nextCategoryId = nextData.categories.some((category) => category.id === selectedCategoryId)
        ? selectedCategoryId
        : nextData.categories[0]?.id || ''
      setSelectedCategoryId(nextCategoryId)
      applyCategory(nextData.categories.find((category) => category.id === nextCategoryId) ?? null)
      setMessage(null)
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
    setCategorySaveNotice(null)
    setModeSaveNotice(null)
    setMessage(null)
  }

  const saveCategory = async () => {
    if (!selectedCategoryId) return
    const patternParts = customPattern.split(/[\s,]+/).filter(Boolean)
    const parsedPattern = patternParts.map((item) => Number(item.trim()))
    const nextDraft = normalizeDrawCategoryConfig({
      ...draft,
      custom_batch_sizes: draft.batch_mode === 'CUSTOM_BATCH_SIZES' ? parsedPattern : [],
    })
    if (nextDraft.batch_mode === 'CUSTOM_BATCH_SIZES' && (parsedPattern.length === 0 || parsedPattern.some((size) => !Number.isInteger(size) || size < 1))) {
      setCategorySaveNotice({ kind: 'error', text: 'Pola batch hanya boleh berisi angka positif, misalnya 5, 4 atau 8, 8, 7.' })
      return
    }
    if (nextDraft.batch_mode === 'AUTO_BY_GATE' && nextDraft.batch_size && nextDraft.batch_size > (data?.gate_positions ?? 8)) {
      setCategorySaveNotice({ kind: 'error', text: `Maksimal rider per batch tidak boleh lebih dari jumlah gate (${data?.gate_positions ?? 8}).` })
      return
    }
    if (nextDraft.batch_mode === 'AUTO_BY_GATE' && (!nextDraft.batch_size || nextDraft.batch_size < 1)) {
      setCategorySaveNotice({ kind: 'error', text: 'Isi batas rider per batch dengan angka minimal 1.' })
      return
    }
    if (nextDraft.batch_mode === 'MANUAL_BATCH_COUNT' && (!nextDraft.batch_count || nextDraft.batch_count < 1)) {
      setCategorySaveNotice({ kind: 'error', text: 'Isi jumlah batch dengan angka minimal 1.' })
      return
    }
    if (nextDraft.batch_mode === 'CUSTOM_BATCH_SIZES' && parsedPattern.some((size) => size > (data?.gate_positions ?? 8))) {
      setCategorySaveNotice({ kind: 'error', text: `Setiap batch tidak boleh melebihi jumlah gate (${data?.gate_positions ?? 8}).` })
      return
    }

    setSaving(true)
    setMessage(null)
    setCategorySaveNotice({ kind: 'saving', text: `Menyimpan konfigurasi ${selectedCategory?.label ?? 'kategori'}...` })
    try {
      const json = await apiFetch(`/api/events/${eventId}/draw-settings`, {
        method: 'PUT',
        body: JSON.stringify({
          category_id: selectedCategoryId,
          qualification_moto_count: draftQualificationMotoCount,
          single_batch_final_enabled: draftSingleBatchFinalEnabled,
          draw_config: nextDraft,
        }),
      })
      const savedConfig = json.data.draw_config as DrawCategoryConfig
      setDraft(cloneConfig(savedConfig))
      setCustomPattern(savedConfig.custom_batch_sizes.join(', '))
      setData((previous) =>
        previous
          ? {
              ...previous,
              categories: previous.categories.map((category) =>
                category.id === selectedCategoryId
                  ? { ...category, qualification_moto_count: draftQualificationMotoCount, single_batch_final_enabled: draftSingleBatchFinalEnabled, draw_config: savedConfig }
                  : category
              ),
            }
          : previous
      )
      setCategorySaveNotice({ kind: 'success', text: `Konfigurasi ${selectedCategory?.label ?? 'kategori'} berhasil disimpan.` })
    } catch (error) {
      setCategorySaveNotice({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Gagal menyimpan konfigurasi drawing.',
      })
    } finally {
      setSaving(false)
    }
  }

  const saveDrawMode = async (drawMode: DrawSettingsData['draw_mode']) => {
    if (!data || drawMode === data.draw_mode) return
    setModeSaving(true)
    setMessage(null)
    setModeSaveNotice({ kind: 'saving', text: 'Menyimpan cara drawing...' })
    try {
      const json = await apiFetch(`/api/events/${eventId}/draw-settings`, {
        method: 'PATCH',
        body: JSON.stringify({ draw_mode: drawMode }),
      })
      setData((previous) => (previous ? { ...previous, draw_mode: json.data.draw_mode } : previous))
      setModeSaveNotice({
        kind: 'success',
        text: drawMode === 'internal_live_draw' ? 'Cara drawing disimpan: Spin Draw.' : 'Cara drawing disimpan: input manual.',
      })
    } catch (error) {
      setModeSaveNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Gagal menyimpan cara drawing.' })
    } finally {
      setModeSaving(false)
    }
  }

  const saveQualificationBatchMode = async (qualificationBatchMode: QualificationBatchMode) => {
    if (!data || qualificationBatchMode === data.qualification_batch_mode) return
    setModeSaving(true)
    setMessage(null)
    setModeSaveNotice({ kind: 'saving', text: 'Menyimpan pembagian batch kualifikasi...' })
    try {
      const json = await apiFetch(`/api/events/${eventId}/draw-settings`, {
        method: 'PATCH',
        body: JSON.stringify({ qualification_batch_mode: qualificationBatchMode }),
      })
      setData((previous) => (previous ? { ...previous, qualification_batch_mode: json.data.qualification_batch_mode } : previous))
      setModeSaveNotice({
        kind: 'success',
        text: qualificationBatchMode === 'ROTATE_EACH_MOTO'
          ? 'Pembagian batch disimpan: rider diacak ulang tiap moto.'
          : 'Pembagian batch disimpan: rider tetap di batch yang sama.',
      })
    } catch (error) {
      setModeSaveNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Gagal menyimpan pembagian batch.' })
    } finally {
      setModeSaving(false)
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 pb-10">
      <header className="rounded-xl border border-[#7d4b2d] bg-[#28140b] px-5 py-6 text-[#fff5df] shadow-[0_18px_38px_rgba(64,37,19,0.18)] sm:px-7">
        <p className="m-0 text-[11px] font-black uppercase tracking-[0.16em] text-[#f4c743]">Pengaturan event</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Pengaturan Drawing</h1>
        <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-[#e7d1b0]">
          Tetapkan format drawing sebelum petugas menjalankan undian. Pengaturan ini digunakan pada drawing berikutnya dan tidak mengubah moto yang sudah dibuat.
        </p>
      </header>

      {message && data && <div role="alert" className={`${panelClass} border-red-300 bg-red-50 text-sm font-bold text-red-800`}>{message}</div>}

      {loading ? (
        <div className={`${panelClass} text-sm font-bold text-[#664b38]`}>Memuat konfigurasi drawing...</div>
      ) : !data ? (
        <div role="alert" className={`${panelClass} grid gap-3 border-red-300 bg-red-50 text-sm font-bold text-red-800`}>
          <p className="m-0">{message ?? 'Konfigurasi drawing belum berhasil dimuat.'}</p>
          <button type="button" onClick={() => void load()} className="w-fit rounded-lg border border-red-300 bg-white px-4 py-2 font-black text-red-800 hover:bg-red-100">
            Coba muat lagi
          </button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(260px,0.78fr)_minmax(0,1.5fr)]">
          <aside className={`${panelClass} h-fit`}>
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-[#98602c]">Pengaturan event</p>
            <label className="grid gap-2 text-sm font-black text-[#2a1710]">
              Metode drawing
              <select
                value={data.draw_mode}
                onChange={(event) => void saveDrawMode(event.target.value as DrawSettingsData['draw_mode'])}
                disabled={modeSaving}
                className={fieldClass}
              >
                <option value="internal_live_draw">Spin Draw di aplikasi</option>
                <option value="external_draw">Masukkan urutan dari undian luar</option>
              </select>
            </label>
            <p className="mt-3 text-xs font-semibold leading-5 text-[#765946]">
              {data.draw_mode === 'internal_live_draw'
                ? 'Urutan rider akan diundi langsung dari halaman Drawing.'
                : 'Pilih ini jika urutan rider sudah ditentukan di luar aplikasi.'}
            </p>

            <label className="mt-4 grid gap-2 text-sm font-black text-[#2a1710]">
              Pembagian batch kualifikasi
              <select
                value={data.qualification_batch_mode}
                onChange={(event) => void saveQualificationBatchMode(event.target.value as QualificationBatchMode)}
                disabled={modeSaving}
                className={fieldClass}
              >
                <option value="FIXED">Batch tetap di setiap moto</option>
                <option value="ROTATE_EACH_MOTO">Batch bisa berbeda tiap moto</option>
              </select>
            </label>
            <p className="mt-3 text-xs font-semibold leading-5 text-[#765946]">
              {data.qualification_batch_mode === 'ROTATE_EACH_MOTO'
                ? 'Pada kategori multi-batch, rider boleh masuk batch berbeda di tiap moto. Di draw manual, tentukan rider melalui target Moto dan Batch; di draw otomatis, sistem mengacak pembagiannya. Kategori satu batch tetap memakai batch yang sama. Peringkat memakai total poin semua moto.'
                : 'Rider tetap satu kelompok batch pada semua moto; urutan gate dapat berubah.'}
            </p>
            <p className="mt-2 text-xs font-semibold leading-5 text-[#765946]">
              Pilihan di bagian ini tersimpan otomatis setelah dropdown diubah.
            </p>
            {modeSaveNotice && (
              <p
                role={modeSaveNotice.kind === 'error' ? 'alert' : 'status'}
                aria-live={modeSaveNotice.kind === 'error' ? 'assertive' : 'polite'}
                className={`mt-3 rounded-lg border px-3 py-2 text-sm font-bold ${
                  modeSaveNotice.kind === 'success'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : modeSaveNotice.kind === 'error'
                      ? 'border-red-300 bg-red-50 text-red-800'
                      : 'border-blue-300 bg-blue-50 text-blue-800'
                }`}
              >
                {modeSaveNotice.kind === 'saving' ? 'Menyimpan... ' : ''}{modeSaveNotice.text}
              </p>
            )}

            <div className="my-5 border-t border-[#eadcc6]" />
            <p className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-[#98602c]">Pilih kategori</p>
            <label className="mb-3 grid gap-1 text-xs font-bold text-[#765946]">
              Cari kategori
              <input
                type="search"
                value={categorySearch}
                onChange={(event) => setCategorySearch(event.target.value)}
                placeholder="Ketik nama kategori"
                className={fieldClass}
              />
            </label>
            <div className="grid gap-2">
              {filteredCategories.map((category) => (
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
              {filteredCategories.length === 0 && (
                <p className="m-0 rounded-lg border border-dashed border-[#decdb5] p-3 text-xs font-semibold text-[#765946]">
                  {data.categories.length === 0 ? 'Event ini belum memiliki kategori.' : 'Kategori tidak ditemukan.'}
                </p>
              )}
            </div>
          </aside>

          <section className={panelClass}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#eadcc6] pb-4">
              <div>
                <p className="m-0 text-[11px] font-black uppercase tracking-[0.14em] text-[#98602c]">Konfigurasi kategori</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-[#25150e]">{selectedCategory?.label ?? 'Belum ada kategori'}</h2>
              </div>
              <span className="rounded-full border border-[#d6b77b] bg-[#fff5dc] px-3 py-1 text-xs font-black text-[#765116]">{data.gate_positions} gate tersedia</span>
            </div>

            {!selectedCategory && (
              <p role="status" className="mt-5 rounded-lg border border-dashed border-[#decdb5] bg-[#fffaf0] p-4 text-sm font-semibold leading-6 text-[#765946]">
                Event ini belum memiliki kategori. Tambahkan kategori event terlebih dahulu sebelum mengatur drawing.
              </p>
            )}

            <fieldset disabled={!selectedCategory} className="mt-5 grid gap-5 border-0 p-0 disabled:opacity-50">
              <label className="grid gap-2 text-sm font-black text-[#2a1710]">
                Jumlah moto kualifikasi
                <select
                  value={draftQualificationMotoCount}
                  onChange={(event) => {
                    setDraftQualificationMotoCount(Number(event.target.value))
                    setCategorySaveNotice(null)
                  }}
                  className={fieldClass}
                >
                  <option value={2}>2 moto</option>
                  <option value={3}>3 moto</option>
                </select>
                <span className="text-xs font-semibold leading-5 text-[#765946]">Untuk kategori dengan beberapa batch, pilih 2 atau 3 moto. Jika hasil drawing hanya satu batch, kualifikasi otomatis berjalan 3 moto.</span>
              </label>

              <label className="flex items-start gap-3 rounded-lg border border-[#d9c6a8] bg-[#fffaf0] p-4 text-sm font-black text-[#2a1710]">
                <input
                  type="checkbox"
                  checked={draftSingleBatchFinalEnabled}
                  onChange={(event) => {
                    setDraftSingleBatchFinalEnabled(event.target.checked)
                    setCategorySaveNotice(null)
                  }}
                  className="mt-0.5 h-4 w-4 accent-[#a95019]"
                />
                <span className="grid gap-1">
                  <span>Buat Final otomatis untuk kategori satu batch</span>
                  <span className="text-xs font-semibold leading-5 text-[#765946]">
                    Jika aktif dan hasil drawing tepat satu batch, Moto 1, 2, dan 3 dibuat sekaligus. Setelah hasil Moto 3 dihitung, Final dibuat mengikuti aturan pembagian kelas Final. Jika nonaktif, Moto 3 dibuat setelah hasil Moto 2 dihitung, lalu kategori berlanjut setelah hasil total tiga moto selesai.
                  </span>
                </span>
              </label>

              <label className="grid gap-2 text-sm font-black text-[#2a1710]">
                Pembagian batch
                <select
                  value={draft.batch_mode}
                  onChange={(event) => {
                    setDraft((previous) => ({ ...previous, batch_mode: event.target.value as DrawBatchMode }))
                    setCategorySaveNotice(null)
                  }}
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
                    onChange={(event) => {
                      setDraft((previous) => ({ ...previous, batch_size: Number(event.target.value) || null }))
                      setCategorySaveNotice(null)
                    }}
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
                    onChange={(event) => {
                      setDraft((previous) => ({ ...previous, batch_count: Number(event.target.value) || null }))
                      setCategorySaveNotice(null)
                    }}
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
                    onChange={(event) => {
                      setCustomPattern(event.target.value)
                      setCategorySaveNotice(null)
                    }}
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
                  onChange={(event) => {
                    setDraft((previous) => ({ ...previous, moto2_order: event.target.value as DrawMoto2Order }))
                    setCategorySaveNotice(null)
                  }}
                  className={fieldClass}
                >
                  <option value="REVERSE">Dibalik dari urutan Moto 1</option>
                  <option value="SAME">Sama seperti urutan Moto 1</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-black text-[#2a1710]">
                Urutan gate Moto 3
                <select
                  value={draft.moto3_order}
                  onChange={(event) => {
                    setDraft((previous) => ({ ...previous, moto3_order: event.target.value as DrawMoto3Order }))
                    setCategorySaveNotice(null)
                  }}
                  className={fieldClass}
                >
                  <option value="SAME">Sama seperti urutan Moto 1</option>
                  <option value="REVERSE">Dibalik dari urutan Moto 1</option>
                </select>
                <span className="text-xs font-semibold text-[#765946]">Dipakai untuk kategori beberapa batch dengan 3 moto kualifikasi. Undian manual tetap dapat menentukan urutan gate tiap batch.</span>
              </label>
            </fieldset>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#eadcc6] pt-5">
              <p className="max-w-lg text-xs font-semibold leading-5 text-[#765946]">Konfigurasi ini dipakai ketika kategori belum memiliki moto. Setelah drawing disimpan, perubahan format tidak akan mengubah batch yang sudah dibuat.</p>
              <div className="grid justify-items-end gap-3">
                {categorySaveNotice && (
                  <p
                    role={categorySaveNotice.kind === 'error' ? 'alert' : 'status'}
                    aria-live={categorySaveNotice.kind === 'error' ? 'assertive' : 'polite'}
                    className={`m-0 rounded-lg border px-3 py-2 text-sm font-bold ${
                      categorySaveNotice.kind === 'success'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : categorySaveNotice.kind === 'error'
                          ? 'border-red-300 bg-red-50 text-red-800'
                          : 'border-blue-300 bg-blue-50 text-blue-800'
                    }`}
                  >
                    {categorySaveNotice.kind === 'saving' && <span className="mr-2 inline-block animate-spin" aria-hidden="true">◌</span>}
                    {categorySaveNotice.kind === 'success' && <span className="mr-2" aria-hidden="true">✓</span>}
                    {categorySaveNotice.text}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void saveCategory()}
                  disabled={saving || !selectedCategoryId}
                  className="rounded-lg border border-[#6f3d1c] bg-[#f6c73b] px-5 py-3 text-sm font-black text-[#21150f] shadow-[0_4px_0_#8d4d1d] transition hover:bg-[#ffd85b] active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
