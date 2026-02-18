'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'

type CategoryItem = {
  id: string
  year: number
  year_min?: number
  year_max?: number
  gender: 'BOY' | 'GIRL' | 'MIX'
  label: string
  enabled: boolean
}

type RiderItem = {
  id: string
  name: string
  date_of_birth: string
  birth_year?: number
  gender: 'BOY' | 'GIRL'
  plate_number: number
  plate_suffix?: string | null
  no_plate_display: string
  club?: string | null
  photo_thumbnail_url?: string | null
}

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

  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [riders, setRiders] = useState<RiderItem[]>([])
  const [eventStatus, setEventStatus] = useState<'UPCOMING' | 'LIVE' | 'FINISHED' | null>(null)
  const [page, setPage] = useState(1)
  const pageSize = 20
  const [total, setTotal] = useState(0)
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total])
  const [query, setQuery] = useState('')

  const [form, setForm] = useState({
    name: '',
    date_of_birth: '',
    gender: 'BOY' as 'BOY' | 'GIRL',
    plate_number: '',
    plate_suffix: '',
    club: '',
  })

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const photoPreview = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile])
  const [editing, setEditing] = useState<RiderItem | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
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

  const loadRiders = async (nextPage = page, nextQuery = query) => {
    if (!eventId) return
    if (!selectedCategory) {
      setRiders([])
      setTotal(0)
      return
    }
    setLoading(true)
    try {
      const eventRes = await fetch(`/api/events/${eventId}`)
      const eventJson = await eventRes.json()
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
        date_of_birth: form.date_of_birth,
        gender: form.gender,
        plate_number: Number(form.plate_number),
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

      setForm({ name: '', date_of_birth: '', gender: 'BOY', plate_number: '', plate_suffix: '', club: '' })
      setPhotoFile(null)
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
      date_of_birth: rider.date_of_birth ?? '',
      gender: rider.gender,
      plate_number: String(rider.plate_number ?? ''),
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
        date_of_birth: editForm.date_of_birth,
        gender: editForm.gender,
        club: editForm.club.trim() || null,
      }

      if (eventStatus !== 'LIVE') {
        payload.plate_number = Number(editForm.plate_number)
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

      await loadRiders(page, query)
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
      await loadRiders(page, query)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal hapus rider.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 950, margin: 0 }}>Riders</h1>
          <div style={{ marginTop: 8, color: '#333', fontWeight: 700 }}>
            Tahun lahir dibatasi 2016 - 2025. Plate unik per event (contoh: 12, 12A, 7B).
          </div>
        </div>
      </div>
      {eventStatus === 'LIVE' && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: '2px dashed #111',
            background: '#fff',
            fontWeight: 900,
          }}
        >
          Event sudah LIVE. Plate number & suffix tidak bisa diubah.
        </div>
      )}

      <div
        style={{
          marginTop: 16,
          background: '#fff',
          border: '2px solid #111',
          borderRadius: 16,
          padding: 16,
        }}
      >
        <div style={{ fontWeight: 950, fontSize: 18 }}>Add Rider</div>
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <input
            placeholder="Nama Rider"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
          />
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Tanggal Lahir
            </div>
            <input
              type="date"
              value={form.date_of_birth}
              onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
              style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
            />
          </div>
          <select
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value as 'BOY' | 'GIRL' })}
            style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 900 }}
          >
            <option value="BOY">BOY</option>
            <option value="GIRL">GIRL</option>
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input
              inputMode="numeric"
              placeholder="Plate Number (angka)"
              value={form.plate_number}
              onChange={(e) => setForm({ ...form, plate_number: e.target.value.replace(/[^\d]/g, '') })}
              style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 900 }}
            />
            <input
              placeholder="Suffix (opsional, A-Z)"
              value={form.plate_suffix}
              onChange={(e) => setForm({ ...form, plate_suffix: e.target.value.toUpperCase().slice(0, 1) })}
              style={{ padding: 12, borderRadius: 12, border: '2px solid #111', fontWeight: 900 }}
            />
          </div>
          <input
            placeholder="Club (opsional)"
            value={form.club}
            onChange={(e) => setForm({ ...form, club: e.target.value })}
            style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
          />

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Rider Photo (auto resize)
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
              style={{ padding: 12, borderRadius: 12, border: '2px solid #111', background: '#fff' }}
            />
            {photoPreview && (
              <img
                src={photoPreview}
                alt="Preview"
                style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 16, border: '2px solid #111' }}
                loading="lazy"
              />
            )}
          </div>

          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            style={{
              padding: 14,
              borderRadius: 14,
              border: '2px solid #111',
              background: '#2ecc71',
              fontWeight: 950,
              cursor: 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Add Rider'}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        <div style={{ fontWeight: 900 }}>Pilih Kategori</div>
        {categories.length === 0 && (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              border: '2px dashed #111',
              background: '#fff',
              fontWeight: 800,
            }}
          >
            Kategori belum tersedia.
          </div>
        )}
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setSelectedCategory(c.id)
                setPage(1)
              }}
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                border: '2px solid #111',
                background: selectedCategory === c.id ? '#2ecc71' : '#fff',
                fontWeight: 900,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          placeholder="Search name / no plate..."
          value={query}
          onChange={(e) => {
            setPage(1)
            setQuery(e.target.value)
          }}
          style={{ padding: 12, borderRadius: 12, border: '2px solid #111', background: '#fff', flex: 1, minWidth: 220 }}
        />
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '2px dashed #111',
            background: '#fff',
            fontWeight: 900,
          }}
        >
          Total: {total}
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
        {!selectedCategory && (
          <div style={{ padding: 14, border: '2px dashed #111', borderRadius: 16, background: '#fff', fontWeight: 900 }}>
            Pilih kategori untuk melihat daftar rider.
          </div>
        )}
        {loading && (
          <div style={{ padding: 14, border: '2px dashed #111', borderRadius: 16, background: '#fff', fontWeight: 900 }}>
            Loading...
          </div>
        )}

        {!loading && selectedCategory && riders.length === 0 && (
          <div style={{ padding: 14, border: '2px dashed #111', borderRadius: 16, background: '#fff', fontWeight: 900 }}>
            Belum ada rider.
          </div>
        )}

        {riders.map((r) => (
          <div
            key={r.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '56px 1fr auto',
              gap: 12,
              alignItems: 'center',
              padding: 12,
              borderRadius: 16,
              border: '2px solid #111',
              background: '#fff',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                border: '2px solid #111',
                background: '#eaf7ee',
                overflow: 'hidden',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 950,
              }}
            >
              {r.photo_thumbnail_url ? (
                <img
                  src={r.photo_thumbnail_url}
                  alt={r.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  loading="lazy"
                />
              ) : (
                'NO'
              )}
            </div>

            <div style={{ display: 'grid', gap: 2 }}>
              <div style={{ fontWeight: 950, fontSize: 16 }}>
                {r.no_plate_display} - {r.name}
              </div>
              <div style={{ color: '#333', fontWeight: 700, fontSize: 13 }}>
                DOB: {r.date_of_birth} - {r.gender}
                {r.club ? ` - ${r.club}` : ''}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => openEdit(r)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 12,
                  border: '2px solid #111',
                  background: '#fff',
                  fontWeight: 900,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                Edit
              </button>
              <button
                type="button"
                disabled={eventStatus === 'LIVE' || saving}
                onClick={() => handleDelete(r.id)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 12,
                  border: '2px solid #111',
                  background: eventStatus === 'LIVE' ? '#eee' : '#ffe1e1',
                  fontWeight: 900,
                  whiteSpace: 'nowrap',
                  cursor: eventStatus === 'LIVE' ? 'not-allowed' : 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '2px solid #111',
            background: page <= 1 ? '#eee' : '#fff',
            fontWeight: 900,
            cursor: page <= 1 ? 'not-allowed' : 'pointer',
          }}
        >
          Prev
        </button>
        <div style={{ fontWeight: 900 }}>
          Page {page} / {totalPages}
        </div>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '2px solid #111',
            background: page >= totalPages ? '#eee' : '#fff',
            fontWeight: 900,
            cursor: page >= totalPages ? 'not-allowed' : 'pointer',
          }}
        >
          Next
        </button>
      </div>

      {editing && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 60,
            padding: 16,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              background: '#fff',
              borderRadius: 16,
              border: '2px solid #111',
              padding: 16,
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ fontWeight: 950, fontSize: 18 }}>Edit Rider</div>
            <input
              placeholder="Nama Rider"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
            />
            <input
              type="date"
              value={editForm.date_of_birth}
              onChange={(e) => setEditForm({ ...editForm, date_of_birth: e.target.value })}
              style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
            />
            <select
              value={editForm.gender}
              onChange={(e) => setEditForm({ ...editForm, gender: e.target.value as 'BOY' | 'GIRL' })}
              style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
            >
              <option value="BOY">BOY</option>
              <option value="GIRL">GIRL</option>
            </select>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Plate Number & Suffix
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  inputMode="numeric"
                  placeholder="Plate Number"
                  value={editForm.plate_number}
                  onChange={(e) => setEditForm({ ...editForm, plate_number: e.target.value.replace(/[^\d]/g, '') })}
                  disabled={eventStatus === 'LIVE'}
                  style={{ padding: 12, borderRadius: 12, border: '2px solid #111', flex: 1 }}
                />
                <input
                  placeholder="Suffix (A-Z)"
                  value={editForm.plate_suffix}
                  onChange={(e) => setEditForm({ ...editForm, plate_suffix: e.target.value })}
                  disabled={eventStatus === 'LIVE'}
                  style={{ padding: 12, borderRadius: 12, border: '2px solid #111', width: 90 }}
                />
              </div>
            </div>
            <input
              placeholder="Club"
              value={editForm.club}
              onChange={(e) => setEditForm({ ...editForm, club: e.target.value })}
              style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
            />
            <input type="file" accept="image/*" onChange={(e) => setEditPhotoFile(e.target.files?.[0] ?? null)} />
            {editPhotoFile && (
              <div style={{ fontWeight: 800, fontSize: 12 }}>
                Upload Foto: {editPhotoStatus === 'uploading'
                  ? 'Uploading...'
                  : editPhotoStatus === 'success'
                  ? 'Success'
                  : editPhotoStatus === 'error'
                  ? 'Failed'
                  : 'Ready'}
              </div>
            )}
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Kategori Tambahan (tahun lebih tua)
              </div>
              {(() => {
                const birthYear = Number(String(editForm.date_of_birth).slice(0, 4))
                const eligible = categories.filter((c) => {
                  const max = c.year_max ?? c.year
                  if (max >= birthYear) return false
                  if (c.gender === 'MIX') return true
                  return c.gender === editForm.gender
                })
                if (eligible.length === 0) {
                  return (
                    <div style={{ fontWeight: 800, color: '#444' }}>
                      Tidak ada kategori lebih tua untuk rider ini.
                    </div>
                  )
                }
                return (
                  <select
                    value={extraCategoryId ?? ''}
                    onChange={(e) => setExtraCategoryId(e.target.value || null)}
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
                  >
                    <option value="">Tidak ikut kategori tambahan</option>
                    {eligible.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                )
              })()}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={closeEdit}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '2px solid #111',
                  background: '#fff',
                  fontWeight: 900,
                }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleUpdate}
                disabled={saving}
                style={{
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '2px solid #111',
                  background: '#2ecc71',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                {saving ? 'Saving...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

