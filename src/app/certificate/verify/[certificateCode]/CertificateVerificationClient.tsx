'use client'

import { useEffect, useState } from 'react'
import PublicTopbar from '@/src/components/PublicTopbar'

type CertificateData = {
  code: string
  issued_at: string
  revoked_at: string | null
  revoked_reason: string | null
  event_name: string
  event_date: string | null
  location: string | null
  rider_name: string
  category: string
  plate: string
  certificate_type: 'PARTICIPATION' | 'ACHIEVEMENT'
  achievement: { position: number; finalClass: string; label: string } | null
}

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeStyle: 'short' }).format(date)
}

export default function CertificateVerificationClient({ certificateCode }: { certificateCode: string }) {
  const [certificate, setCertificate] = useState<CertificateData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await fetch(`/api/public/certificates/${encodeURIComponent(certificateCode)}`, { cache: 'no-store' })
        const json = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(json?.error || 'Sertifikat tidak ditemukan.')
        if (active) setCertificate(json.certificate as CertificateData)
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Sertifikat tidak dapat diverifikasi.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [certificateCode])

  return (
    <div className="public-page public-editorial-page min-h-screen bg-[#f5ecd7] text-[#1d0d07]">
      <PublicTopbar />
      <main className="mx-auto grid w-full max-w-[760px] gap-5 px-4 pb-20 pt-8 sm:px-6 md:pt-14">
        <section className="rounded-[2rem] border border-[#4f372b] bg-[#1d0d07] px-6 py-8 text-[#fff8e8] shadow-[0_28px_70px_rgba(55,23,9,0.24)] sm:px-9">
          <div className="text-xs font-black uppercase tracking-[0.18em] text-[#f3c63d]">Verifikasi E-Sertifikat</div>
          <h1 className="mt-3 text-3xl font-black md:text-5xl">{loading ? 'Memeriksa sertifikat...' : error ? 'Sertifikat tidak valid' : 'Sertifikat terverifikasi'}</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-[#c9b7a5]">Certificate ID: {certificateCode}</p>
        </section>

        {loading && <div className="rounded-2xl border border-[#dfd1b8] bg-[#fff8e8] p-6 text-sm font-bold">Memuat data sertifikat...</div>}
        {error && <div className="rounded-2xl border border-[#ef9a9a] bg-[#ffe1e1] p-6 text-sm font-bold text-[#a61919]">{error}</div>}
        {certificate && (
          <section className="grid gap-5 rounded-[1.5rem] border border-[#bde5ca] bg-[#f4fff7] p-6 shadow-[0_18px_44px_rgba(55,23,9,0.1)] sm:p-8">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-[#16834a] text-xl font-black text-white">✓</span>
              <div>
                <div className="text-xs font-black uppercase tracking-[0.14em] text-[#16834a]">Valid</div>
                <div className="text-sm font-semibold text-[#496457]">Diterbitkan {formatDateTime(certificate.issued_at)}</div>
              </div>
            </div>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="font-black uppercase tracking-[0.1em] text-[#6d6156]">Rider</dt><dd className="mt-1 text-lg font-black">{certificate.rider_name}</dd></div>
              <div><dt className="font-black uppercase tracking-[0.1em] text-[#6d6156]">Event</dt><dd className="mt-1 text-lg font-black">{certificate.event_name}</dd></div>
              <div><dt className="font-black uppercase tracking-[0.1em] text-[#6d6156]">Kategori</dt><dd className="mt-1 font-bold">{certificate.category}</dd></div>
              <div><dt className="font-black uppercase tracking-[0.1em] text-[#6d6156]">Nomor Rider</dt><dd className="mt-1 font-bold">{certificate.plate}</dd></div>
              <div><dt className="font-black uppercase tracking-[0.1em] text-[#6d6156]">Tanggal Event</dt><dd className="mt-1 font-bold">{certificate.event_date || '-'}</dd></div>
              <div><dt className="font-black uppercase tracking-[0.1em] text-[#6d6156]">Lokasi</dt><dd className="mt-1 font-bold">{certificate.location || '-'}</dd></div>
              {certificate.achievement && <div><dt className="font-black uppercase tracking-[0.1em] text-[#6d6156]">Prestasi</dt><dd className="mt-1 font-bold">{certificate.achievement.label}</dd></div>}
            </dl>
          </section>
        )}
      </main>
    </div>
  )
}
