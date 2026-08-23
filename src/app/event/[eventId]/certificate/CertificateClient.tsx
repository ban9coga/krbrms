'use client'

import { useState } from 'react'
import PublicTopbar from '@/src/components/PublicTopbar'

type CertificateRider = {
  id: string
  name: string
  category: string
  plate: string
  achievement: { position: number; finalClass: string; label: string } | null
}

type CertificateLookup = {
  event_name: string
  event_date: string | null
  registration_code: string
  achievement_enabled: boolean
  riders: CertificateRider[]
  access_token: string
  access_expires_at: string
}

export default function CertificateClient({ eventId }: { eventId: string }) {
  const [registrationCode, setRegistrationCode] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [result, setResult] = useState<CertificateLookup | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadedCertificateCode, setDownloadedCertificateCode] = useState<string | null>(null)

  const verify = async () => {
    setError('')
    setResult(null)
    setLoading(true)
    try {
      const response = await fetch(`/api/public/events/${eventId}/certificate/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration_code: registrationCode, contact_phone: contactPhone }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(json?.error || 'Sertifikat gagal diverifikasi.')
      setResult(json.data as CertificateLookup)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sertifikat gagal diverifikasi.')
    } finally {
      setLoading(false)
    }
  }

  const download = async (rider: CertificateRider, certificateType: 'PARTICIPATION' | 'ACHIEVEMENT') => {
    setError('')
    setDownloadingId(`${rider.id}:${certificateType}`)
    try {
      const response = await fetch(`/api/public/events/${eventId}/certificate/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          access_token: result?.access_token,
          registration_item_id: rider.id,
          certificate_type: certificateType,
        }),
      })
      if (!response.ok) {
        const json = await response.json().catch(() => ({}))
        if (response.status === 401) setResult(null)
        throw new Error(json?.error || 'PDF sertifikat gagal dibuat.')
      }
      const blob = await response.blob()
      setDownloadedCertificateCode(response.headers.get('X-Certificate-Code'))
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `e-sertifikat-${rider.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${certificateType.toLowerCase()}.pdf`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'PDF sertifikat gagal dibuat.')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="public-page public-editorial-page min-h-screen bg-[#f5ecd7] text-[#1d0d07]">
      <PublicTopbar />
      <main className="mx-auto grid w-full max-w-[900px] gap-5 px-4 pb-20 pt-6 sm:px-6 md:pt-10">
        <section className="rounded-[2rem] border border-[#4f372b] bg-[#1d0d07] px-5 py-7 text-[#fff8e8] shadow-[0_28px_70px_rgba(55,23,9,0.24)] sm:px-8">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-[#f3c63d]">E-Sertifikat</div>
          <h1 className="mt-3 text-3xl font-black md:text-5xl">Unduh sertifikat rider</h1>
          <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-[#c9b7a5] md:text-base">
            Masukkan nomor registrasi dan nomor WhatsApp wali yang digunakan saat mendaftar. Setelah cocok, pilih sertifikat untuk setiap rider.
          </p>
        </section>

        <section className="rounded-[1.5rem] border border-[#dfd1b8] bg-[#fff8e8] p-5 shadow-[0_18px_44px_rgba(55,23,9,0.1)]">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-xs font-black uppercase text-[#5f4638]">
              Nomor Registrasi
              <input value={registrationCode} onChange={(event) => setRegistrationCode(event.target.value.toUpperCase().slice(0, 24))} placeholder="RPB-260622-1A2B3C4D" className="w-full rounded-2xl border border-[#d9c9ae] bg-white px-4 py-3.5 text-sm font-semibold normal-case text-[#1d0d07] shadow-inner shadow-[#e9dcc4] placeholder:text-[#9a8774] focus:border-[#e84b16] focus:outline-none focus:ring-2 focus:ring-[#e84b16]/20" />
            </label>
            <label className="grid gap-2 text-xs font-black uppercase text-[#5f4638]">
              Nomor WhatsApp Wali
              <input value={contactPhone} onChange={(event) => setContactPhone(event.target.value.replace(/[^\d+\s()-]/g, '').slice(0, 24))} placeholder="Contoh: 0812..." inputMode="tel" className="w-full rounded-2xl border border-[#d9c9ae] bg-white px-4 py-3.5 text-sm font-semibold normal-case text-[#1d0d07] shadow-inner shadow-[#e9dcc4] placeholder:text-[#9a8774] focus:border-[#e84b16] focus:outline-none focus:ring-2 focus:ring-[#e84b16]/20" />
            </label>
          </div>
          {error && <div className="mt-4 rounded-xl border border-[#ef9a9a] bg-[#ffe1e1] px-4 py-3 text-sm font-bold text-[#a61919]">{error}</div>}
          <button type="button" disabled={loading || !registrationCode.trim() || !contactPhone.trim()} onClick={() => void verify()} className="mt-5 inline-flex min-h-[52px] w-full items-center justify-center rounded-full bg-[#f3c63d] px-7 py-3 text-sm font-black uppercase text-[#1d0d07] hover:bg-[#ffda5a] disabled:cursor-not-allowed disabled:opacity-50 md:w-auto md:min-w-[240px]">
            {loading ? 'Memverifikasi...' : 'Lihat Sertifikat'}
          </button>
        </section>

        {result && (
          <section className="grid gap-4 rounded-[1.5rem] border border-[#dfd1b8] bg-[#fff8e8] p-5 shadow-[0_18px_44px_rgba(55,23,9,0.1)] sm:p-6">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.14em] text-[#e84b16]">{result.event_name}</div>
              <h2 className="mt-1 text-2xl font-black">Pilih rider</h2>
              <p className="mt-1 text-sm font-semibold text-[#796657]">Registrasi {result.registration_code}</p>
            </div>
            {downloadedCertificateCode && <div className="rounded-2xl border border-[#bde5ca] bg-[#f4fff7] px-4 py-3 text-sm font-bold text-[#14532d]">Certificate ID: {downloadedCertificateCode}. QR pada PDF dapat digunakan untuk membuka halaman verifikasi.</div>}
            <div className="grid gap-3">
              {result.riders.map((rider) => (
                <article key={rider.id} className="flex flex-col gap-3 rounded-2xl border border-[#d9c9ae] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-black">{rider.name}</h3>
                    <p className="mt-1 text-sm font-semibold text-[#796657]">{rider.category} - No. Plat {rider.plate}</p>
                    {result.achievement_enabled && rider.achievement && <p className="mt-1 text-xs font-black uppercase tracking-wide text-[#a34a0a]">{rider.achievement.label}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={downloadingId !== null} onClick={() => void download(rider, 'PARTICIPATION')} className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#1d0d07] px-5 py-3 text-xs font-black uppercase text-[#fff8e8] hover:bg-[#3e2113] disabled:cursor-wait disabled:opacity-60">
                      {downloadingId === `${rider.id}:PARTICIPATION` ? 'Membuat PDF...' : 'Sertifikat Partisipasi'}
                    </button>
                    {result.achievement_enabled && rider.achievement && <button type="button" disabled={downloadingId !== null} onClick={() => void download(rider, 'ACHIEVEMENT')} className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#e84b16] px-5 py-3 text-xs font-black uppercase text-white hover:bg-[#c63b0b] disabled:cursor-wait disabled:opacity-60">
                      {downloadingId === `${rider.id}:ACHIEVEMENT` ? 'Membuat PDF...' : 'Sertifikat Prestasi'}
                    </button>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
