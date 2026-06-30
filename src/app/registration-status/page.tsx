'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import PublicTopbar from '../../components/PublicTopbar'
import { buildQrCodeUrl } from '../../lib/publicLinks'

type RegistrationStatusData = {
  registration_code: string
  contact_name: string
  community_name: string | null
  total_amount: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  created_at: string
  attendance_status: 'UNCONFIRMED' | 'ATTENDING' | 'NOT_ATTENDING'
  attendance_confirmed_at: string | null
  can_confirm_attendance: boolean
  attendance_message: string
  checked_in_at: string | null
  goodie_bag_collected_at: string | null
  event_name: string
  event_date: string | null
  payment_status: 'NO_PAYMENT' | 'PENDING' | 'APPROVED' | 'REJECTED'
  riders: Array<{
    name: string
    nickname: string | null
    plate: string
    status: string
    category: string
    venue_status: 'UNMARKED' | 'CHECKED_IN' | 'NOT_ATTENDING'
    checked_in_at: string | null
    goodie_bag_collected_at: string | null
  }>
}

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)

const buildRegistrationStatusUrl = (registrationCode: string) =>
  `https://racepushbike.com/registration-status?code=${encodeURIComponent(registrationCode)}`

const registrationStatusLabel = {
  PENDING: 'Menunggu Verifikasi',
  APPROVED: 'Pendaftaran Disetujui',
  REJECTED: 'Pendaftaran Ditolak',
} as const

const paymentStatusLabel = {
  NO_PAYMENT: 'Belum ada pembayaran',
  PENDING: 'Menunggu verifikasi pembayaran',
  APPROVED: 'Pembayaran diterima',
  REJECTED: 'Pembayaran perlu diperbaiki',
} as const

const attendanceStatusLabel = {
  UNCONFIRMED: 'Belum Konfirmasi',
  ATTENDING: 'Hadir',
  NOT_ATTENDING: 'Tidak Hadir',
} as const

const statusClass = (status: string) => {
  if (status === 'APPROVED') return 'border-[#9bc9ae] bg-[#e3f3e6] text-[#087443]'
  if (status === 'REJECTED') return 'border-[#ef9a9a] bg-[#ffe1e1] text-[#a61919]'
  return 'border-[#efd289] bg-[#fff2c9] text-[#8a5700]'
}

const attendanceClass = (status: RegistrationStatusData['attendance_status']) => {
  if (status === 'ATTENDING') return 'border-[#9bc9ae] bg-[#e3f3e6] text-[#087443]'
  if (status === 'NOT_ATTENDING') return 'border-[#ef9a9a] bg-[#ffe1e1] text-[#a61919]'
  return 'border-[#efd289] bg-[#fff2c9] text-[#8a5700]'
}

const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Jakarta',
      }).format(new Date(value))
    : null

