'use client'

import { useEffect, useMemo, useState } from 'react'
import PublicTopbar from '../../../../components/PublicTopbar'

type CategoryItem = {
  id: string
  year: number
  year_min?: number
  year_max?: number
  gender: 'BOY' | 'GIRL' | 'MIX'
  label: string
}

type RiderForm = {
  name: string
  nickname: string
  jerseySize: string
  dateOfBirth: string
  gender: 'BOY' | 'GIRL'
  club: string
  extraCategoryId: string
  requestedPlateNumber: string
  requestedPlateSuffix: string
  photo?: File | null
  docKk?: File | null
}

const DEFAULT_BASE_PRICE = 250000
const DEFAULT_EXTRA_PRICE = 150000
const DEFAULT_FFA_MIN_YEAR = 2017
const DEFAULT_FFA_MAX_YEAR = 2017

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)

const initialRider = (): RiderForm => ({
  name: '',
  nickname: '',
  jerseySize: '',
  dateOfBirth: '',
  gender: 'BOY',
  club: '',
  extraCategoryId: '',
  requestedPlateNumber: '',
  requestedPlateSuffix: '',
  photo: null,
  docKk: null,
})

export default function RegisterClient({ eventId }: { eventId: string }) {
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [eventName, setEventName] = useState<string | null>(null)
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [communityName, setCommunityName] = useState('')
  const [riders, setRiders] = useState<RiderForm[]>([initialRider()])
  const [basePrice, setBasePrice] = useState(DEFAULT_BASE_PRICE)
  const [extraPrice, setExtraPrice] = useState(DEFAULT_EXTRA_PRICE)
  const [ffaMinYear, setFfaMinYear] = useState(DEFAULT_FFA_MIN_YEAR)
  const [ffaMaxYear, setFfaMaxYear] = useState(DEFAULT_FFA_MAX_YEAR)
  const [bankName, setBankName] = useState('')
  const [accountName, setAccountName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [paymentProof, setPaymentProof] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState(1)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/events/${eventId}`)
        const json = await res.json()
        setEventName(json?.data?.name ?? null)
      } catch {
        setEventName(null)
      }
    }
    const loadCategories = async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/categories`)
        const json = await res.json()
        setCategories(json?.data ?? [])
      } catch {
        setCategories([])
      }
    }
    const loadSettings = async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/settings`)
        const json = await res.json()
        const data = json?.data ?? null
        const base = Number(data?.base_price)
        const extra = Number(data?.extra_price)
        const ffaMin = Number(data?.ffa_mix_min_year)
        const ffaMax = Number(data?.ffa_mix_max_year)
        setBasePrice(Number.isFinite(base) && base > 0 ? base : DEFAULT_BASE_PRICE)
        setExtraPrice(Number.isFinite(extra) && extra >= 0 ? extra : DEFAULT_EXTRA_PRICE)
        setFfaMinYear(Number.isFinite(ffaMin) ? ffaMin : DEFAULT_FFA_MIN_YEAR)
        setFfaMaxYear(Number.isFinite(ffaMax) ? ffaMax : DEFAULT_FFA_MAX_YEAR)
      } catch {
        setBasePrice(DEFAULT_BASE_PRICE)
        setExtraPrice(DEFAULT_EXTRA_PRICE)
        setFfaMinYear(DEFAULT_FFA_MIN_YEAR)
        setFfaMaxYear(DEFAULT_FFA_MAX_YEAR)
      }
    }
    load()
    loadCategories()
    loadSettings()
  }, [eventId])

  const addRider = () => {
    setRiders((prev) => [...prev, initialRider()])
    setActiveStep(2)
  }

  const removeRider = (index: number) =>
    setRiders((prev) => prev.filter((_, idx) => idx !== index).map((item) => ({ ...item })))

  const updateRider = (index: number, updates: Partial<RiderForm>) =>
    setRiders((prev) => prev.map((item, idx) => (idx === index ? { ...item, ...updates } : item)))

  const inRange = (c: CategoryItem, birthYear: number) => {
    const min = c.year_min ?? c.year
    const max = c.year_max ?? c.year
    return birthYear >= min && birthYear <= max
  }

  const computePrimaryCategory = (birthYear: number | null, gender: 'BOY' | 'GIRL') => {
    if (!birthYear) return null
    const candidates = categories.filter((c) => inRange(c, birthYear))
    const genderMatch = candidates.filter((c) => c.gender === gender)
    if (genderMatch.length > 0) {
      return genderMatch.sort((a, b) => (a.year_max ?? a.year) - (b.year_max ?? b.year))[0] ?? null
    }
    const mix = candidates.filter((c) => c.gender === 'MIX')
    return mix.sort((a, b) => (a.year_max ?? a.year) - (b.year_max ?? b.year))[0] ?? null
  }

  const extraCategoryOptions = (birthYear: number | null, gender: 'BOY' | 'GIRL') => {
    const options: CategoryItem[] = []
    if (!birthYear) return options
    return categories.filter((c) => {
      const max = c.year_max ?? c.year
      if (max >= birthYear) return false
      if (c.gender === 'MIX') return true
      return c.gender === gender
    })
  }

  const totalAmount = useMemo(() => {
    return riders.reduce((sum, rider) => sum + basePrice + (rider.extraCategoryId ? extraPrice : 0), 0)
  }, [riders, basePrice, extraPrice])

  const hasContact = contactName.trim() && contactPhone.trim()
  const hasRiderData = riders.some(
    (r) => r.name || r.nickname || r.dateOfBirth || r.requestedPlateNumber || r.photo || r.docKk
  )
  const ridersComplete = riders.every(
    (r) =>
      r.name &&
      r.nickname &&
      r.dateOfBirth &&
      r.requestedPlateNumber &&
      r.photo &&
      r.docKk
  )
  const showTotal = Boolean(hasContact && ridersComplete)
  const hasPayment = paymentProof !== null
  useEffect(() => {
    if (hasPayment) {
      setActiveStep(3)
    } else if (hasRiderData) {
      setActiveStep(2)
    } else if (hasContact) {
      setActiveStep(1)
    }
  }, [hasContact, hasRiderData, hasPayment])

  const handleSubmit = async () => {
    setSuccess(null)
    if (!contactName || !contactPhone) {
      alert('Nama dan nomor kontak wajib diisi')
      return
    }
    if (!paymentProof) {
      alert('Bukti pembayaran wajib diupload')
      return
    }
    const hasInvalid = riders.some(
      (r) =>
        !r.name ||
        !r.nickname ||
        !r.dateOfBirth ||
        !r.requestedPlateNumber ||
        !r.photo ||
        !r.docKk
    )
    if (hasInvalid) {
      alert('Lengkapi data rider. Wajib: nama, panggilan, nomor plate, foto rider, dan KK/Akte.')
      return
    }

    setSubmitting(true)
    try {
      const parseJson = async (res: Response) => {
        const text = await res.text()
        try {
          return JSON.parse(text)
        } catch {
          return { _raw: text }
        }
      }

      const items = riders.map((r) => {
        const birthYear = r.dateOfBirth ? new Date(r.dateOfBirth).getUTCFullYear() : null
        const primary = computePrimaryCategory(birthYear, r.gender)
        return {
          rider_name: r.name,
          rider_nickname: r.nickname || null,
          jersey_size: r.jerseySize || null,
          date_of_birth: r.dateOfBirth,
          gender: r.gender,
          club: r.club || null,
          primary_category_id: primary?.id ?? null,
          extra_category_id: r.extraCategoryId || null,
          requested_plate_number: r.requestedPlateNumber ? Number(r.requestedPlateNumber) : null,
          requested_plate_suffix: r.requestedPlateSuffix || null,
        }
      })

      const regRes = await fetch(`/api/public/events/${eventId}/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          community_name: communityName || null,
          contact_name: contactName,
          contact_phone: contactPhone,
          contact_email: contactEmail || null,
          items,
        }),
      })
      const regJson = await parseJson(regRes)
      if (!regRes.ok) throw new Error(regJson?.error || regJson?._raw || 'Gagal membuat pendaftaran')

      const registrationId = regJson.data.registration.id as string
      const itemRows = regJson.data.items as Array<{ id: string }>

      for (let idx = 0; idx < riders.length; idx++) {
        const rider = riders[idx]
        const itemId = itemRows[idx]?.id
        if (rider.photo && itemId) {
          const form = new FormData()
          form.append('file', rider.photo)
          form.append('registration_item_id', itemId)
          const res = await fetch(`/api/public/events/${eventId}/registrations/${registrationId}/photo`, {
            method: 'POST',
            body: form,
          })
          if (!res.ok) {
            const json = await parseJson(res)
            throw new Error(json?.error || json?._raw || 'Upload foto gagal')
          }
        }
        if (rider.docKk && itemId) {
          const form = new FormData()
          form.append('file', rider.docKk)
          form.append('document_type', 'KK')
          form.append('registration_item_id', itemId)
          const res = await fetch(`/api/public/events/${eventId}/registrations/${registrationId}/documents`, {
            method: 'POST',
            body: form,
          })
          if (!res.ok) {
            const json = await parseJson(res)
            throw new Error(json?.error || json?._raw || 'Upload dokumen gagal')
          }
        }
      }

      const paymentForm = new FormData()
      paymentForm.append('file', paymentProof)
      paymentForm.append('bank_name', bankName)
      paymentForm.append('account_name', accountName)
      paymentForm.append('account_number', accountNumber)
      const payRes = await fetch(`/api/public/events/${eventId}/registrations/${registrationId}/payment`, {
        method: 'POST',
        body: paymentForm,
      })
      const payJson = await parseJson(payRes)
      if (!payRes.ok) throw new Error(payJson?.error || payJson?._raw || 'Upload pembayaran gagal')

      setSuccess('Pendaftaran berhasil. Admin akan memverifikasi data & pembayaran.')
      setRiders([initialRider()])
      setContactName('')
      setContactPhone('')
      setContactEmail('')
      setCommunityName('')
      setBankName('')
      setAccountName('')
      setAccountNumber('')
      setPaymentProof(null)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Gagal menyimpan pendaftaran')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f7f2d7' }}>
      <PublicTopbar showRegister={false} />
      <div style={{ padding: '20px 16px 120px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', display: 'grid', gap: 16 }}>
        <div style={{ padding: 16, borderRadius: 18, border: '2px solid #111', background: '#fff' }}>
          <div style={{ fontWeight: 900, fontSize: 22 }}>Pendaftaran Event</div>
          <div style={{ fontWeight: 700, marginTop: 4 }}>{eventName ?? 'KRB Race Event'}</div>
        </div>

        <div
          style={{
            padding: 12,
            borderRadius: 16,
            border: '2px solid #111',
            background: '#fff',
            display: 'grid',
            gap: 8,
          }}
        >
          <div style={{ fontWeight: 900 }}>Progress</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            {[
              { id: 1, label: 'Kontak' },
              { id: 2, label: 'Data Rider' },
              { id: 3, label: 'Pembayaran' },
            ].map((step) => {
              const active = activeStep >= step.id
              return (
                <div
                  key={step.id}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 999,
                    border: '2px solid #111',
                    background: active ? '#dff6e6' : '#f1f1f1',
                    fontWeight: 800,
                    textAlign: 'center',
                  }}
                >
                  {step.id}. {step.label}
                </div>
              )
            })}
          </div>
        </div>

        <div style={{ padding: 16, borderRadius: 18, border: '2px solid #111', background: '#fff' }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Kontak & Komunitas</div>
          <div style={{ display: 'grid', gap: 10 }}>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Nama Penanggung Jawab"
              style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
            />
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="Nomor WhatsApp"
              style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
            />
            <input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="Email (opsional)"
              style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
            />
            <input
              value={communityName}
              onChange={(e) => setCommunityName(e.target.value)}
              placeholder="Nama Komunitas (opsional)"
              style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
            />
          </div>
        </div>

        {riders.map((rider, idx) => {
          const birthYear = rider.dateOfBirth ? new Date(rider.dateOfBirth).getUTCFullYear() : null
          const primaryCategory = computePrimaryCategory(birthYear, rider.gender)
          const extras = extraCategoryOptions(birthYear, rider.gender)
          return (
            <div
              key={`rider-${idx}`}
              style={{ padding: 16, borderRadius: 18, border: '2px solid #111', background: '#fff' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 900 }}>Rider #{idx + 1}</div>
                {riders.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRider(idx)}
                    style={{ border: '2px solid #111', background: '#ffe1e1', padding: '6px 10px', borderRadius: 10 }}
                  >
                    Hapus
                  </button>
                )}
              </div>

        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          <input
            value={rider.name}
            onChange={(e) => updateRider(idx, { name: e.target.value })}
            placeholder="Nama Rider"
            style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
          />
          <input
            value={rider.nickname}
            onChange={(e) => updateRider(idx, { nickname: e.target.value })}
                  placeholder="Nama Panggilan"
            style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
          />
          <select
            value={rider.jerseySize}
            onChange={(e) => updateRider(idx, { jerseySize: e.target.value })}
            style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
          >
            <option value="">Ukuran Jersey (opsional)</option>
            <option value="XS">XS</option>
            <option value="S">S</option>
            <option value="M">M</option>
            <option value="L">L</option>
            <option value="XL">XL</option>
          </select>
                <input
                  type="date"
                  value={rider.dateOfBirth}
                  onChange={(e) => updateRider(idx, { dateOfBirth: e.target.value })}
                  style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
                />
                <select
                  value={rider.gender}
                  onChange={(e) => updateRider(idx, { gender: e.target.value as 'BOY' | 'GIRL' })}
                  style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
                >
                  <option value="BOY">BOY</option>
                  <option value="GIRL">GIRL</option>
                </select>
                <input
                  value={rider.club}
                  onChange={(e) => updateRider(idx, { club: e.target.value })}
                  placeholder="Club / Komunitas"
                  style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
                />

                <div style={{ fontWeight: 800, fontSize: 13 }}>
                  Kategori Otomatis:{' '}
                  {primaryCategory ? primaryCategory.label : 'Belum ditemukan'}
                </div>
                <div style={{ fontSize: 12, color: '#333', fontWeight: 700 }}>
                  Pilih tanggal lahir & gender agar kategori terdeteksi otomatis.
                </div>

                {extras.length > 0 && (
                  <select
                    value={rider.extraCategoryId}
                    onChange={(e) => updateRider(idx, { extraCategoryId: e.target.value })}
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
                  >
                    <option value="">Tambah Kategori (opsional)</option>
                    {extras.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10 }}>
                  <input
                    value={rider.requestedPlateNumber}
                    onChange={(e) => updateRider(idx, { requestedPlateNumber: e.target.value })}
                    placeholder="Nomor Plate (opsional)"
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
                  />
                  <input
                    value={rider.requestedPlateSuffix}
                    onChange={(e) => updateRider(idx, { requestedPlateSuffix: e.target.value.toUpperCase() })}
                    placeholder="Suffix"
                    style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
                  />
                </div>

                <div style={{ display: 'grid', gap: 8 }}>
                  <label style={{ fontWeight: 700 }}>Upload Foto Rider (wajib)</label>
                  <label
                    style={{
                      border: '2px solid #111',
                      borderRadius: 12,
                      padding: 10,
                      background: '#eaf7ee',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      cursor: 'pointer',
                      fontWeight: 800,
                    }}
                  >
                    <span>{rider.photo ? rider.photo.name : 'Pilih file foto'}</span>
                    <span
                      style={{
                        border: '2px solid #111',
                        borderRadius: 10,
                        padding: '4px 8px',
                        background: '#fff',
                        fontSize: 12,
                      }}
                    >
                      Browse
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => updateRider(idx, { photo: e.target.files?.[0] ?? null })}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <label style={{ fontWeight: 700 }}>Upload KK / Akte Kelahiran (wajib)</label>
                  <label
                    style={{
                      border: '2px solid #111',
                      borderRadius: 12,
                      padding: 10,
                      background: '#eaf7ee',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      cursor: 'pointer',
                      fontWeight: 800,
                    }}
                  >
                    <span>{rider.docKk ? rider.docKk.name : 'Pilih dokumen KK/Akte'}</span>
                    <span
                      style={{
                        border: '2px solid #111',
                        borderRadius: 10,
                        padding: '4px 8px',
                        background: '#fff',
                        fontSize: 12,
                      }}
                    >
                      Browse
                    </span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => updateRider(idx, { docKk: e.target.files?.[0] ?? null })}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>
            </div>
          )
        })}

        <button
          type="button"
          onClick={addRider}
          style={{
            padding: 14,
            borderRadius: 14,
            border: '2px solid #111',
            background: '#b9f3c9',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          + Tambah Rider
        </button>

        <div style={{ padding: 16, borderRadius: 18, border: '2px solid #111', background: '#fff' }}>
          <div style={{ fontWeight: 900 }}>Pembayaran Manual</div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 6 }}>
            Silakan transfer total biaya dan upload bukti pembayaran.
          </div>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Nama Bank"
              style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
            />
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Nama Pemilik Rekening"
              style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
            />
            <input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Nomor Rekening"
              style={{ padding: 12, borderRadius: 12, border: '2px solid #111' }}
            />
            {showTotal ? (
              <div style={{ fontWeight: 800 }}>Total: {formatRupiah(totalAmount)}</div>
            ) : (
              <div style={{ fontWeight: 800, color: '#777' }}>
                Total akan muncul setelah kontak & data rider lengkap.
              </div>
            )}
            <label
              style={{
                border: '2px solid #111',
                borderRadius: 12,
                padding: 10,
                background: '#eaf7ee',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
                fontWeight: 800,
              }}
            >
              <span>{paymentProof ? paymentProof.name : 'Upload bukti pembayaran'}</span>
              <span
                style={{
                  border: '2px solid #111',
                  borderRadius: 10,
                  padding: '4px 8px',
                  background: '#fff',
                  fontSize: 12,
                }}
              >
                Browse
              </span>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setPaymentProof(e.target.files?.[0] ?? null)}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>

        {success && (
          <div style={{ padding: 14, borderRadius: 12, border: '2px solid #111', background: '#d7ffd9' }}>
            {success}
          </div>
        )}
      </div>

      <div
        style={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(860px, calc(100% - 32px))',
          background: '#fff',
          border: '2px solid #111',
          borderRadius: 16,
          padding: '10px 14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
        }}
      >
        <div style={{ fontWeight: 900 }}>
          {showTotal ? `Total: ${formatRupiah(totalAmount)}` : 'Lengkapi kontak & data rider'}
        </div>
        <button
          type="button"
          disabled={submitting}
          onClick={handleSubmit}
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            border: '2px solid #111',
            background: submitting ? '#bbb' : '#34c759',
            color: '#111',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          {submitting ? 'Menyimpan...' : 'Kirim Pendaftaran'}
        </button>
      </div>
      </div>
    </div>
  )
}

