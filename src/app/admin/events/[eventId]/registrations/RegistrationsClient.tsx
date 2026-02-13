'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'

type CategoryItem = {
  id: string
  label: string
  year: number
  gender: 'BOY' | 'GIRL' | 'MIX'
}

type RegistrationItem = {
  id: string
  rider_name: string
  date_of_birth: string
  gender: 'BOY' | 'GIRL'
  club: string | null
  primary_category_id: string | null
  extra_category_id: string | null
  requested_plate_number: number | null
  requested_plate_suffix: string | null
  photo_url?: string | null
  price: number
  status: string
}

type RegistrationRow = {
  id: string
  community_name: string | null
  contact_name: string
  contact_phone: string
  contact_email: string | null
  status: string
  total_amount: number
  notes: string | null
  created_at: string
  registration_items: RegistrationItem[]
  registration_payments: Array<{
    id: string
    proof_url: string
    amount: number
    bank_name: string | null
    account_name: string | null
    account_number: string | null
    status: string
  }>
  registration_documents: Array<{
    id: string
    registration_item_id: string | null
    document_type: string
    file_url: string
  }>
}

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)

export default function RegistrationsClient({ eventId }: { eventId: string }) {
  const [loading, setLoading] = useState(false)
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([])
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)
  const [plateInputs, setPlateInputs] = useState<Record<string, { number: string; suffix: string }>>({})

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c.label])), [categories])

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

  const resolveFileUrl = async (pathOrUrl: string) => {
    if (!pathOrUrl) return null
    if (pathOrUrl.startsWith('http')) return pathOrUrl
    const res = await apiFetch('/api/admin/storage/signed-url', {
      method: 'POST',
      body: JSON.stringify({ path: pathOrUrl }),
    })
    return res?.data?.signedUrl ?? null
  }

  const openFile = async (pathOrUrl: string) => {
    try {
      const url = await resolveFileUrl(pathOrUrl)
      if (!url) return alert('File tidak ditemukan')
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal membuka file')
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const [catRes, regRes] = await Promise.all([
        fetch(`/api/events/${eventId}/categories`).then((r) => r.json()),
        apiFetch(`/api/admin/events/${eventId}/registrations`),
      ])
      setCategories(catRes?.data ?? [])
      setRegistrations(regRes?.data ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!eventId) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  const handlePlateChange = (itemId: string, field: 'number' | 'suffix', value: string) => {
    setPlateInputs((prev) => ({
      ...prev,
      [itemId]: {
        number: field === 'number' ? value : prev[itemId]?.number ?? '',
        suffix: field === 'suffix' ? value.toUpperCase() : prev[itemId]?.suffix ?? '',
      },
    }))
  }

  const approve = async (registration: RegistrationRow) => {
    setSavingId(registration.id)
    try {
      const items = registration.registration_items.map((item) => ({
        id: item.id,
        plate_number: plateInputs[item.id]?.number
          ? Number(plateInputs[item.id]?.number)
          : item.requested_plate_number,
        plate_suffix: plateInputs[item.id]?.suffix || item.requested_plate_suffix || null,
      }))
      await apiFetch(`/api/admin/events/${eventId}/registrations/${registration.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'APPROVED', items }),
      })
      await load()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal approve')
    } finally {
      setSavingId(null)
    }
  }

  const reject = async (registration: RegistrationRow) => {
    const notes = window.prompt('Alasan penolakan?') || ''
    if (!notes) return
    setSavingId(registration.id)
    try {
      await apiFetch(`/api/admin/events/${eventId}/registrations/${registration.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'REJECTED', notes }),
      })
      await load()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal reject')
    } finally {
      setSavingId(null)
    }
  }

  const remove = async (registration: RegistrationRow) => {
    const confirm = window.confirm('Hapus pendaftaran ini? Data akan dihapus permanen.')
    if (!confirm) return
    setSavingId(registration.id)
    try {
      await apiFetch(`/api/admin/events/${eventId}/registrations/${registration.id}`, {
        method: 'DELETE',
      })
      await load()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal hapus pendaftaran')
    } finally {
      setSavingId(null)
    }
  }

  if (loading && registrations.length === 0) {
    return <div style={{ padding: 20 }}>Loading...</div>
  }

  return (
    <div style={{ padding: 20, display: 'grid', gap: 16 }}>
      <div style={{ fontWeight: 900, fontSize: 22 }}>Registrations</div>
      {registrations.length === 0 && <div>Belum ada pendaftaran.</div>}
      {registrations.map((reg) => {
        const hasPayment = (reg.registration_payments ?? []).length > 0
        const docsByItem = new Map<string, number>()
        for (const doc of reg.registration_documents ?? []) {
          if (!doc.registration_item_id) continue
          docsByItem.set(doc.registration_item_id, (docsByItem.get(doc.registration_item_id) ?? 0) + 1)
        }
        const allItemsHaveDocs =
          (reg.registration_items ?? []).length > 0 &&
          reg.registration_items.every((item) => (docsByItem.get(item.id) ?? 0) > 0)
        const canApprove = hasPayment && allItemsHaveDocs

        return (
        <div key={reg.id} style={{ border: '2px solid #111', borderRadius: 16, padding: 16, background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 900 }}>{reg.contact_name}</div>
              <div style={{ fontSize: 13 }}>{reg.contact_phone}</div>
              <div style={{ fontSize: 13 }}>{reg.contact_email}</div>
              {reg.community_name && <div style={{ fontSize: 13 }}>Komunitas: {reg.community_name}</div>}
            </div>
            <div style={{ fontWeight: 900 }}>{formatRupiah(reg.total_amount)}</div>
            <div style={{ fontWeight: 800 }}>Status: {reg.status}</div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 800 }}>Bukti Pembayaran</div>
            {reg.registration_payments.map((pay) => (
              <div key={pay.id} style={{ fontSize: 13 }}>
                {pay.bank_name} {pay.account_number} ({pay.account_name}) - {formatRupiah(pay.amount)}{' '}
                <button
                  type="button"
                  onClick={() => openFile(pay.proof_url)}
                  style={{ marginLeft: 6, border: '1px solid #111', borderRadius: 6, padding: '2px 8px' }}
                >
                  Lihat Bukti
                </button>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            {reg.registration_items.map((item) => {
              const docs = reg.registration_documents.filter((doc) => doc.registration_item_id === item.id)
              return (
                <div key={item.id} style={{ border: '1px solid #ddd', borderRadius: 12, padding: 12 }}>
                  <div style={{ fontWeight: 800 }}>{item.rider_name}</div>
                  <div style={{ fontSize: 12 }}>
                    {item.gender} · {item.date_of_birth} · {item.club ?? '-'}
                  </div>
                  {item.photo_url && (
                    <button
                      type="button"
                      onClick={() => openFile(item.photo_url ?? '')}
                      style={{ marginTop: 6, border: '1px solid #111', borderRadius: 8, padding: '4px 10px' }}
                    >
                      Lihat Foto
                    </button>
                  )}
                  <div style={{ fontSize: 12 }}>
                    Kategori: {item.primary_category_id ? categoryMap.get(item.primary_category_id) : '-'}
                  </div>
                  {item.extra_category_id && (
                    <div style={{ fontSize: 12 }}>
                      Tambahan: {categoryMap.get(item.extra_category_id) ?? '-'}
                    </div>
                  )}
                  <div style={{ fontSize: 12 }}>Biaya: {formatRupiah(item.price)}</div>
                  <div style={{ fontSize: 12 }}>
                    Dokumen:{' '}
                    {docs.length === 0
                      ? 'Belum ada'
                      : docs.map((doc) => (
                          <button
                            key={doc.id}
                            type="button"
                            onClick={() => openFile(doc.file_url)}
                            style={{ marginRight: 8, border: '1px solid #111', borderRadius: 6, padding: '2px 8px' }}
                          >
                            {doc.document_type}
                          </button>
                        ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8, marginTop: 8 }}>
                    <input
                      placeholder="Plate Number"
                      value={plateInputs[item.id]?.number ?? item.requested_plate_number ?? ''}
                      onChange={(e) => handlePlateChange(item.id, 'number', e.target.value)}
                      style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }}
                    />
                    <input
                      placeholder="Suffix"
                      value={plateInputs[item.id]?.suffix ?? item.requested_plate_suffix ?? ''}
                      onChange={(e) => handlePlateChange(item.id, 'suffix', e.target.value)}
                      style={{ padding: 8, borderRadius: 8, border: '1px solid #111' }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              type="button"
              disabled={savingId === reg.id || !canApprove}
              onClick={() => approve(reg)}
              style={{ padding: '10px 14px', borderRadius: 10, border: '2px solid #111', background: '#b7f7c8' }}
            >
              Approve & Create Riders
            </button>
            {!canApprove && (
              <div style={{ fontSize: 12, fontWeight: 800, alignSelf: 'center' }}>
                Lengkapi pembayaran & dokumen
              </div>
            )}
            <button
              type="button"
              disabled={savingId === reg.id}
              onClick={() => reject(reg)}
              style={{ padding: '10px 14px', borderRadius: 10, border: '2px solid #111', background: '#ffd6d6' }}
            >
              Reject
            </button>
            <button
              type="button"
              disabled={savingId === reg.id || reg.status !== 'REJECTED'}
              onClick={() => remove(reg)}
              style={{ padding: '10px 14px', borderRadius: 10, border: '2px solid #111', background: '#eee' }}
            >
              Delete
            </button>
          </div>
        </div>
        )
      })}
    </div>
  )
}
