'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../../../lib/supabaseClient'

type CheckInRegistration = {
  id: string
  registration_code: string
  contact_name: string
  contact_phone: string
  community_name: string | null
  total_amount: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  attendance_status: 'UNCONFIRMED' | 'ATTENDING' | 'NOT_ATTENDING'
  attendance_confirmed_at: string | null
  checked_in_at: string | null
  goodie_bag_collected_at: string | null
  registration_items: Array<{
    rider_name: string
    rider_nickname: string | null
    requested_plate_number: string | null
    requested_plate_suffix: string | null
    categories: { label: string | null } | Array<{ label: string | null }> | null
  }>
  registration_payments: Array<{ status: string }>
}

type BarcodeDetectorInstance = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>
}

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance

const formatDateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Jakarta',
      }).format(new Date(value))
    : '-'

const extractRegistrationCode = (value: string) => {
  const raw = value.trim()
  try {
    return new URL(raw).searchParams.get('code')?.trim().toUpperCase() ?? raw.toUpperCase()
  } catch {
    return raw.toUpperCase()
  }
}

const getCategoryLabel = (value: CheckInRegistration['registration_items'][number]['categories']) =>
  Array.isArray(value) ? value[0]?.label ?? '-' : value?.label ?? '-'

const attendanceStatusLabel = {
  UNCONFIRMED: 'Belum Konfirmasi',
  ATTENDING: 'Hadir',
  NOT_ATTENDING: 'Tidak Hadir',
} as const

const attendanceClass = (status: CheckInRegistration['attendance_status']) => {
  if (status === 'ATTENDING') return 'border-emerald-300 bg-emerald-100 text-emerald-900'
  if (status === 'NOT_ATTENDING') return 'border-rose-300 bg-rose-100 text-rose-900'
  return 'border-amber-300 bg-amber-100 text-amber-900'
}

