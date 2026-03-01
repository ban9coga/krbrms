'use client'

import { useEffect, useMemo, useState } from 'react'
import MarketingTopbar from '../../../../components/MarketingTopbar'

type CategoryItem = {
  id: string
  year: number
  year_min?: number
  year_max?: number
  gender: 'BOY' | 'GIRL' | 'MIX'
  label: string
  enabled?: boolean
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
  const [requireJerseySize, setRequireJerseySize] = useState(false)
  const [bankName, setBankName] = useState('')
  const [accountName, setAccountName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [paymentProof, setPaymentProof] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

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
        const list = (json?.data ?? []) as CategoryItem[]
        setCategories(list.filter((item) => item.enabled !== false))
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
        setRequireJerseySize(Boolean(data?.require_jersey_size))
        setBasePrice(Number.isFinite(base) && base > 0 ? base : DEFAULT_BASE_PRICE)
        setExtraPrice(Number.isFinite(extra) && extra >= 0 ? extra : DEFAULT_EXTRA_PRICE)
      } catch {
        setBasePrice(DEFAULT_BASE_PRICE)
        setExtraPrice(DEFAULT_EXTRA_PRICE)
        setRequireJerseySize(false)
      }
    }
    load()
    loadCategories()
    loadSettings()
  }, [eventId])

  const addRider = () => {
    setRiders((prev) => [...prev, initialRider()])
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

  const extraCategoryOptions = (
    birthYear: number | null,
    gender: 'BOY' | 'GIRL',
    primaryCategory: CategoryItem | null
  ) => {
    const options: CategoryItem[] = []
    if (!birthYear || !primaryCategory) return options
    return categories.filter((c) => {
      if (c.id === primaryCategory.id) return false
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
  const ridersComplete = riders.every(
    (r) =>
      r.name &&
      r.nickname &&
      (!requireJerseySize || r.jerseySize) &&
      r.dateOfBirth &&
      r.requestedPlateNumber &&
      r.photo &&
      r.docKk
  )
  const showTotal = Boolean(hasContact && ridersComplete)
  const hasMissingPrimaryCategory = riders.some((rider) => {
    const birthYear = rider.dateOfBirth ? new Date(rider.dateOfBirth).getUTCFullYear() : null
    return !computePrimaryCategory(birthYear, rider.gender)
  })

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
        (requireJerseySize && !r.jerseySize) ||
        !r.dateOfBirth ||
        !r.requestedPlateNumber ||
        !r.photo ||
        !r.docKk
    )
    if (hasInvalid) {
      alert('Lengkapi data rider. Wajib: nama, panggilan, nomor plate, foto rider, KK/Akte, dan ukuran jersey (jika diwajibkan).')
      return
    }
    if (hasMissingPrimaryCategory) {
      alert('Kategori otomatis belum ditemukan untuk beberapa rider. Cek tanggal lahir/gender atau aktifkan kategori event yang sesuai.')
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
        return {
          rider_name: r.name,
          rider_nickname: r.nickname || null,
          jersey_size: r.jerseySize || null,
          date_of_birth: r.dateOfBirth,
          gender: r.gender,
          club: r.club || null,
          extra_category_id: r.extraCategoryId || null,
          requested_plate_number: r.requestedPlateNumber ? Number(r.requestedPlateNumber) : null,
          requested_plate_suffix: r.requestedPlateSuffix || null,
        }
      })

      const submitForm = new FormData()
      submitForm.append(
        'payload',
        JSON.stringify({
          community_name: communityName || null,
          contact_name: contactName,
          contact_phone: contactPhone,
          contact_email: contactEmail || null,
          items,
        })
      )

      riders.forEach((rider, idx) => {
        if (rider.photo instanceof File) {
          submitForm.append(`rider_photo_${idx}`, rider.photo)
        }
        if (rider.docKk instanceof File) {
          submitForm.append(`rider_doc_${idx}`, rider.docKk)
        }
      })

      if (paymentProof instanceof File) {
        submitForm.append('payment_proof', paymentProof)
      }
      submitForm.append('bank_name', bankName)
      submitForm.append('account_name', accountName)
      submitForm.append('account_number', accountNumber)

      const submitRes = await fetch(`/api/public/events/${eventId}/registrations`, {
        method: 'POST',
        body: submitForm,
      })
      const submitJson = await parseJson(submitRes)
      if (!submitRes.ok) throw new Error(submitJson?.error || submitJson?._raw || 'Gagal membuat pendaftaran')

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

  const panelClass =
    'rounded-[1.5rem] border border-slate-700 bg-slate-900/70 p-4 shadow-[0_20px_45px_rgba(2,6,23,0.3)] sm:p-5'
  const fieldClass =
    'w-full rounded-xl border border-slate-600 bg-slate-950/70 px-3 py-3 text-sm font-medium text-slate-100 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/30'
  const filePickerClass =
    'flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-600 bg-slate-950/70 px-3 py-2.5 transition-colors hover:border-rose-400/70'

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#020817_0%,#041030_45%,#030712_100%)] text-slate-100">
      <MarketingTopbar />
      <main className="mx-auto grid w-full max-w-[1200px] gap-4 px-4 pb-32 pt-6 sm:px-6 md:gap-5 md:pt-8">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-slate-700 bg-[linear-gradient(130deg,#0b1328_0%,#1e293b_52%,#4a1127_100%)] px-5 py-6 shadow-[0_26px_60px_rgba(2,6,23,0.35)] sm:px-7">
          <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full border border-white/20" />
          <div className="pointer-events-none absolute -left-16 bottom-0 h-44 w-44 rounded-full bg-rose-500/15 blur-3xl" />
          <div className="relative z-10 grid gap-2">
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-rose-300">Event Registration</p>
            <h1 className="text-2xl font-black tracking-tight text-white md:text-4xl">Pendaftaran Event</h1>
            <p className="text-base font-semibold text-slate-200 md:text-lg">{eventName ?? 'KRB Race Event'}</p>
          </div>
        </section>

        <section className={panelClass}>
          <div className="mb-3 text-sm font-extrabold uppercase tracking-[0.12em] text-slate-300">Kontak & Komunitas</div>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Nama Penanggung Jawab"
              className={fieldClass}
            />
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="Nomor WhatsApp"
              className={fieldClass}
            />
            <input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="Email (opsional)"
              className={fieldClass}
            />
            <input
              value={communityName}
              onChange={(e) => setCommunityName(e.target.value)}
              placeholder="Nama Komunitas (opsional)"
              className={fieldClass}
            />
          </div>
        </section>

        {riders.map((rider, idx) => {
          const birthYear = rider.dateOfBirth ? new Date(rider.dateOfBirth).getUTCFullYear() : null
          const primaryCategory = computePrimaryCategory(birthYear, rider.gender)
          const extras = extraCategoryOptions(birthYear, rider.gender, primaryCategory)
          return (
            <section key={`rider-${idx}`} className={panelClass}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-base font-black text-white sm:text-lg">Rider #{idx + 1}</div>
                {riders.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRider(idx)}
                    className="rounded-lg border border-rose-300/50 bg-rose-500/10 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide text-rose-200 transition-colors hover:bg-rose-500/20"
                  >
                    Hapus
                  </button>
                )}
              </div>

              <div className="grid gap-3">
                <input
                  value={rider.name}
                  onChange={(e) => updateRider(idx, { name: e.target.value })}
                  placeholder="Nama Rider"
                  className={fieldClass}
                />
                <input
                  value={rider.nickname}
                  onChange={(e) => updateRider(idx, { nickname: e.target.value })}
                  placeholder="Nama Panggilan"
                  className={fieldClass}
                />
                <select
                  value={rider.jerseySize}
                  onChange={(e) => updateRider(idx, { jerseySize: e.target.value })}
                  className={fieldClass}
                >
                  <option value="">
                    Ukuran Jersey {requireJerseySize ? '(wajib)' : '(opsional)'}
                  </option>
                  <option value="XS">XS</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                </select>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="date"
                    value={rider.dateOfBirth}
                    onChange={(e) => updateRider(idx, { dateOfBirth: e.target.value })}
                    className={fieldClass}
                  />
                  <select
                    value={rider.gender}
                    onChange={(e) => updateRider(idx, { gender: e.target.value as 'BOY' | 'GIRL' })}
                    className={fieldClass}
                  >
                    <option value="BOY">BOY</option>
                    <option value="GIRL">GIRL</option>
                  </select>
                </div>
                <input
                  value={rider.club}
                  onChange={(e) => updateRider(idx, { club: e.target.value })}
                  placeholder="Club / Komunitas"
                  className={fieldClass}
                />

                <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                  <div className="text-sm font-bold text-slate-200">
                    Kategori Otomatis: <span className="text-rose-300">{primaryCategory ? primaryCategory.label : 'Belum ditemukan'}</span>
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-400">
                    Pilih tanggal lahir & gender agar kategori terdeteksi otomatis.
                  </div>
                  {!primaryCategory && (
                    <div className="mt-2 text-xs font-semibold text-amber-300">
                      Tanggal lahir tidak masuk range kategori aktif event ini.
                    </div>
                  )}
                </div>

                {extras.length > 0 && (
                  <select
                    value={rider.extraCategoryId}
                    onChange={(e) => updateRider(idx, { extraCategoryId: e.target.value })}
                    className={fieldClass}
                  >
                    <option value="">Tambah Kategori (opsional)</option>
                    {extras.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                )}

                <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                  <input
                    value={rider.requestedPlateNumber}
                    onChange={(e) => updateRider(idx, { requestedPlateNumber: e.target.value })}
                    placeholder="Nomor Plate (wajib)"
                    className={fieldClass}
                  />
                  <input
                    value={rider.requestedPlateSuffix}
                    onChange={(e) => updateRider(idx, { requestedPlateSuffix: e.target.value.toUpperCase() })}
                    placeholder="Suffix"
                    className={fieldClass}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="grid gap-2">
                    <label className="text-sm font-bold text-slate-200">Upload Foto Rider (wajib)</label>
                    <label className={filePickerClass}>
                      <span className="truncate text-sm font-semibold text-slate-200">
                        {rider.photo ? rider.photo.name : 'Pilih file foto'}
                      </span>
                      <span className="rounded-lg border border-slate-500 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-200">
                        Browse
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => updateRider(idx, { photo: e.target.files?.[0] ?? null })}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-bold text-slate-200">Upload KK / Akte Kelahiran (wajib)</label>
                    <label className={filePickerClass}>
                      <span className="truncate text-sm font-semibold text-slate-200">
                        {rider.docKk ? rider.docKk.name : 'Pilih dokumen KK/Akte'}
                      </span>
                      <span className="rounded-lg border border-slate-500 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-200">
                        Browse
                      </span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(e) => updateRider(idx, { docKk: e.target.files?.[0] ?? null })}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </section>
          )
        })}

        <button
          type="button"
          onClick={addRider}
          className="rounded-xl border border-emerald-300/40 bg-emerald-500/15 px-4 py-3 text-sm font-extrabold uppercase tracking-wide text-emerald-100 transition-colors hover:bg-emerald-500/25"
        >
          + Tambah Rider
        </button>

        <section className={panelClass}>
          <div className="text-sm font-extrabold uppercase tracking-[0.12em] text-slate-300">Pembayaran Manual</div>
          <p className="mt-2 text-sm font-medium text-slate-400">
            Silakan transfer total biaya dan upload bukti pembayaran.
          </p>
          <div className="mt-4 grid gap-3">
            <input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Nama Bank"
              className={fieldClass}
            />
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Nama Pemilik Rekening"
              className={fieldClass}
            />
            <input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="Nomor Rekening"
              className={fieldClass}
            />
            {showTotal ? (
              <div className="text-sm font-bold text-emerald-300">Total: {formatRupiah(totalAmount)}</div>
            ) : (
              <div className="text-sm font-bold text-slate-400">
                Total akan muncul setelah kontak & data rider lengkap.
              </div>
            )}
            <label className={filePickerClass}>
              <span className="truncate text-sm font-semibold text-slate-200">
                {paymentProof ? paymentProof.name : 'Upload bukti pembayaran'}
              </span>
              <span className="rounded-lg border border-slate-500 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-200">
                Browse
              </span>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setPaymentProof(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          </div>
        </section>

        {success && (
          <section className="rounded-xl border border-emerald-300/50 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-100">
            {success}
          </section>
        )}
      </main>

      <div className="fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-1.5rem)] max-w-[1200px] -translate-x-1/2 flex-col gap-3 rounded-2xl border border-slate-600 bg-slate-950/95 px-4 py-3 shadow-[0_18px_40px_rgba(2,6,23,0.45)] backdrop-blur md:flex-row md:items-center md:justify-between">
        <div className="text-sm font-black text-slate-100 md:text-base">
          {showTotal ? `Total: ${formatRupiah(totalAmount)}` : 'Lengkapi kontak & data rider'}
        </div>
        <button
          type="button"
          disabled={submitting}
          onClick={handleSubmit}
          className="inline-flex items-center justify-center rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-rose-400 disabled:cursor-not-allowed disabled:bg-rose-300"
        >
          {submitting ? 'Menyimpan...' : 'Kirim Pendaftaran'}
        </button>
      </div>
    </div>
  )
}

