'use client'

import { useEffect, useMemo, useState, type ClipboardEvent, type DragEvent } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'

type CategoryItem = {
  id: string
  year: number
  year_min?: number
  year_max?: number
  capacity?: number | null
  filled?: number
  remaining?: number | null
  is_full?: boolean
  gender: 'BOY' | 'GIRL' | 'MIX'
  label: string
  enabled: boolean
}

type RiderItem = {
  id: string
  name: string
  rider_nickname?: string | null
  jersey_size?: string | null
  date_of_birth: string
  birth_year?: number
  gender: 'BOY' | 'GIRL'
  plate_number: string
  plate_suffix?: string | null
  no_plate_display: string
  club?: string | null
  photo_thumbnail_url?: string | null
}

type ExportCategorySummary = {
  id: string
  label: string
  capacity: number | null
  filled: number
  remaining: number | null
  status: 'PENUH' | 'TERSEDIA' | 'TANPA BATAS'
}

type ExportCategoryGroup = {
  summary: ExportCategorySummary
  rows: RiderItem[]
}

const inputClass =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-amber-300 focus:ring-2 focus:ring-amber-300/30'

const buttonPrimaryClass =
  'inline-flex items-center justify-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-black uppercase tracking-[0.12em] text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300'

const buttonSecondaryClass =
  'inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400'

const buttonDangerClass =
  'inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400'

const labelClass = 'text-[11px] font-black uppercase tracking-[0.16em] text-slate-400'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
}

async function buildResizedBlobs(file: File) {
  const bitmap = await createImageBitmap(file)
  const crop = Math.min(bitmap.width, bitmap.height)
  const sx = Math.floor((bitmap.width - crop) / 2)
  const sy = Math.floor((bitmap.height - crop) / 2)

  const make = async (size: number) => {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas not supported')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, sx, sy, crop, crop, 0, 0, size, size)

    // Try webp first, fallback to jpeg.
    const tryTypes: Array<{ type: string; ext: string }> = [
      { type: 'image/webp', ext: 'webp' },
      { type: 'image/jpeg', ext: 'jpg' },
    ]

    for (const t of tryTypes) {
      let q = 0.88
      for (let attempt = 0; attempt < 8; attempt++) {
        const blob = await canvasToBlob(canvas, t.type, q)
        if (!blob) break
        if (blob.size <= 200 * 1024 || q <= 0.5) {
          return { blob, type: t.type, ext: t.ext }
        }
        q = clamp(q - 0.08, 0.5, 0.92)
      }
    }

    // Worst case: return png
    const png = await canvasToBlob(canvas, 'image/png', 1)
    if (!png) throw new Error('Failed to encode image')
    return { blob: png, type: 'image/png', ext: 'png' }
  }

  const full = await make(400)
  const thumb = await make(100)
  return { full, thumb }
}