export default function RegistrationStatusPage() {
  const [registrationCode, setRegistrationCode] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [result, setResult] = useState<RegistrationStatusData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [attendanceSaving, setAttendanceSaving] = useState<'ATTENDING' | 'NOT_ATTENDING' | null>(null)

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code')?.trim().toUpperCase()
    if (code) setRegistrationCode(code.slice(0, 19))
  }, [])

  const checkStatus = async () => {
    setError('')
    setResult(null)
    setLoading(true)
    try {
      const response = await fetch('/api/public/registration-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registration_code: registrationCode,
          contact_phone: contactPhone,
        }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json?.error || 'Status pendaftaran gagal dimuat.')
      setResult(json.data as RegistrationStatusData)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Status pendaftaran gagal dimuat.')
    } finally {
      setLoading(false)
    }
  }

  const confirmAttendance = async (attendanceStatus: 'ATTENDING' | 'NOT_ATTENDING') => {
    if (!result) return
    setError('')
    setAttendanceSaving(attendanceStatus)
    try {
      const response = await fetch('/api/public/registration-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registration_code: result.registration_code,
          contact_phone: contactPhone,
          attendance_status: attendanceStatus,
        }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json?.error || 'Konfirmasi kehadiran gagal disimpan.')
      setResult(json.data as RegistrationStatusData)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Konfirmasi kehadiran gagal disimpan.')
    } finally {
      setAttendanceSaving(null)
    }
  }

  return (
    <div className="public-page public-editorial-page min-h-screen bg-[#f5ecd7] text-[#1d0d07]">
      <PublicTopbar />
      <main className="mx-auto grid w-full max-w-[900px] gap-5 px-4 pb-20 pt-6 sm:px-6 md:pt-10">
        <section className="rounded-[2rem] border border-[#4f372b] bg-[#1d0d07] px-5 py-7 text-[#fff8e8] shadow-[0_28px_70px_rgba(55,23,9,0.24)] sm:px-8">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-[#f3c63d]">Status Pendaftaran</div>
          <h1 className="mt-3 text-3xl font-black md:text-5xl">Cek pendaftaran rider</h1>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[#c9b7a5] md:text-base">
            Masukkan kode registrasi dan nomor WhatsApp wali yang digunakan saat mendaftar.
          </p>
        </section>

        <section className="rounded-[1.5rem] border border-[#dfd1b8] bg-[#fff8e8] p-5 shadow-[0_18px_44px_rgba(55,23,9,0.1)]">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-xs font-black uppercase text-[#5f4638]">
              Kode Registrasi
              <input
                value={registrationCode}
                onChange={(event) => setRegistrationCode(event.target.value.toUpperCase().slice(0, 19))}
                placeholder="RPB-260622-1A2B3C4D"
                className="w-full rounded-2xl border border-[#d9c9ae] bg-white px-4 py-3.5 text-sm font-semibold normal-case text-[#1d0d07] shadow-inner shadow-[#e9dcc4] placeholder:text-[#9a8774] focus:border-[#e84b16] focus:outline-none focus:ring-2 focus:ring-[#e84b16]/20"
              />
            </label>
            <label className="grid gap-2 text-xs font-black uppercase text-[#5f4638]">
              Nomor WhatsApp
              <input
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value.replace(/[^\d+\s()-]/g, '').slice(0, 24))}
                placeholder="Contoh: 0812..."
                inputMode="tel"
                className="w-full rounded-2xl border border-[#d9c9ae] bg-white px-4 py-3.5 text-sm font-semibold normal-case text-[#1d0d07] shadow-inner shadow-[#e9dcc4] placeholder:text-[#9a8774] focus:border-[#e84b16] focus:outline-none focus:ring-2 focus:ring-[#e84b16]/20"
              />
            </label>
          </div>
          {error && (
            <div className="mt-4 rounded-xl border border-[#ef9a9a] bg-[#ffe1e1] px-4 py-3 text-sm font-bold text-[#a61919]">
              {error}
            </div>
          )}
          <button
            type="button"
            disabled={loading || !registrationCode.trim() || !contactPhone.trim()}
            onClick={checkStatus}
            className="mt-5 inline-flex min-h-[52px] w-full items-center justify-center rounded-full bg-[#f3c63d] px-7 py-3 text-sm font-black uppercase text-[#1d0d07] hover:bg-[#ffda5a] disabled:cursor-not-allowed disabled:opacity-50 md:w-auto md:min-w-[240px]"
          >
            {loading ? 'Memeriksa...' : 'Cek Status'}
          </button>
        </section>

        {result && (
          <section className="grid gap-4 rounded-[1.5rem] border border-[#dfd1b8] bg-[#fff8e8] p-5 shadow-[0_18px_44px_rgba(55,23,9,0.1)] sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.14em] text-[#e84b16]">{result.event_name}</div>
                <h2 className="mt-1 text-2xl font-black">{result.registration_code}</h2>
                <p className="mt-1 text-sm font-semibold text-[#796657]">
                  {result.contact_name}{result.community_name ? ` · ${result.community_name}` : ''}
                </p>
              </div>
              <span className={`w-fit rounded-full border px-4 py-2 text-xs font-black uppercase ${statusClass(result.status)}`}>
                {registrationStatusLabel[result.status]}
              </span>
            </div>

            <div className="grid gap-3 rounded-2xl border border-[#d9c9ae] bg-[#f8eedb] p-4 sm:grid-cols-2">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#796657]">Pembayaran</div>
                <div className="mt-1 font-black">{paymentStatusLabel[result.payment_status]}</div>
              </div>
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#796657]">Total</div>
                <div className="mt-1 font-black text-[#087443]">{formatRupiah(result.total_amount)}</div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#d9c9ae] bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#796657]">
                    Konfirmasi Kehadiran
                  </div>
                  <div className={`mt-2 w-fit rounded-full border px-3 py-1 text-xs font-black uppercase ${attendanceClass(result.attendance_status)}`}>
                    {attendanceStatusLabel[result.attendance_status]}
                  </div>
                  {result.attendance_confirmed_at && (
                    <p className="mt-2 text-xs font-semibold text-[#796657]">
                      Dikonfirmasi pada {formatDateTime(result.attendance_confirmed_at)}
                    </p>
                  )}
                  <p className="mt-2 text-sm font-semibold leading-6 text-[#58493d]">{result.attendance_message}</p>
                </div>
                {result.can_confirm_attendance && (
                  <div className="grid gap-2 sm:min-w-[260px]">
                    <button
                      type="button"
                      disabled={attendanceSaving !== null}
                      onClick={() => void confirmAttendance('ATTENDING')}
                      className="rounded-full bg-[#087443] px-5 py-3 text-sm font-black uppercase text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {attendanceSaving === 'ATTENDING' ? 'Menyimpan...' : 'Saya Akan Hadir'}
                    </button>
                    <button
                      type="button"
                      disabled={attendanceSaving !== null}
                      onClick={() => void confirmAttendance('NOT_ATTENDING')}
                      className="rounded-full border border-[#ef9a9a] bg-[#ffe1e1] px-5 py-3 text-sm font-black uppercase text-[#a61919] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {attendanceSaving === 'NOT_ATTENDING' ? 'Menyimpan...' : 'Tidak Hadir'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className={`rounded-2xl border p-4 ${result.checked_in_at ? 'border-[#9bc9ae] bg-[#e3f3e6]' : 'border-[#d9c9ae] bg-white'}`}>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#796657]">Check-in Venue</div>
                <div className={`mt-1 font-black ${result.checked_in_at ? 'text-[#087443]' : 'text-[#58493d]'}`}>
                  {result.checked_in_at ? `Sudah · ${formatDateTime(result.checked_in_at)}` : 'Belum check-in'}
                </div>
              </div>
              <div className={`rounded-2xl border p-4 ${result.goodie_bag_collected_at ? 'border-[#9bc9ae] bg-[#e3f3e6]' : 'border-[#d9c9ae] bg-white'}`}>
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#796657]">Goodie Bag</div>
                <div className={`mt-1 font-black ${result.goodie_bag_collected_at ? 'text-[#087443]' : 'text-[#58493d]'}`}>
                  {result.goodie_bag_collected_at
                    ? `Sudah diambil · ${formatDateTime(result.goodie_bag_collected_at)}`
                    : 'Belum diambil'}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[#d9c9ae] bg-[#f8eedb] p-4 text-center">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[#796657]">QR Pendaftaran</div>
              <div className="mx-auto mt-3 w-fit rounded-2xl border border-[#d9c9ae] bg-white p-3 shadow-sm">
                <Image
                  src={buildQrCodeUrl(buildRegistrationStatusUrl(result.registration_code), 220)}
                  alt={`QR status pendaftaran ${result.registration_code}`}
                  width={220}
                  height={220}
                  className="h-[180px] w-[180px] sm:h-[220px] sm:w-[220px]"
                />
              </div>
              <p className="mt-2 text-xs font-semibold text-[#796657]">
                Simpan QR ini untuk akses status dan proses check-in berikutnya.
              </p>
            </div>

            <div className="grid gap-3">
              <div className="text-xs font-black uppercase text-[#5f4638]">Rider Terdaftar</div>
              {result.riders.map((rider, index) => (
                <div
                  key={`${rider.name}-${index}`}
                  className={`rounded-2xl border p-4 ${
                    rider.venue_status === 'CHECKED_IN'
                      ? 'border-[#9bc9ae] bg-[#e3f3e6]'
                      : rider.venue_status === 'NOT_ATTENDING'
                        ? 'border-[#ef9a9a] bg-[#ffe1e1]'
                        : 'border-[#e2d5bd] bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-black">{index + 1}. {rider.name}</div>
                      <div className="mt-1 text-xs font-semibold text-[#796657]">
                        {rider.nickname || 'Tanpa nama panggilan'} · {rider.category}
                      </div>
                      <div className="mt-2 text-xs font-black uppercase">
                        {rider.venue_status === 'CHECKED_IN'
                          ? 'Sudah check-in'
                          : rider.venue_status === 'NOT_ATTENDING'
                            ? 'Tidak hadir'
                            : 'Belum diproses di venue'}
                      </div>
                      {rider.goodie_bag_collected_at && (
                        <div className="mt-1 text-xs font-bold text-[#8a5700]">Goodie bag sudah diambil</div>
                      )}
                    </div>
                    <span className="rounded-full border border-[#d9c9ae] bg-[#efe2c7] px-3 py-1 text-xs font-black">
                      Plate {rider.plate}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
