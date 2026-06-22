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
    id: string
    rider_name: string
    rider_nickname: string | null
    requested_plate_number: string | null
    requested_plate_suffix: string | null
    venue_status: 'UNMARKED' | 'CHECKED_IN' | 'NOT_ATTENDING'
    checked_in_at: string | null
    goodie_bag_collected_at: string | null
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
  const [saving, setSaving] = useState<string | null>(null)
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

  const processAction = async (
    action: 'CHECK_IN' | 'NOT_ATTENDING' | 'GOODIE_BAG_COLLECTED',
    registrationItemId?: string,
    applyToAll = false
  ) => {
    if (!registration) return
    const savingKey = applyToAll ? `${action}:ALL` : `${action}:${registrationItemId}`
    setSaving(savingKey)
    setMessage(null)
    try {
      const json = await apiFetch(`/api/admin/events/${eventId}/check-in`, {
        method: 'PATCH',
        body: JSON.stringify({
          registration_code: registration.registration_code,
          registration_item_id: registrationItemId,
          apply_to_all: applyToAll,
          action,
        }),
      })
      setRegistration(json.data as CheckInRegistration)
      setMessage({
        type: 'success',
        text:
          action === 'CHECK_IN'
            ? `${json.processed_count ?? 1} rider berhasil check-in.`
            : action === 'NOT_ATTENDING'
              ? 'Rider ditandai tidak hadir.'
              : `Goodie bag untuk ${json.processed_count ?? 1} rider berhasil dicatat.`,
      })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Proses gagal.' })
    } finally {
      setSaving(null)
    }
  }

  const paymentApproved = registration?.registration_payments?.some((payment) => payment.status === 'APPROVED')
  const checkedInCount =
    registration?.registration_items.filter((item) => item.venue_status === 'CHECKED_IN').length ?? 0
  const notAttendingCount =
    registration?.registration_items.filter((item) => item.venue_status === 'NOT_ATTENDING').length ?? 0
  const unmarkedCount =
    registration?.registration_items.filter((item) => item.venue_status === 'UNMARKED').length ?? 0
  const goodieBagCount =
    registration?.registration_items.filter((item) => Boolean(item.goodie_bag_collected_at)).length ?? 0
  const needsNotAttendingOverride = registration?.attendance_status === 'NOT_ATTENDING' && checkedInCount === 0

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

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className={`rounded-2xl border p-4 ${attendanceClass(registration.attendance_status)}`}>
                <div className="text-xs font-black uppercase opacity-75">Konfirmasi Wali</div>
                <div className="mt-2 font-black">{attendanceStatusLabel[registration.attendance_status]}</div>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="text-xs font-black uppercase text-emerald-700">Rider Hadir</div>
                <div className="mt-2 text-2xl font-black text-emerald-900">{checkedInCount}</div>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                <div className="text-xs font-black uppercase text-rose-700">Tidak Hadir</div>
                <div className="mt-2 text-2xl font-black text-rose-900">{notAttendingCount}</div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <div className="text-xs font-black uppercase text-amber-700">Goodie Bag</div>
                <div className="mt-2 text-2xl font-black text-amber-900">
                  {goodieBagCount}/{registration.registration_items.length}
                </div>
              </div>
            </div>

            {registration.status === 'APPROVED' && (
              <div className="grid gap-3 sm:grid-cols-2">
                {unmarkedCount > 0 && (
                  <button
                    type="button"
                    disabled={saving !== null}
                    onClick={() => void processAction('CHECK_IN', undefined, true)}
                    className="min-h-12 rounded-2xl bg-emerald-600 px-5 text-sm font-black uppercase text-white disabled:bg-slate-300"
                  >
                    {saving === 'CHECK_IN:ALL' ? 'Memproses...' : `Check-in Semua (${unmarkedCount})`}
                  </button>
                )}
                {checkedInCount > goodieBagCount && (
                  <button
                    type="button"
                    disabled={saving !== null}
                    onClick={() => void processAction('GOODIE_BAG_COLLECTED', undefined, true)}
                    className="min-h-12 rounded-2xl bg-amber-400 px-5 text-sm font-black uppercase text-slate-950 disabled:bg-slate-300"
                  >
                    {saving === 'GOODIE_BAG_COLLECTED:ALL'
                      ? 'Memproses...'
                      : `Goodie Bag Semua Rider Hadir (${checkedInCount - goodieBagCount})`}
                  </button>
                )}
              </div>
            )}

            <div className="grid gap-3">
              {registration.registration_items.map((rider, index) => (
                <div
                  key={rider.id}
                  className={`rounded-2xl border p-4 ${
                    rider.venue_status === 'CHECKED_IN'
                      ? 'border-emerald-300 bg-emerald-50'
                      : rider.venue_status === 'NOT_ATTENDING'
                        ? 'border-rose-300 bg-rose-50'
                        : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-black">{index + 1}. {rider.rider_name}</div>
                        <span className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[10px] font-black uppercase">
                          {rider.venue_status === 'CHECKED_IN'
                            ? 'Sudah Check-in'
                            : rider.venue_status === 'NOT_ATTENDING'
                              ? 'Tidak Hadir'
                              : 'Belum Diproses'}
                        </span>
                      </div>
                      <div className="mt-1 text-xs font-semibold text-slate-600">
                        {rider.rider_nickname || '-'} · {getCategoryLabel(rider.categories)}
                      </div>
                      {rider.checked_in_at && (
                        <div className="mt-2 text-xs font-bold text-emerald-800">
                          Check-in {formatDateTime(rider.checked_in_at)}
                        </div>
                      )}
                      {rider.goodie_bag_collected_at && (
                        <div className="mt-1 text-xs font-bold text-amber-800">
                          Goodie bag {formatDateTime(rider.goodie_bag_collected_at)}
                        </div>
                      )}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[390px]">
                      <span className="flex items-center justify-center rounded-xl bg-slate-100 px-3 py-2 text-xs font-black">
                        Plate {rider.requested_plate_number ?? '-'}{rider.requested_plate_suffix ?? ''}
                      </span>
                      {rider.venue_status !== 'CHECKED_IN' && (
                        <button
                          type="button"
                          disabled={saving !== null || registration.status !== 'APPROVED'}
                          onClick={() => void processAction('CHECK_IN', rider.id)}
                          className="min-h-11 rounded-xl bg-emerald-600 px-3 text-xs font-black uppercase text-white disabled:bg-slate-300"
                        >
                          {saving === `CHECK_IN:${rider.id}` ? 'Memproses...' : 'Check-in Rider'}
                        </button>
                      )}
                      {rider.venue_status === 'UNMARKED' && (
                        <button
                          type="button"
                          disabled={saving !== null || registration.status !== 'APPROVED'}
                          onClick={() => void processAction('NOT_ATTENDING', rider.id)}
                          className="min-h-11 rounded-xl border border-rose-300 bg-rose-100 px-3 text-xs font-black uppercase text-rose-900 disabled:bg-slate-200"
                        >
                          {saving === `NOT_ATTENDING:${rider.id}` ? 'Memproses...' : 'Tandai Tidak Hadir'}
                        </button>
                      )}
                      {rider.venue_status === 'CHECKED_IN' && !rider.goodie_bag_collected_at && (
                        <button
                          type="button"
                          disabled={saving !== null || registration.status !== 'APPROVED'}
                          onClick={() => void processAction('GOODIE_BAG_COLLECTED', rider.id)}
                          className="min-h-11 rounded-xl bg-amber-400 px-3 text-xs font-black uppercase text-slate-950 disabled:bg-slate-300"
                        >
                          {saving === `GOODIE_BAG_COLLECTED:${rider.id}` ? 'Memproses...' : 'Goodie Bag Diambil'}
                        </button>
                      )}
                    </div>
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