export default function RidersClient({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportingAll, setExportingAll] = useState(false)
  const [exportingExcel, setExportingExcel] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)

  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [riders, setRiders] = useState<RiderItem[]>([])
  const [eventStatus, setEventStatus] = useState<'UPCOMING' | 'LIVE' | 'FINISHED' | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [total, setTotal] = useState(0)
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total])
  const [query, setQuery] = useState('')
  const selectedCategoryLabel = useMemo(
    () => categories.find((c) => c.id === selectedCategory)?.label ?? '',
    [categories, selectedCategory]
  )

  const [form, setForm] = useState({
    name: '',
    rider_nickname: '',
    jersey_size: '',
    date_of_birth: '',
    gender: 'BOY' as 'BOY' | 'GIRL',
    plate_number: '',
    plate_suffix: '',
    club: '',
  })

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [dragActiveKey, setDragActiveKey] = useState<string | null>(null)
  const photoPreview = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile])
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editing, setEditing] = useState<RiderItem | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    rider_nickname: '',
    jersey_size: '',
    date_of_birth: '',
    gender: 'BOY' as 'BOY' | 'GIRL',
    plate_number: '',
    plate_suffix: '',
    club: '',
  })
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null)
  const [editPhotoStatus, setEditPhotoStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [extraCategoryId, setExtraCategoryId] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview)
    }
  }, [photoPreview])

  const pickAcceptedImageFile = (files: FileList | null | undefined) => {
    if (!files) return null
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) return file
    }
    return null
  }

  const onDropZoneOver = (key: string, e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActiveKey(key)
  }

  const onDropZoneLeave = (key: string, e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (dragActiveKey === key) setDragActiveKey(null)
  }

  const onDropZoneDrop = (key: string, e: DragEvent<HTMLElement>, onFile: (file: File | null) => void) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActiveKey(null)
    const file = pickAcceptedImageFile(e.dataTransfer?.files)
    if (file) onFile(file)
  }

  const onDropZonePaste = (e: ClipboardEvent<HTMLElement>, onFile: (file: File | null) => void) => {
    const file = pickAcceptedImageFile(e.clipboardData?.files)
    if (!file) return
    e.preventDefault()
    onFile(file)
  }

  const dropZoneStyle = (key: string) => ({
    display: 'flex',
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
    padding: 12,
    borderRadius: 12,
    border: dragActiveKey === key ? '2px solid #e11d48' : '2px solid #111',
    background: dragActiveKey === key ? '#ffe4e6' : '#fff',
    cursor: 'pointer',
  })

  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers: Record<string, string> = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json'
    const res = await fetch(url, { ...options, headers })
    const json = await res.json().catch(() => ({}))
    return { res, json }
  }

  const loadCategories = async () => {
    if (!eventId) return
    const res = await fetch(`/api/events/${eventId}/categories`)
    const json = await res.json()
    const list = (json.data ?? []) as CategoryItem[]
    const enabled = list.filter((c) => c.enabled)
    setCategories(enabled)
    if (!selectedCategory && enabled.length > 0) {
      setSelectedCategory(enabled[0].id)
    }
  }

  const fetchLatestCategories = async () => {
    if (!eventId) return [] as CategoryItem[]
    const res = await fetch(`/api/events/${eventId}/categories`)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(json?.error || 'Gagal mengambil data kategori terbaru.')
    }
    return ((json.data ?? []) as CategoryItem[]).filter((category) => category.enabled)
  }

  const loadRiders = async (nextPage = page, nextQuery = query) => {
    if (!eventId) return
    if (!selectedCategory) {
      setRiders([])
      setTotal(0)
      return
    }
    setLoading(true)
    try {
      const { json: eventJson } = await apiFetch(`/api/events/${eventId}`)
      setEventStatus(eventJson?.data?.status ?? null)

      const qs = new URLSearchParams({
        event_id: eventId,
        category_id: selectedCategory,
        page: String(nextPage),
        page_size: String(pageSize),
      })
      if (nextQuery.trim()) qs.set('q', nextQuery.trim())
      const res = await fetch(`/api/riders?${qs.toString()}`)
      const json = await res.json()
      setRiders(json.data ?? [])
      setTotal(json.total ?? 0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCategories()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  useEffect(() => {
    loadRiders(page, query)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, selectedCategory, page, query])

  const resetCreateForm = () => {
    setForm({
      name: '',
      rider_nickname: '',
      jersey_size: '',
      date_of_birth: '',
      gender: 'BOY',
      plate_number: '',
      plate_suffix: '',
      club: '',
    })
    setPhotoFile(null)
  }

  const closeAddModal = () => {
    if (saving) return
    setAddModalOpen(false)
    resetCreateForm()
  }

  const handleCreate = async () => {
    if (!eventId) {
      alert('Event ID tidak ditemukan. Coba kembali ke Events lalu klik Manage Event lagi.')
      return
    }
    if (!form.name.trim() || !form.date_of_birth.trim() || !form.plate_number.trim()) {
      alert('Nama, Tanggal Lahir, dan Plate Number wajib diisi.')
      return
    }

    setSaving(true)
    try {
      const payload = {
        event_id: eventId,
        name: form.name.trim(),
        rider_nickname: form.rider_nickname.trim() || null,
        jersey_size: form.jersey_size || null,
        date_of_birth: form.date_of_birth,
        gender: form.gender,
        plate_number: form.plate_number.trim(),
        plate_suffix: form.plate_suffix.trim().toUpperCase() || null,
        club: form.club.trim() || null,
      }

      const { res, json } = await apiFetch('/api/riders', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      if (res.status === 409) {
        const suggestion = json?.suggested_suffix as string | null
        if (suggestion) {
          setForm((prev) => ({ ...prev, plate_suffix: suggestion }))
          alert(`Plate number sudah dipakai. Saran suffix: ${suggestion}`)
        } else {
          alert('Plate number sudah dipakai.')
        }
        return
      }

      if (!res.ok) {
        throw new Error(json?.error || 'Gagal membuat rider')
      }

      const riderId = json?.data?.id as string | undefined
      if (photoFile && riderId) {
        const { full, thumb } = await buildResizedBlobs(photoFile)
        const fd = new FormData()
        fd.append('full', new File([full.blob], `full.${full.ext}`, { type: full.type }))
        fd.append('thumb', new File([thumb.blob], `thumb.${thumb.ext}`, { type: thumb.type }))

        const upload = await apiFetch(`/api/riders/${riderId}/photo`, { method: 'POST', body: fd })
        if (!upload.res.ok) throw new Error(upload.json?.error || 'Upload photo failed')
      }

      resetCreateForm()
      setAddModalOpen(false)
      setPage(1)
      await loadRiders(1, query)
      alert('Rider berhasil ditambahkan.')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menyimpan rider.')
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (rider: RiderItem) => {
    setEditing(rider)
    setEditPhotoStatus('idle')
    setEditForm({
      name: rider.name ?? '',
      rider_nickname: rider.rider_nickname ?? '',
      jersey_size: rider.jersey_size ?? '',
      date_of_birth: rider.date_of_birth ?? '',
      gender: rider.gender,
      plate_number: rider.plate_number ?? '',
      plate_suffix: rider.plate_suffix ?? '',
      club: rider.club ?? '',
    })
    setEditPhotoFile(null)
    setExtraCategoryId(null)
    apiFetch(`/api/riders/${rider.id}/extra-category`)
      .then(({ json }) => {
        setExtraCategoryId(json?.data?.category_id ?? null)
      })
      .catch(() => {
        setExtraCategoryId(null)
      })
  }

  const closeEdit = () => {
    setEditing(null)
    setEditPhotoFile(null)
    setEditPhotoStatus('idle')
    setExtraCategoryId(null)
  }

  const handleUpdate = async () => {
    if (!editing) return
    if (!editForm.name.trim() || !editForm.date_of_birth.trim()) {
      alert('Nama dan Tanggal Lahir wajib diisi.')
      return
    }
    if (eventStatus !== 'LIVE' && !editForm.plate_number.trim()) {
      alert('Plate Number wajib diisi.')
      return
    }
    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: editForm.name.trim(),
        rider_nickname: editForm.rider_nickname.trim() || null,
        jersey_size: editForm.jersey_size || null,
        date_of_birth: editForm.date_of_birth,
        gender: editForm.gender,
        club: editForm.club.trim() || null,
      }

      if (eventStatus !== 'LIVE') {
        payload.plate_number = editForm.plate_number.trim()
        payload.plate_suffix = editForm.plate_suffix.trim().toUpperCase() || null
      }

      const { res, json } = await apiFetch(`/api/riders/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })

      if (res.status === 409) {
        const suggestion = json?.suggested_suffix as string | null
        if (suggestion) {
          setEditForm((prev) => ({ ...prev, plate_suffix: suggestion }))
          alert(`Plate number sudah dipakai. Saran suffix: ${suggestion}`)
        } else {
          alert('Plate number sudah dipakai.')
        }
        return
      }

      if (!res.ok) throw new Error(json?.error || 'Gagal update rider')

      if (editPhotoFile) {
        setEditPhotoStatus('uploading')
        const { full, thumb } = await buildResizedBlobs(editPhotoFile)
        const fd = new FormData()
        fd.append('full', new File([full.blob], `full.${full.ext}`, { type: full.type }))
        fd.append('thumb', new File([thumb.blob], `thumb.${thumb.ext}`, { type: thumb.type }))
        const upload = await apiFetch(`/api/riders/${editing.id}/photo`, { method: 'POST', body: fd })
        if (!upload.res.ok) {
          setEditPhotoStatus('error')
          throw new Error(upload.json?.error || 'Upload photo failed')
        }
        setEditPhotoStatus('success')
      }

      const extraRes = await apiFetch(`/api/riders/${editing.id}/extra-category`, {
        method: 'PUT',
        body: JSON.stringify({ category_id: extraCategoryId }),
      })
      if (!extraRes.res.ok) throw new Error(extraRes.json?.error || 'Gagal update extra category')

      await Promise.all([loadRiders(page, query), loadCategories()])
      closeEdit()
      alert('Rider berhasil diupdate.')
    } catch (err: unknown) {
      if (editPhotoFile) setEditPhotoStatus('error')
      alert(err instanceof Error ? err.message : 'Gagal update rider.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (riderId: string) => {
    if (eventStatus === 'LIVE') {
      alert('Event sudah LIVE. Rider tidak bisa dihapus.')
      return
    }
    const ok = window.confirm('Hapus rider ini? Data akan dihapus permanen.')
    if (!ok) return
    setSaving(true)
    try {
      const { res, json } = await apiFetch(`/api/riders/${riderId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(json?.error || 'Gagal hapus rider.')
      await Promise.all([loadRiders(page, query), loadCategories()])
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal hapus rider.')
    } finally {
      setSaving(false)
    }
  }

  const toCsvCell = (value: string | number | null | undefined) => {
    const text = value == null ? '' : String(value)
    return `"${text.replace(/"/g, '""')}"`
  }

  const CSV_DELIMITER = ';'

  const downloadCsvFile = (filename: string, lines: string[]) => {
    const content = `\uFEFFsep=${CSV_DELIMITER}\n${lines.join('\n')}`
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  const toFileSlug = (value: string) => {
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return slug || 'category'
  }

  const escapeHtml = (value: string | number | null | undefined) => {
    const text = value == null ? '' : String(value)
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  const escapeXml = (value: string | number | null | undefined) => {
    const text = value == null ? '' : String(value)
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  const sanitizeWorksheetName = (value: string, fallback: string) => {
    const sanitized = value.replace(/[\\/:?*\[\]]/g, ' ').trim().replace(/\s+/g, ' ')
    return (sanitized || fallback).slice(0, 31)
  }

  const downloadExcelXmlFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'application/vnd.ms-excel;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  const fetchExportRows = async (categoryId?: string | null, searchText = query) => {
    const exportRows: RiderItem[] = []
    const exportPageSize = 200
    let currentPage = 1
    let expectedTotal = 0

    while (true) {
      const qs = new URLSearchParams({
        event_id: eventId,
        page: String(currentPage),
        page_size: String(exportPageSize),
      })
      if (categoryId) qs.set('category_id', categoryId)
      if (searchText.trim()) qs.set('q', searchText.trim())

      const res = await fetch(`/api/riders?${qs.toString()}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || 'Gagal mengambil data rider untuk export.')
      }

      const pageRows = (json.data ?? []) as RiderItem[]
      expectedTotal = Number(json.total ?? 0)
      exportRows.push(...pageRows)

      if (pageRows.length === 0 || exportRows.length >= expectedTotal) break
      currentPage += 1
    }

    return exportRows
  }

  const buildAllCategoryExportData = async () => {
    const exportCategories = await fetchLatestCategories()
    if (exportCategories.length === 0) {
      throw new Error('Belum ada kategori aktif untuk diexport.')
    }

    const allRegisteredRows = await fetchExportRows(undefined, '')
    const totalRegistered = allRegisteredRows.length
    if (totalRegistered === 0) {
      throw new Error('Belum ada rider terdaftar di semua kategori.')
    }

    const categoryGroups: ExportCategoryGroup[] = []
    let totalAcrossCategories = 0

    for (const category of exportCategories) {
      const rows = await fetchExportRows(category.id, '')
      totalAcrossCategories += rows.length
      const capacity = typeof category.capacity === 'number' ? category.capacity : null
      const filled = rows.length
      const remaining = capacity == null ? null : Math.max(0, capacity - filled)
      const status =
        capacity == null ? 'TANPA BATAS' : filled >= capacity ? 'PENUH' : 'TERSEDIA'

      categoryGroups.push({
        summary: {
          id: category.id,
          label: category.label,
          capacity,
          filled,
          remaining,
          status,
        },
        rows,
      })
    }

    return {
      totalRegistered,
      upClassCount: Math.max(0, totalAcrossCategories - totalRegistered),
      categoryGroups,
    }
  }

  const handleExportRiders = async () => {
    if (!eventId) {
      alert('Event ID tidak valid.')
      return
    }
    if (!selectedCategory) {
      alert('Pilih kategori terlebih dahulu.')
      return
    }

    setExporting(true)
    try {
      const exportRows = await fetchExportRows(selectedCategory)

      if (exportRows.length === 0) {
        alert('Tidak ada data rider untuk diexport.')
        return
      }

      const header = [
        'no_plate_display',
        'plate_number',
        'plate_suffix',
        'name',
        'rider_nickname',
        'gender',
        'date_of_birth',
        'birth_year',
        'jersey_size',
        'club',
        'category',
      ]

      const lines = [
        header.join(CSV_DELIMITER),
        ...exportRows.map((row) =>
          [
            toCsvCell(row.no_plate_display),
            toCsvCell(row.plate_number),
            toCsvCell(row.plate_suffix ?? ''),
            toCsvCell(row.name),
            toCsvCell(row.rider_nickname ?? ''),
            toCsvCell(row.gender),
            toCsvCell(row.date_of_birth),
            toCsvCell(row.birth_year ?? ''),
            toCsvCell(row.jersey_size ?? ''),
            toCsvCell(row.club ?? ''),
            toCsvCell(selectedCategoryLabel || selectedCategory),
          ].join(CSV_DELIMITER)
        ),
      ]

      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      const categorySlug = toFileSlug(selectedCategoryLabel || selectedCategory)
      downloadCsvFile(`riders_${categorySlug}_${stamp}.csv`, lines)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal export rider.')
    } finally {
      setExporting(false)
    }
  }

  const handleExportRidersPdf = async () => {
    if (!eventId) {
      alert('Event ID tidak valid.')
      return
    }
    if (!selectedCategory) {
      alert('Pilih kategori terlebih dahulu.')
      return
    }

    setExportingPdf(true)
    try {
      const exportRows = await fetchExportRows(selectedCategory)
      if (exportRows.length === 0) {
        alert('Tidak ada data rider untuk diexport.')
        return
      }

      const title = `Riders - ${selectedCategoryLabel || selectedCategory}`
      const generatedAt = new Date().toLocaleString('id-ID')
      const tableRows = exportRows
        .map(
          (row, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${escapeHtml(row.no_plate_display)}</td>
              <td>${escapeHtml(row.name)}</td>
              <td>${escapeHtml(row.rider_nickname ?? '-')}</td>
              <td>${escapeHtml(row.gender)}</td>
              <td>${escapeHtml(row.date_of_birth)}</td>
              <td>${escapeHtml(row.jersey_size ?? '-')}</td>
              <td>${escapeHtml(row.club ?? '-')}</td>
            </tr>
          `
        )
        .join('')

      const html = `
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>${escapeHtml(title)}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; color: #111827; }
              h1 { margin: 0 0 8px 0; font-size: 20px; }
              .meta { margin-bottom: 12px; font-size: 12px; color: #374151; }
              table { width: 100%; border-collapse: collapse; font-size: 12px; }
              th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; }
              th { background: #f3f4f6; font-weight: 700; }
              @page { size: A4 portrait; margin: 12mm; }
            </style>
          </head>
          <body>
            <h1>${escapeHtml(title)}</h1>
            <div class="meta">
              Total Rider: ${exportRows.length} | Generated: ${escapeHtml(generatedAt)}${
                query.trim() ? ` | Filter: ${escapeHtml(query.trim())}` : ''
              }
            </div>
            <table>
              <thead>
                <tr>
                  <th>No</th>
                  <th>No Plate</th>
                  <th>Nama Rider</th>
                  <th>Nickname</th>
                  <th>Gender</th>
                  <th>Tanggal Lahir</th>
                  <th>Jersey</th>
                  <th>Club</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
          </body>
        </html>
      `

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
        throw new Error('Gagal membuka preview PDF.')
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
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal export PDF rider.')
    } finally {
      setExportingPdf(false)
    }
  }

  const handleExportAllRiders = async () => {
    if (!eventId) {
      alert('Event ID tidak valid.')
      return
    }

    setExportingAll(true)
    try {
      const { totalRegistered, upClassCount, categoryGroups } = await buildAllCategoryExportData()
      const categorySections: string[] = []

      for (const group of categoryGroups) {
        const { summary, rows } = group
        categorySections.push([toCsvCell('Kategori'), toCsvCell(summary.label)].join(CSV_DELIMITER))
        categorySections.push(
          [
            toCsvCell('Kapasitas'),
            toCsvCell(typeof summary.capacity === 'number' ? summary.capacity : 'Tanpa batas'),
          ].join(CSV_DELIMITER)
        )
        categorySections.push([toCsvCell('Terisi'), toCsvCell(summary.filled)].join(CSV_DELIMITER))
        categorySections.push(
          [
            toCsvCell('Sisa Slot'),
            toCsvCell(typeof summary.remaining === 'number' ? summary.remaining : 'Tanpa batas'),
          ].join(CSV_DELIMITER)
        )
        categorySections.push([toCsvCell('Status Kuota'), toCsvCell(summary.status)].join(CSV_DELIMITER))
        categorySections.push(
          [
            'no_plate_display',
            'plate_number',
            'plate_suffix',
            'name',
            'rider_nickname',
            'gender',
            'date_of_birth',
            'birth_year',
            'jersey_size',
            'club',
          ].join(CSV_DELIMITER)
        )

        if (rows.length === 0) {
          categorySections.push([toCsvCell('Tidak ada rider terdaftar di kategori ini')].join(CSV_DELIMITER))
        } else {
          categorySections.push(
            ...rows.map((row) =>
              [
                toCsvCell(row.no_plate_display),
                toCsvCell(row.plate_number),
                toCsvCell(row.plate_suffix ?? ''),
                toCsvCell(row.name),
                toCsvCell(row.rider_nickname ?? ''),
                toCsvCell(row.gender),
                toCsvCell(row.date_of_birth),
                toCsvCell(row.birth_year ?? ''),
                toCsvCell(row.jersey_size ?? ''),
                toCsvCell(row.club ?? ''),
              ].join(CSV_DELIMITER)
            )
          )
        }

        categorySections.push('')
      }
      const lines: string[] = [
        [toCsvCell('Jumlah Rider Terdaftar'), toCsvCell(totalRegistered)].join(CSV_DELIMITER),
        [toCsvCell('Jumlah Rider Ambil Up Class'), toCsvCell(upClassCount)].join(CSV_DELIMITER),
        [toCsvCell('Sisa Slot per Kategori'), toCsvCell('')].join(CSV_DELIMITER),
        ['kategori', 'kapasitas', 'terisi', 'sisa_slot', 'status_kuota'].join(CSV_DELIMITER),
        ...categoryGroups.map(({ summary }) =>
          [
            toCsvCell(summary.label),
            toCsvCell(typeof summary.capacity === 'number' ? summary.capacity : 'Tanpa batas'),
            toCsvCell(summary.filled),
            toCsvCell(typeof summary.remaining === 'number' ? summary.remaining : 'Tanpa batas'),
            toCsvCell(summary.status),
          ].join(CSV_DELIMITER)
        ),
        '',
        ...categorySections,
      ]

      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
      downloadCsvFile(`riders_all_by_category_${stamp}.csv`, lines)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal export semua rider.')
    } finally {
      setExportingAll(false)
    }
  }

  const handleExportExcelRapi = async () => {
    if (!eventId) {
      alert('Event ID tidak valid.')
      return
    }

    setExportingExcel(true)
    try {
      const { totalRegistered, upClassCount, categoryGroups } = await buildAllCategoryExportData()
      const generatedAt = new Date()

      const xmlCell = (
        value: string | number | null | undefined,
        styleId: string,
        type: 'String' | 'Number' = 'String',
        mergeAcross = 0
      ) => {
        const mergeAttr = mergeAcross > 0 ? ` ss:MergeAcross="${mergeAcross}"` : ''
        return `<Cell ss:StyleID="${styleId}"${mergeAttr}><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`
      }

      const xmlEmptyCell = () => '<Cell/>'
      const xmlRow = (cells: string[]) => `<Row>${cells.join('')}</Row>`

      const summaryRows: string[] = [
        xmlRow([xmlCell('LAPORAN RIDER EVENT', 'Title',  'String', 4)]),
        xmlRow([xmlCell(`Generated: ${generatedAt.toLocaleString('id-ID')}`, 'Subtle', 'String', 4)]),
        xmlRow([xmlCell('', 'Default', 'String', 4)]),
        xmlRow([xmlCell('Jumlah Rider Terdaftar', 'Label'), xmlCell(totalRegistered, 'ValueNumber', 'Number')]),
        xmlRow([xmlCell('Jumlah Rider Ambil Up Class', 'Label'), xmlCell(upClassCount, 'ValueNumber', 'Number')]),
        xmlRow([xmlCell('', 'Default', 'String', 4)]),
        xmlRow([
          xmlCell('Kategori', 'Header'),
          xmlCell('Kapasitas', 'Header'),
          xmlCell('Terisi', 'Header'),
          xmlCell('Sisa Slot', 'Header'),
          xmlCell('Status', 'Header'),
        ]),
        ...categoryGroups.map(({ summary }) =>
          xmlRow([
            xmlCell(summary.label, 'Text'),
            xmlCell(summary.capacity == null ? 'Tanpa batas' : summary.capacity, summary.capacity == null ? 'Text' : 'ValueNumber', summary.capacity == null ? 'String' : 'Number'),
            xmlCell(summary.filled, 'ValueNumber', 'Number'),
            xmlCell(
              summary.remaining == null ? 'Tanpa batas' : summary.remaining,
              summary.remaining == null ? 'Text' : summary.status === 'PENUH' ? 'StatusRed' : 'StatusGreen',
              summary.remaining == null ? 'String' : 'Number'
            ),
            xmlCell(summary.status, summary.status === 'PENUH' ? 'StatusRed' : summary.status === 'TERSEDIA' ? 'StatusGreen' : 'StatusBlue'),
          ])
        ),
      ]

      const detailRows: string[] = [
        xmlRow([xmlCell('SEMUA RIDER PER KATEGORI', 'Title', 'String', 9)]),
        xmlRow([xmlCell(`Generated: ${generatedAt.toLocaleString('id-ID')}`, 'Subtle', 'String', 9)]),
        xmlRow([xmlCell('', 'Default', 'String', 9)]),
      ]

      for (const { summary, rows } of categoryGroups) {
        detailRows.push(xmlRow([xmlCell(summary.label, 'Section', 'String', 9)]))
        detailRows.push(
          xmlRow([
            xmlCell('Kapasitas', 'Label'),
            xmlCell(summary.capacity == null ? 'Tanpa batas' : summary.capacity, summary.capacity == null ? 'Text' : 'ValueNumber', summary.capacity == null ? 'String' : 'Number'),
            xmlCell('Terisi', 'Label'),
            xmlCell(summary.filled, 'ValueNumber', 'Number'),
            xmlCell('Sisa Slot', 'Label'),
            xmlCell(
              summary.remaining == null ? 'Tanpa batas' : summary.remaining,
              summary.remaining == null ? 'Text' : summary.status === 'PENUH' ? 'StatusRed' : 'StatusGreen',
              summary.remaining == null ? 'String' : 'Number'
            ),
            xmlCell('Status', 'Label'),
            xmlCell(summary.status, summary.status === 'PENUH' ? 'StatusRed' : summary.status === 'TERSEDIA' ? 'StatusGreen' : 'StatusBlue'),
          ])
        )
        detailRows.push(
          xmlRow([
            xmlCell('No Plate', 'Header'),
            xmlCell('Plate Number', 'Header'),
            xmlCell('Suffix', 'Header'),
            xmlCell('Nama Rider', 'Header'),
            xmlCell('Panggilan', 'Header'),
            xmlCell('Gender', 'Header'),
            xmlCell('Tanggal Lahir', 'Header'),
            xmlCell('Tahun Lahir', 'Header'),
            xmlCell('Jersey', 'Header'),
            xmlCell('Club', 'Header'),
          ])
        )

        if (rows.length === 0) {
          detailRows.push(xmlRow([xmlCell('Tidak ada rider terdaftar di kategori ini', 'Subtle', 'String', 9)]))
        } else {
          detailRows.push(
            ...rows.map((row) =>
              xmlRow([
                xmlCell(row.no_plate_display, 'Text'),
                xmlCell(row.plate_number, 'Text'),
                xmlCell(row.plate_suffix ?? '-', 'Text'),
                xmlCell(row.name, 'Text'),
                xmlCell(row.rider_nickname ?? '-', 'Text'),
                xmlCell(row.gender, row.gender === 'GIRL' ? 'StatusPink' : 'StatusBlue'),
                xmlCell(row.date_of_birth, 'Text'),
                xmlCell(row.birth_year ?? '', typeof row.birth_year === 'number' ? 'ValueNumber' : 'Text', typeof row.birth_year === 'number' ? 'Number' : 'String'),
                xmlCell(row.jersey_size ?? '-', 'Text'),
                xmlCell(row.club ?? '-', 'Text'),
              ])
            )
          )
        }

        detailRows.push(xmlRow([xmlEmptyCell()]))
      }

      const workbookXml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#0f172a"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="Title">
   <Font ss:FontName="Calibri" ss:Size="16" ss:Bold="1" ss:Color="#0f172a"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Section">
   <Font ss:FontName="Calibri" ss:Size="13" ss:Bold="1" ss:Color="#0f172a"/>
   <Interior ss:Color="#DCEAFE" ss:Pattern="Solid"/>
   <Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/></Borders>
  </Style>
  <Style ss:ID="Header">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1E293B" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
  </Style>
  <Style ss:ID="Label">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#334155"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="Text">
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
  </Style>
  <Style ss:ID="ValueNumber">
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
   <NumberFormat ss:Format="0"/>
  </Style>
  <Style ss:ID="Subtle">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Color="#64748B"/>
  </Style>
  <Style ss:ID="StatusGreen">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#166534"/>
   <Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
  </Style>
  <Style ss:ID="StatusRed">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#991B1B"/>
   <Interior ss:Color="#FEE2E2" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
  </Style>
  <Style ss:ID="StatusBlue">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#1D4ED8"/>
   <Interior ss:Color="#DBEAFE" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
  </Style>
  <Style ss:ID="StatusPink">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#9D174D"/>
   <Interior ss:Color="#FCE7F3" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
   </Borders>
  </Style>
 </Styles>
 <Worksheet ss:Name="${escapeXml(sanitizeWorksheetName('Ringkasan', 'Ringkasan'))}">
  <Table>
   <Column ss:Width="220"/>
   <Column ss:Width="110"/>
   <Column ss:Width="90"/>
   <Column ss:Width="90"/>
   <Column ss:Width="110"/>
   ${summaryRows.join('')}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>7</SplitHorizontal>
   <TopRowBottomPane>7</TopRowBottomPane>
   <ProtectObjects>False</ProtectObjects>
   <ProtectScenarios>False</ProtectScenarios>
  </WorksheetOptions>
 </Worksheet>
 <Worksheet ss:Name="${escapeXml(sanitizeWorksheetName('Semua Rider', 'Semua Rider'))}">
  <Table>
   <Column ss:Width="85"/>
   <Column ss:Width="85"/>
   <Column ss:Width="60"/>
   <Column ss:Width="180"/>
   <Column ss:Width="140"/>
   <Column ss:Width="70"/>
   <Column ss:Width="95"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Column ss:Width="180"/>
   ${detailRows.join('')}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>3</SplitHorizontal>
   <TopRowBottomPane>3</TopRowBottomPane>
   <ProtectObjects>False</ProtectObjects>
   <ProtectScenarios>False</ProtectScenarios>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`

      const stamp = generatedAt.toISOString().slice(0, 19).replace(/[:T]/g, '-')
      downloadExcelXmlFile(`riders_rapi_${stamp}.xls`, workbookXml)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal export Excel rapi.')
    } finally {
      setExportingExcel(false)
    }
  }

  const selectedCategoryMeta = categories.find((category) => category.id === selectedCategory) ?? null
  const addEligibleCategories = categories.length > 0
  const editBirthYear = Number(String(editForm.date_of_birth).slice(0, 4))
  const eligibleExtraCategories = categories.filter((category) => {
    const max = category.year_max ?? category.year
    if (max >= editBirthYear) return false
    if (category.gender === 'MIX') return true
    return category.gender === editForm.gender
  })

  return (
    <div className="grid gap-6">
      <section className="admin-surface overflow-hidden px-6 py-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-2">
            <div className={labelClass}>Riders</div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">Riders</h1>
          </div>
          <button type="button" onClick={() => setAddModalOpen(true)} className={buttonPrimaryClass}>
            Add Rider
          </button>
        </div>
      </section>

      {eventStatus === 'LIVE' && (
        <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-800">
          Plate number dan suffix terkunci saat event LIVE.
        </div>
      )}

      <section className="admin-surface overflow-hidden px-6 py-6 lg:px-8">
        <div className="grid gap-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className={labelClass}>Category</div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-600">
              {selectedCategoryMeta ? selectedCategoryMeta.label : 'No category selected'}
            </div>
          </div>

          {categories.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm font-bold text-slate-500">
              Kategori belum tersedia.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {categories.map((category) => {
                const active = selectedCategory === category.id
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(category.id)
                      setPage(1)
                    }}
                    className={`rounded-[1.4rem] border px-4 py-4 text-left transition-colors ${
                      active
                        ? 'border-amber-300 bg-amber-50 shadow-[0_12px_26px_rgba(251,191,36,0.18)]'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="text-sm font-black tracking-tight text-slate-900">{category.label}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold text-slate-500">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                        {category.gender}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                        {category.year_min ?? category.year} - {category.year_max ?? category.year}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section className="admin-surface overflow-hidden px-6 py-6 lg:px-8">
        <div className="grid gap-4">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <input
              placeholder="Search name / no plate"
              value={query}
              onChange={(e) => {
                setPage(1)
                setQuery(e.target.value)
              }}
              className={inputClass}
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleExportRiders}
                disabled={exporting || exportingAll || exportingPdf || exportingExcel || loading || !selectedCategory}
                className={buttonSecondaryClass}
              >
                {exporting ? 'Exporting CSV...' : 'Export CSV'}
              </button>
              <button
                type="button"
                onClick={handleExportAllRiders}
                disabled={exportingAll || exporting || exportingPdf || exportingExcel || loading}
                className={buttonSecondaryClass}
              >
                {exportingAll ? 'Exporting...' : 'Export All'}
              </button>
              <button
                type="button"
                onClick={handleExportExcelRapi}
                disabled={exportingExcel || exportingAll || exporting || exportingPdf || loading}
                className={buttonSecondaryClass}
              >
                {exportingExcel ? 'Preparing Excel...' : 'Export Excel'}
              </button>
              <button
                type="button"
                onClick={handleExportRidersPdf}
                disabled={exportingPdf || exportingAll || exporting || exportingExcel || loading || !selectedCategory}
                className={buttonSecondaryClass}
              >
                {exportingPdf ? 'Preparing PDF...' : 'Export PDF'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-600">
              Total: {total}
            </div>
            {selectedCategoryLabel && (
              <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600">
                {selectedCategoryLabel}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="admin-surface overflow-hidden px-6 py-6 lg:px-8">
        {!selectedCategory && (
          <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm font-bold text-slate-500">
            Pilih kategori.
          </div>
        )}

        {loading && (
          <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm font-bold text-slate-500">
            Loading...
          </div>
        )}

        {!loading && selectedCategory && riders.length === 0 && (
          <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm font-bold text-slate-500">
            Belum ada rider.
          </div>
        )}

        {!loading && selectedCategory && riders.length > 0 && (
          <div className="grid gap-4">
            {riders.map((rider) => (
              <article
                key={rider.id}
                className="grid gap-4 rounded-[1.6rem] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#ffffff_72%,#f8fafc_100%)] p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)] lg:grid-cols-[72px_minmax(0,1fr)_auto]"
              >
                <div className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-[1.4rem] border border-slate-200 bg-slate-50 text-sm font-black text-slate-500">
                  {rider.photo_thumbnail_url ? (
                    <img
                      src={rider.photo_thumbnail_url}
                      alt={rider.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    'NO'
                  )}
                </div>

                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-lg font-black tracking-tight text-slate-950">
                      {rider.no_plate_display} - {rider.name}
                    </div>
                    {rider.jersey_size && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">
                        {rider.jersey_size}
                      </span>
                    )}
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-slate-600">
                      {rider.gender}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-slate-500">
                    <span>{rider.date_of_birth}</span>
                    {rider.club && <span>{rider.club}</span>}
                    {rider.rider_nickname && <span>{rider.rider_nickname}</span>}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 lg:flex-col">
                  <button type="button" onClick={() => openEdit(rider)} className={buttonSecondaryClass}>
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={eventStatus === 'LIVE' || saving}
                    onClick={() => handleDelete(rider.id)}
                    className={buttonDangerClass}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={buttonSecondaryClass}
              >
                Prev
              </button>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-600">
                Page {page} / {totalPages}
              </div>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className={buttonSecondaryClass}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {addModalOpen && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[560px] rounded-[1.8rem] border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="grid gap-1">
                <div className={labelClass}>Rider</div>
                <div className="text-2xl font-black tracking-tight text-slate-950">Add Rider</div>
              </div>
              <button type="button" onClick={closeAddModal} className={buttonSecondaryClass}>
                Close
              </button>
            </div>

            <div className="mt-5 grid max-h-[70vh] gap-4 overflow-y-auto pr-1">
              <input
                placeholder="Nama Rider"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
              />
              <input
                placeholder="Nama Panggilan"
                value={form.rider_nickname}
                onChange={(e) => setForm({ ...form, rider_nickname: e.target.value })}
                className={inputClass}
              />
              <select value={form.jersey_size} onChange={(e) => setForm({ ...form, jersey_size: e.target.value })} className={inputClass}>
                <option value="">Ukuran Jersey</option>
                <option value="XS">XS</option>
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
                <option value="XL">XL</option>
                <option value="2XL">2XL</option>
                <option value="3XL">3XL</option>
              </select>
              <input
                type="date"
                value={form.date_of_birth}
                onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                className={inputClass}
              />
              <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value as 'BOY' | 'GIRL' })} className={inputClass}>
                <option value="BOY">BOY</option>
                <option value="GIRL">GIRL</option>
              </select>
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  inputMode="numeric"
                  placeholder="Plate Number"
                  value={form.plate_number}
                  onChange={(e) => setForm({ ...form, plate_number: e.target.value.replace(/[^\d]/g, '') })}
                  className={inputClass}
                />
                <input
                  placeholder="Suffix"
                  value={form.plate_suffix}
                  onChange={(e) => setForm({ ...form, plate_suffix: e.target.value.toUpperCase().slice(0, 1) })}
                  className={inputClass}
                />
              </div>
              <input
                placeholder="Club"
                value={form.club}
                onChange={(e) => setForm({ ...form, club: e.target.value })}
                className={inputClass}
              />

              <div className="grid gap-2">
                <div className={labelClass}>Photo</div>
                <label
                  tabIndex={0}
                  onDragEnter={(e) => onDropZoneOver('add-photo', e)}
                  onDragOver={(e) => onDropZoneOver('add-photo', e)}
                  onDragLeave={(e) => onDropZoneLeave('add-photo', e)}
                  onDrop={(e) => onDropZoneDrop('add-photo', e, setPhotoFile)}
                  onPaste={(e) => onDropZonePaste(e, setPhotoFile)}
                  style={dropZoneStyle('add-photo')}
                >
                  <span style={{ fontWeight: 700, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {photoFile ? photoFile.name : 'Pilih file'}
                  </span>
                  <span
                    style={{
                      padding: '6px 10px',
                      borderRadius: 10,
                      border: '2px solid #111',
                      fontWeight: 900,
                      fontSize: 11,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: '#0f172a',
                      flexShrink: 0,
                    }}
                  >
                    Browse
                  </span>
                  <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
                </label>
                {photoPreview && (
                  <img
                    src={photoPreview}
                    alt="Preview"
                    style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 16, border: '2px solid #111' }}
                    loading="lazy"
                  />
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeAddModal} className={buttonSecondaryClass}>
                Cancel
              </button>
              <button type="button" onClick={handleCreate} disabled={saving || !addEligibleCategories} className={buttonPrimaryClass}>
                {saving ? 'Saving...' : 'Add Rider'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[560px] rounded-[1.8rem] border border-slate-200 bg-white p-6 text-slate-900 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="grid gap-1">
                <div className={labelClass}>Rider</div>
                <div className="text-2xl font-black tracking-tight text-slate-950">Edit Rider</div>
              </div>
              <button type="button" onClick={closeEdit} className={buttonSecondaryClass}>
                Close
              </button>
            </div>

            <div className="mt-5 grid max-h-[70vh] gap-4 overflow-y-auto pr-1">
              <input
                placeholder="Nama Rider"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className={inputClass}
              />
              <input
                placeholder="Nama Panggilan"
                value={editForm.rider_nickname}
                onChange={(e) => setEditForm({ ...editForm, rider_nickname: e.target.value })}
                className={inputClass}
              />
              <select value={editForm.jersey_size} onChange={(e) => setEditForm({ ...editForm, jersey_size: e.target.value })} className={inputClass}>
                <option value="">Ukuran Jersey</option>
                <option value="XS">XS</option>
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
                <option value="XL">XL</option>
                <option value="2XL">2XL</option>
                <option value="3XL">3XL</option>
              </select>
              <input
                type="date"
                value={editForm.date_of_birth}
                onChange={(e) => setEditForm({ ...editForm, date_of_birth: e.target.value })}
                className={inputClass}
              />
              <select
                value={editForm.gender}
                onChange={(e) => setEditForm({ ...editForm, gender: e.target.value as 'BOY' | 'GIRL' })}
                className={inputClass}
              >
                <option value="BOY">BOY</option>
                <option value="GIRL">GIRL</option>
              </select>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_92px]">
                <input
                  inputMode="numeric"
                  placeholder="Plate Number"
                  value={editForm.plate_number}
                  onChange={(e) => setEditForm({ ...editForm, plate_number: e.target.value.replace(/[^\d]/g, '') })}
                  disabled={eventStatus === 'LIVE'}
                  className={inputClass}
                />
                <input
                  placeholder="Suffix"
                  value={editForm.plate_suffix}
                  onChange={(e) => setEditForm({ ...editForm, plate_suffix: e.target.value.toUpperCase().slice(0, 1) })}
                  disabled={eventStatus === 'LIVE'}
                  className={inputClass}
                />
              </div>
              <input
                placeholder="Club"
                value={editForm.club}
                onChange={(e) => setEditForm({ ...editForm, club: e.target.value })}
                className={inputClass}
              />

              <div className="grid gap-2">
                <div className={labelClass}>Photo</div>
                <label
                  tabIndex={0}
                  onDragEnter={(e) => onDropZoneOver('edit-photo', e)}
                  onDragOver={(e) => onDropZoneOver('edit-photo', e)}
                  onDragLeave={(e) => onDropZoneLeave('edit-photo', e)}
                  onDrop={(e) => onDropZoneDrop('edit-photo', e, setEditPhotoFile)}
                  onPaste={(e) => onDropZonePaste(e, setEditPhotoFile)}
                  style={dropZoneStyle('edit-photo')}
                >
                  <span style={{ fontWeight: 700, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {editPhotoFile ? editPhotoFile.name : 'Pilih file'}
                  </span>
                  <span
                    style={{
                      padding: '6px 10px',
                      borderRadius: 10,
                      border: '2px solid #111',
                      fontWeight: 900,
                      fontSize: 11,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: '#0f172a',
                      flexShrink: 0,
                    }}
                  >
                    Browse
                  </span>
                  <input type="file" accept="image/*" onChange={(e) => setEditPhotoFile(e.target.files?.[0] ?? null)} style={{ display: 'none' }} />
                </label>
                {editPhotoFile && (
                  <div className="text-sm font-bold text-slate-500">
                    {editPhotoStatus === 'uploading'
                      ? 'Uploading...'
                      : editPhotoStatus === 'success'
                      ? 'Success'
                      : editPhotoStatus === 'error'
                      ? 'Failed'
                      : 'Ready'}
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                <div className={labelClass}>Extra Category</div>
                {eligibleExtraCategories.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">
                    Tidak ada kategori tambahan.
                  </div>
                ) : (
                  <select value={extraCategoryId ?? ''} onChange={(e) => setExtraCategoryId(e.target.value || null)} className={inputClass}>
                    <option value="">Tidak ikut kategori tambahan</option>
                    {eligibleExtraCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeEdit} className={buttonSecondaryClass}>
                Cancel
              </button>
              <button type="button" onClick={handleUpdate} disabled={saving} className={buttonPrimaryClass}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