export default function CheckInClient({ eventId }: { eventId: string }) {
  const [eventName, setEventName] = useState('Event')
  const [code, setCode] = useState('')
  const [registration, setRegistration] = useState<CheckInRegistration | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<'CHECK_IN' | 'GOODIE_BAG_COLLECTED' | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [scannerActive, setScannerActive] = useState(false)
  const [scannerSupported, setScannerSupported] = useState(true)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanFrameRef = useRef<number | null>(null)
  const scanLockedRef = useRef(false)

  useEffect(() => {
    fetch(`/api/events/${eventId}`)
      .then((response) => response.json())
      .then((json) => setEventName(json?.data?.name || 'Event'))
      .catch(() => setEventName('Event'))
  }, [eventId])

  const apiFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    const headers = new Headers(options.headers)
    if (token) headers.set('Authorization', `Bearer ${token}`)
    if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    const response = await fetch(url, { ...options, headers })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(json?.error || 'Permintaan gagal.')
    return json
  }, [])

  const stopScanner = useCallback(() => {
    if (scanFrameRef.current) cancelAnimationFrame(scanFrameRef.current)
    scanFrameRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setScannerActive(false)
    scanLockedRef.current = false
  }, [])

  useEffect(() => stopScanner, [stopScanner])

  const lookup = useCallback(
    async (rawCode: string) => {
      const normalizedCode = extractRegistrationCode(rawCode)
      if (!normalizedCode) return
      stopScanner()
      setCode(normalizedCode)
      setRegistration(null)
      setMessage(null)
      setLoading(true)
      try {
        const json = await apiFetch(
          `/api/admin/events/${eventId}/check-in?code=${encodeURIComponent(normalizedCode)}`
        )
        setRegistration(json.data as CheckInRegistration)
      } catch (error) {
        setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Pendaftaran tidak ditemukan.' })
      } finally {
        setLoading(false)
      }
    },
    [apiFetch, eventId, stopScanner]
  )

  const startScanner = async () => {
    setMessage(null)
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setScannerSupported(false)
      setMessage({ type: 'error', text: 'Scanner kamera tidak didukung browser ini. Masukkan kode secara manual.' })
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      video.srcObject = stream
      await video.play()
      setScannerActive(true)
      const detector = new Detector({ formats: ['qr_code'] })

      const scan = async () => {
        if (!videoRef.current || scanLockedRef.current) return
        try {
          const results = await detector.detect(videoRef.current)
          const value = results[0]?.rawValue
          if (value) {
            scanLockedRef.current = true
            await lookup(value)
            return
          }
        } catch {}
        scanFrameRef.current = requestAnimationFrame(scan)
      }
      scanFrameRef.current = requestAnimationFrame(scan)
    } catch {
      stopScanner()
      setMessage({ type: 'error', text: 'Kamera tidak dapat dibuka. Periksa izin kamera atau gunakan input manual.' })
    }
  }

  const processAction = async (action: 'CHECK_IN' | 'GOODIE_BAG_COLLECTED') => {
    if (!registration) return
    setSaving(action)
    setMessage(null)
    try {
      const json = await apiFetch(`/api/admin/events/${eventId}/check-in`, {
        method: 'PATCH',
        body: JSON.stringify({ registration_code: registration.registration_code, action }),
      })
      setRegistration(json.data as CheckInRegistration)
      setMessage({
        type: 'success',
        text:
          action === 'CHECK_IN'
            ? json.already_processed
              ? 'Rider sudah pernah check-in.'
              : 'Check-in venue berhasil.'
            : json.already_processed
              ? 'Goodie bag sudah pernah diambil.'
              : 'Pengambilan goodie bag berhasil dicatat.',
      })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Proses gagal.' })
    } finally {
      setSaving(null)
    }
  }

  const paymentApproved = registration?.registration_payments?.some((payment) => payment.status === 'APPROVED')
  const needsNotAttendingOverride = registration?.attendance_status === 'NOT_ATTENDING' && !registration.checked_in_at

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-950 md:p-6">
      <main className="mx-auto grid w-full max-w-4xl gap-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">Venue Operations</div>
              <h1 className="mt-1 text-3xl font-black">Check-in & Goodie Bag</h1>
              <p className="mt-2 text-sm font-semibold text-slate-600">{eventName}</p>
            </div>
            <Link
              href={`/admin/events/${eventId}/registrations`}
              className="w-fit rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-black uppercase hover:border-slate-950"
            >
              Kembali ke Registrasi
            </Link>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <form
            className="grid gap-3 sm:grid-cols-[1fr_auto]"
            onSubmit={(event) => {
              event.preventDefault()
              void lookup(code)
            }}
          >
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="Scan QR atau masukkan kode RPB-..."
              className="min-h-14 rounded-2xl border border-slate-300 bg-white px-4 text-base font-black uppercase outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
            />
            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="min-h-14 rounded-2xl bg-slate-950 px-6 text-sm font-black uppercase text-white disabled:opacity-50"
            >
              {loading ? 'Mencari...' : 'Cari'}
            </button>
          </form>

          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={scannerActive ? stopScanner : () => void startScanner()}
              className="rounded-full border border-amber-400 bg-amber-100 px-4 py-2 text-xs font-black uppercase text-amber-900"
            >
              {scannerActive ? 'Tutup Kamera' : 'Scan QR Kamera'}
            </button>
            {!scannerSupported && (
              <span className="self-center text-xs font-semibold text-slate-500">Gunakan input kode manual.</span>
            )}
          </div>

          <div className={scannerActive ? 'mt-4 overflow-hidden rounded-2xl bg-black' : 'hidden'}>
            <video ref={videoRef} muted playsInline className="aspect-video w-full object-cover" />
          </div>

          {message && (
            <div
              className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${
                message.type === 'success'
                  ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
                  : 'border-rose-300 bg-rose-100 text-rose-900'
              }`}
            >
              {message.text}
            </div>
          )}
        </section>

        {registration && (
          <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  {registration.registration_code}
                </div>
                <h2 className="mt-1 text-2xl font-black">{registration.contact_name}</h2>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {registration.community_name || 'Tanpa komunitas'} · {registration.contact_phone}
                </p>
              </div>
              <span
                className={`w-fit rounded-full border px-4 py-2 text-xs font-black uppercase ${
                  registration.status === 'APPROVED'
                    ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
                    : 'border-rose-300 bg-rose-100 text-rose-900'
                }`}
              >
                {registration.status}
              </span>
            </div>

            {!paymentApproved && (
              <div className="rounded-2xl border border-amber-300 bg-amber-100 px-4 py-3 text-sm font-bold text-amber-900">
                Pembayaran belum berstatus APPROVED. Periksa kembali sebelum menyerahkan goodie bag.
              </div>
            )}

            {needsNotAttendingOverride && (
              <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900">
                Wali sebelumnya memilih Tidak Hadir. Jika rider tetap datang di venue, panitia boleh lanjut
                check-in setelah memastikan data rider dan pembayaran sudah sesuai.
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className={`rounded-2xl border p-4 ${attendanceClass(registration.attendance_status)}`}>
                <div className="text-xs font-black uppercase opacity-75">Konfirmasi Kehadiran</div>
                <div className="mt-2 font-black">{attendanceStatusLabel[registration.attendance_status]}</div>
                {registration.attendance_confirmed_at && (
                  <div className="mt-1 text-xs font-semibold">
                    {formatDateTime(registration.attendance_confirmed_at)}
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-black uppercase text-slate-500">Check-in Venue</div>
                <div className="mt-2 font-black">
                  {registration.checked_in_at ? `Sudah · ${formatDateTime(registration.checked_in_at)}` : 'Belum check-in'}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-black uppercase text-slate-500">Goodie Bag</div>
                <div className="mt-2 font-black">
                  {registration.goodie_bag_collected_at
                    ? `Sudah diambil · ${formatDateTime(registration.goodie_bag_collected_at)}`
                    : 'Belum diambil'}
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              {registration.registration_items.map((rider, index) => (
                <div key={`${rider.rider_name}-${index}`} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-black">{index + 1}. {rider.rider_name}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-600">
                        {rider.rider_nickname || '-'} · {getCategoryLabel(rider.categories)}
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">
                      Plate {rider.requested_plate_number ?? '-'}{rider.requested_plate_suffix ?? ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={saving !== null || registration.status !== 'APPROVED' || Boolean(registration.checked_in_at)}
                onClick={() => void processAction('CHECK_IN')}
                className="min-h-14 rounded-2xl bg-emerald-600 px-5 text-sm font-black uppercase text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {saving === 'CHECK_IN'
                  ? 'Memproses...'
                  : registration.checked_in_at
                    ? 'Sudah Check-in'
                    : needsNotAttendingOverride
                      ? 'Tetap Check-in Venue'
                      : 'Check-in Venue'}
              </button>
              <button
                type="button"
                disabled={
                  saving !== null ||
                  registration.status !== 'APPROVED' ||
                  !registration.checked_in_at ||
                  Boolean(registration.goodie_bag_collected_at)
                }
                onClick={() => void processAction('GOODIE_BAG_COLLECTED')}
                className="min-h-14 rounded-2xl bg-amber-400 px-5 text-sm font-black uppercase text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {saving === 'GOODIE_BAG_COLLECTED'
                  ? 'Memproses...'
                  : registration.goodie_bag_collected_at
                    ? 'Goodie Bag Sudah Diambil'
                    : 'Tandai Goodie Bag Diambil'}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
